import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createWallidPayment, WallidError } from "@/lib/wallid.server";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { readWallidEnabled } from "@/lib/wallid-config.server";

const ItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(120).optional(),
  price: z.number().nonnegative().max(100000),
  image_url: z.string().url().max(2048).optional(),
  product_url: z.string().url().max(2048).optional(),
});

const BodySchema = z.object({
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
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
        const { orderId, amount, currency, items, customerEmail } = parsed.data;

        const successUrl = `https://phlabs.co.uk/checkout/success?order_id=${encodeURIComponent(orderId)}`;
        const failUrl = `https://phlabs.co.uk/checkout/cancel?order_id=${encodeURIComponent(orderId)}`;

        try {
          const wallid = await createWallidPayment({
            orderId,
            amount,
            currency,
            customerEmail,
            items,
            successUrl,
            failUrl,
          });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: dbErr } = await supabaseAdmin.from("wallid_payments").insert({
            order_id: orderId,
            api_payment_id: wallid.api_payment_id,
            payment_link: wallid.payment_link,
            amount: Math.round(amount * 100),
            currency,
            status: String(wallid.status || "pending"),
            customer_email: customerEmail,
            metadata: { items, raw: wallid } as never,
          });
          if (dbErr) {
            console.error("[Wallid] DB insert failed:", dbErr.message);
            // Continue — payment_link is still usable; we just lose audit row.
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
