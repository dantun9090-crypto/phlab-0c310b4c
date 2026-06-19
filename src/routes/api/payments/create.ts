/**
 * POST /api/payments/create — Wallid Pay-by-Bank session creator.
 *
 * Security model:
 *   - Caller provides a Firebase ID token, or a one-time high-entropy
 *     paymentToken minted when guest order creation cannot attach a UID.
 *   - The order is loaded from Firestore via `buildOrderCtxForPayment`,
 *     which enforces ownership and unsettled status.
 *   - The amount sent to Wallid comes from the DB order, NEVER from the
 *     client body — prevents price manipulation.
 *   - Items/customer email are derived from the request only for display
 *     purposes; the authoritative charge amount is the order total.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createWallidPayment, WallidError } from "@/lib/wallid.server";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { readWallidEnabled } from "@/lib/wallid-config.server";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import { buildOrderCtxForPayment } from "@/lib/payments/dispatch.server";
import { updateDocAdmin } from "@/lib/server/firestore-admin";

const ItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(120).optional(),
  price: z.number().nonnegative().max(100000),
  image_url: z.string().url().max(2048).optional(),
  product_url: z.string().url().max(2048).optional(),
});

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096).optional().nullable(),
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
  paymentToken: z.string().min(32).max(256).optional().nullable(),
  amount: z.number().positive().max(100000),
  currency: z.literal("GBP"),
  items: z.array(ItemSchema).min(1).max(50),
  customerEmail: z.string().email().max(254),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/payments/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const rl = checkRateLimit(ip, "wallid:create", 5, 60_000);
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);

        // Kill switch — admins can disable Wallid from the admin panel.
        if (!(await readWallidEnabled())) {
          return json({ error: "Wallid payments are currently disabled" }, 403);
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
        const { idToken, orderId, paymentToken, amount: clientAmount, currency, items, customerEmail } = parsed.data;
        if (!idToken && !paymentToken) {
          return json({ error: "Authentication required" }, 401);
        }

        // 1) Authenticate caller
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

        // 2) Load order, verify ownership + unsettled status, derive trusted amount
        let ctx;
        try {
          ctx = await buildOrderCtxForPayment(orderId, user?.uid ?? null, user?.email ?? null, paymentToken);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/forbidden/i.test(msg)) return json({ error: "Forbidden" }, 403);
          if (/not found/i.test(msg)) return json({ error: "Order not found" }, 404);
          if (/already settled/i.test(msg)) return json({ error: "Order already settled" }, 409);
          return json({ error: msg || "Invalid order" }, 400);
        }

        // 3) Verify client amount matches the DB order amount (defense-in-depth)
        const dbMinor = Math.round(ctx.amountGbp * 100);
        const clientMinor = Math.round(clientAmount * 100);
        if (dbMinor !== clientMinor) {
          console.warn(
             `[Wallid] amount mismatch: order=${orderId} db=${dbMinor} client=${clientMinor} uid=${user?.uid ?? "guest-token"}`,
          );
          return json({ error: "Amount does not match order total" }, 400);
        }

        // 4) Use the authoritative DB amount + email for the Wallid charge
        const trustedAmount = ctx.amountGbp;
        const trustedEmail = ctx.customerEmail || customerEmail;

        const successUrl = `https://phlabs.co.uk/checkout/success?order_id=${encodeURIComponent(orderId)}`;
        const failUrl = `https://phlabs.co.uk/checkout/cancel?order_id=${encodeURIComponent(orderId)}`;

        try {
          const wallid = await createWallidPayment({
            orderId,
            amount: trustedAmount,
            currency,
            customerEmail: trustedEmail,
            items,
            successUrl,
            failUrl,
          });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: dbErr } = await supabaseAdmin.from("wallid_payments").insert({
            order_id: orderId,
            api_payment_id: wallid.api_payment_id,
            payment_link: wallid.payment_link,
            amount: dbMinor,
            currency,
            status: String(wallid.status || "pending"),
            customer_email: trustedEmail,
            metadata: { items, user_uid: user?.uid ?? null, guest_payment_token: Boolean(paymentToken), raw: wallid } as never,
          });
          if (dbErr) {
            console.error("[Wallid] DB insert failed:", dbErr.message);
          }
          if (paymentToken) {
            await updateDocAdmin("orders", orderId, {
              paymentTokenHash: null,
              paymentTokenUsedAt: new Date(),
            }).catch((err) => console.error("[Wallid] token cleanup failed:", err));
          }

          return json({
            payment_link: wallid.payment_link,
            api_payment_id: wallid.api_payment_id,
            expires_at: wallid.expires_at ?? null,
          });
        } catch (err) {
          if (err instanceof WallidError) {
            return json({ error: err.userMessage }, err.status === 400 ? 400 : 502);
          }
          console.error("[Wallid] create unexpected error:", err);
          return json({ error: "Payment service unavailable" }, 502);
        }
      },
    },
  },
});
