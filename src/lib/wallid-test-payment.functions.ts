/**
 * Admin-only Wallid test payment.
 *
 * Creates a real £1 Wallid Pay-by-Bank session against the live Wallid API
 * so admins can verify the full checkout flow (HPP → bank → webhook) end
 * to end. Uses a synthetic order id prefixed with `TEST-` so it is easy to
 * distinguish from real orders and never collides with the `PHP-` order id
 * space used by `runCreateOrder`.
 *
 * Access: admin-only via Firebase ID token. Never callable anonymously.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Input = z.object({ idToken: z.string().min(10).max(4096) });

export const createWallidTestPayment = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: true;
      orderId: string;
      paymentLink: string;
      apiPaymentId: string;
      amountGbp: number;
    }> => {
      const admin = await requireFirebaseAdmin(data.idToken);

      const { createWallidPayment, WallidError } = await import("@/lib/wallid.server");
      const orderId = `TEST-${Date.now().toString(36).toUpperCase()}`;
      const amountGbp = 1;
      const customerEmail = admin.email || "admin-test@phlabs.co.uk";

      const successUrl = `https://phlabs.co.uk/checkout/success?order_id=${encodeURIComponent(orderId)}&test=1`;
      const failUrl = `https://phlabs.co.uk/checkout/cancel?order_id=${encodeURIComponent(orderId)}&test=1`;

      try {
        const wallid = await createWallidPayment({
          orderId,
          amount: amountGbp,
          currency: "GBP",
          customerEmail,
          items: [
            {
              name: "PH LABS — Admin test payment (£1)",
              category: "Research Peptides",
              price: amountGbp,
              product_url: "https://phlabs.co.uk/",
              image_url: "https://phlabs.co.uk/icons/icon-512.png",
            },
          ],
          successUrl,
          failUrl,
        });

        // Best-effort log to wallid_payments so the admin can see the row
        // appear in the database / wallid logs.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("wallid_payments").insert({
            order_id: orderId,
            api_payment_id: wallid.api_payment_id,
            payment_link: wallid.payment_link,
            amount: 100, // pence
            currency: "GBP",
            status: String(wallid.status || "pending"),
            customer_email: customerEmail,
            metadata: { test: true, admin_uid: admin.uid, raw: wallid } as never,
          });
        } catch (err) {
          console.error("[Wallid test] DB insert failed:", err);
        }

        return {
          ok: true,
          orderId,
          paymentLink: wallid.payment_link,
          apiPaymentId: wallid.api_payment_id,
          amountGbp,
        };
      } catch (err) {
        if (err instanceof WallidError) {
          throw new Error(`Wallid: ${err.userMessage} (${err.status})`);
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  );
