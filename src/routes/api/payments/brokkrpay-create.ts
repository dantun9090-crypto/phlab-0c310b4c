/**
 * POST /api/payments/brokkrpay-create — BrokkrPay hosted card checkout.
 *
 * Secondary payment option alongside Wallid Pay-by-Bank. Card details are only
 * ever entered on BrokkrPay's hosted checkout page.
 *
 * Security model (identical to /api/payments/peptidepay-create):
 *   - Caller proves ownership with a Firebase ID token OR the one-time guest
 *     paymentToken minted at order creation.
 *   - The charge amount comes from the Firestore order via
 *     `buildOrderCtxForPayment` — NEVER from the request body. The body amount
 *     is only compared for defence-in-depth.
 *   - GBP pence are converted to WHOLE USD units (BrokkrPay rejects cents and
 *     only settles USD), rounding up, using the admin-set rate.
 *   - Rate limited per IP; Idempotency-Key = order id so a double-tap replays
 *     the original BrokkrPay order instead of creating a second one.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import { buildOrderCtxForPayment } from "@/lib/payments/dispatch.server";
import { updateDocAdmin, getDocAdmin } from "@/lib/server/firestore-admin";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import { clampUsdRate, gbpPenceToUsdWhole } from "@/lib/brokkrpay-amount";
import {
  createBrokkrPayLink,
  isBrokkrPayConfigured,
  brokkrPayMode,
  BrokkrPayError,
} from "@/lib/brokkrpay.server";

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

export const Route = createFileRoute("/api/payments/brokkrpay-create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const rl = checkRateLimit(ip, "brokkrpay:create", 5, 60_000);
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);

        if (!isBrokkrPayConfigured()) {
          return json({ error: "Card payments are currently unavailable" }, 403);
        }

        // Admin on/off switch + FX rate (site_config/brokkrpay). Enforced
        // server-side so hiding the checkout card cannot be bypassed.
        let usdRate: number;
        try {
          const cfg = await getDocAdmin("site_config", "brokkrpay");
          if (!cfg || cfg["enabled"] !== true) {
            return json({ error: "Card payments are currently unavailable" }, 403);
          }
          usdRate = clampUsdRate(cfg["usdRate"]);
        } catch (err) {
          console.error("[BrokkrPay] toggle read failed:", err);
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
        const { idToken, orderId, paymentToken, amount: clientAmount, customerEmail } = parsed.data;
        if (!idToken && !paymentToken) return json({ error: "Authentication required" }, 401);

        // 1) Authenticate caller.
        let user: { uid: string; email?: string | null } | null = null;
        if (idToken) {
          try {
            user = await verifyFirebaseIdToken(idToken);
          } catch {
            if (!paymentToken) return json({ error: "Authentication required" }, 401);
          }
        }
        if (!user && !paymentToken) return json({ error: "Authentication required" }, 401);

        // 2) Load the order, verify ownership + unsettled status.
        let ctx;
        try {
          ctx = await buildOrderCtxForPayment(orderId, user?.uid ?? null, user?.email ?? null, paymentToken);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[BrokkrPay] order ctx build failed order=${orderId}: ${msg}`);
          if (/forbidden/i.test(msg)) return json({ error: "Forbidden", code: "ORDER_FORBIDDEN" }, 403);
          if (/not found/i.test(msg)) return json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, 404);
          if (/already settled/i.test(msg)) return json({ error: "Order already settled", code: "ORDER_SETTLED" }, 409);
          return json({ error: "Invalid order", code: "ORDER_INVALID" }, 400);
        }

        // 3) Defence-in-depth amount check against the database total.
        const dbMinor = Math.round(ctx.amountGbp * 100);
        const clientMinor = Math.round(clientAmount * 100);
        if (dbMinor !== clientMinor) {
          console.warn(
            `[BrokkrPay] amount mismatch: order=${orderId} db=${dbMinor} client=${clientMinor} uid=${user?.uid ?? "guest-token"}`,
          );
          return json({ error: "Amount does not match order total" }, 400);
        }

        void gbpPenceToUsdWhole;
        const trustedEmail = ctx.customerEmail || customerEmail;
        const returnUrl = `${SITE_ORIGIN}/checkout/success?order_id=${encodeURIComponent(orderId)}${
          paymentToken ? `&pt=${encodeURIComponent(paymentToken)}` : ""
        }`;

        try {
          const link = await createBrokkrPayLink({
            amountPence: dbMinor,
            usdRate,
            reference: orderId,
            returnUrl,
            customerEmail: trustedEmail,
            delivery: "direct",
            idempotencyKey: `phlabs-order-${orderId}`,
          });

          await updateDocAdmin("orders", orderId, {
            paymentProvider: "brokkrpay",
            paymentRef: ctx.reference || orderId,
            brokkrpayOrderId: link.orderId,
            brokkrpayState: link.state,
            brokkrpayMode: link.mode,
            brokkrpayAmountUsd: link.amountUsd,
            brokkrpayUsdRate: usdRate,
            brokkrpayCurrency: link.currency,
            brokkrpayCheckoutUrl: link.checkoutUrl,
            paymentLinkCreatedAt: new Date(),
            ...(paymentToken ? { paymentTokenUsedAt: new Date() } : {}),
          }).catch((err) => console.error("[BrokkrPay] order marker failed:", err));

          return json({
            payment_link: link.checkoutUrl,
            brokkrpay_order_id: link.orderId,
            amount_usd: link.amountUsd,
            currency: link.currency,
            mode: link.mode || brokkrPayMode(),
            expires_at: link.expiresAt ?? null,
            replayed: link.replayed,
          });
        } catch (err) {
          if (err instanceof BrokkrPayError) {
            return json({ error: err.userMessage }, err.status === 400 ? 400 : 502);
          }
          console.error("[BrokkrPay] create unexpected error:", err);
          return json({ error: "Payment service unavailable" }, 502);
        }
      },
    },
  },
});
