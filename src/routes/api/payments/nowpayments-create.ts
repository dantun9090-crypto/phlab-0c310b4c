/**
 * POST /api/payments/nowpayments-create — NOWPayments hosted crypto invoice.
 *
 * Secondary payment option alongside Wallid Pay-by-Bank. The shopper pays in
 * BTC / ETH / USDT / … on NOWPayments' hosted invoice page; funds settle to our
 * payout wallet (USDT on Polygon) after auto-conversion. We never handle keys or
 * wallet addresses.
 *
 * Security model (identical to /api/payments/create):
 *   - Caller proves ownership with a Firebase ID token OR the one-time guest
 *     paymentToken minted at order creation.
 *   - The charge amount comes from the Firestore order via
 *     `buildOrderCtxForPayment` — NEVER from the request body. The body amount
 *     is compared only for defence in depth.
 *   - Admin kill switch (site_config/nowpayments) enforced server-side.
 *   - Rate limited per IP.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import { buildOrderCtxForPayment } from "@/lib/payments/dispatch.server";
import { updateDocAdmin, getDocAdmin } from "@/lib/server/firestore-admin";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import {
  createNowPaymentsInvoice,
  isNowPaymentsConfigured,
  NowPaymentsError,
} from "@/lib/nowpayments.server";

const SITE_ORIGIN = "https://phlabs.co.uk";

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096).optional().nullable(),
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  paymentToken: z.string().min(32).max(256).optional().nullable(),
  amount: z.number().positive().max(100000),
  currency: z.literal("GBP"),
  customerEmail: z.string().email().max(254),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
  });
}

export const Route = createFileRoute("/api/payments/nowpayments-create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const rl = checkRateLimit(ip, "nowpayments:create", 5, 60_000);
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);

        if (!isNowPaymentsConfigured()) {
          return json({ error: "Crypto payments are currently unavailable" }, 403);
        }

        // Admin on/off switch — enforced here so hiding the checkout tile
        // cannot be bypassed by calling this route directly.
        try {
          const cfg = await getDocAdmin("site_config", "nowpayments");
          if (!cfg || cfg["enabled"] !== true) {
            return json({ error: "Crypto payments are currently unavailable" }, 403);
          }
        } catch (err) {
          console.error("[NOWPayments] toggle read failed:", err);
          return json({ error: "Payment service unavailable" }, 503);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "Invalid payment details", details: parsed.error.flatten() }, 400);
        }
        const { idToken, orderId, paymentToken, amount: clientAmount, currency } = parsed.data;
        if (!idToken && !paymentToken) {
          return json({ error: "Authentication required" }, 401);
        }

        // 1) Authenticate caller.
        let user: { uid: string; email?: string | null } | null = null;
        if (idToken) {
          try {
            user = await verifyFirebaseIdToken(idToken);
          } catch {
            if (!paymentToken) return json({ error: "Authentication required" }, 401);
          }
        }
        if (!user && !paymentToken) {
          return json({ error: "Authentication required" }, 401);
        }

        // 2) Load the order, verify ownership + unsettled status.
        let ctx;
        try {
          ctx = await buildOrderCtxForPayment(
            orderId,
            user?.uid ?? null,
            user?.email ?? null,
            paymentToken,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[NOWPayments] order ctx build failed order=${orderId}: ${msg}`);
          if (/forbidden/i.test(msg)) return json({ error: "Forbidden", code: "ORDER_FORBIDDEN" }, 403);
          if (/not found/i.test(msg)) return json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, 404);
          if (/already settled/i.test(msg)) return json({ error: "Order already settled", code: "ORDER_SETTLED" }, 409);
          return json({ error: "Invalid order", code: "ORDER_INVALID" }, 400);
        }

        // 3) Defence-in-depth amount check.
        const dbMinor = Math.round(ctx.amountGbp * 100);
        const clientMinor = Math.round(clientAmount * 100);
        if (dbMinor !== clientMinor) {
          console.warn(
            `[NOWPayments] amount mismatch: order=${orderId} db=${dbMinor} client=${clientMinor} uid=${user?.uid ?? "guest-token"}`,
          );
          return json({ error: "Amount does not match order total" }, 400);
        }

        const withPt = (u: string) => (paymentToken ? `${u}&pt=${encodeURIComponent(paymentToken)}` : u);
        const successUrl = withPt(`${SITE_ORIGIN}/checkout/success?order_id=${encodeURIComponent(orderId)}`);
        const cancelUrl = withPt(`${SITE_ORIGIN}/checkout/cancel?order_id=${encodeURIComponent(orderId)}`);

        try {
          const invoice = await createNowPaymentsInvoice({
            amountMinor: dbMinor,
            currency,
            orderId,
            orderDescription: `PH Labs Order ${ctx.reference || orderId}`,
            successUrl,
            cancelUrl,
            partiallyPaidUrl: cancelUrl,
            ipnCallbackUrl: `${SITE_ORIGIN}/api/public/nowpayments-webhook`,
          });

          await updateDocAdmin("orders", orderId, {
            paymentProvider: "nowpayments",
            paymentRef: ctx.reference || orderId,
            nowpaymentsInvoiceId: invoice.id,
            nowpaymentsInvoiceUrl: invoice.invoiceUrl,
            nowpaymentsStatus: "waiting",
            paymentLinkCreatedAt: new Date(),
            ...(paymentToken ? { paymentTokenUsedAt: new Date() } : {}),
          }).catch((err) => console.error("[NOWPayments] order marker failed:", err));

          return json({
            payment_link: invoice.invoiceUrl,
            invoice_id: invoice.id,
          });
        } catch (err) {
          if (err instanceof NowPaymentsError) {
            return json({ error: err.userMessage }, err.status === 400 ? 400 : 502);
          }
          console.error("[NOWPayments] create unexpected error:", err);
          return json({ error: "Payment service unavailable" }, 502);
        }
      },
    },
  },
});
