/**
 * Admin-only NOWPayments test payment.
 *
 * Creates a real hosted NOWPayments invoice (BTC / ETH / USDT / …) for a small
 * amount so admins can verify the full flow end-to-end. The live keys have no
 * sandbox, so this moves real funds if completed — the invoice can simply be
 * abandoned to test only the redirect + hosted page.
 *
 * Order id is prefixed `TEST-` so it never collides with the `PHP-` order id
 * space and is easy to spot in IPN logs. IPN callbacks for TEST- orders are
 * verified, logged to `nowpayments_webhook_events` and then acked (no matching
 * Firestore order → no status fan-out, no emails).
 *
 * Intentionally bypasses the checkout kill switch (site_config/nowpayments) —
 * this is the tool you use to verify the integration BEFORE enabling it.
 *
 * Access: admin-only via Firebase ID token. Never callable anonymously.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  /** Amount in pence. Defaults to £6.00. */
  amountPence: z.number().int().min(100).max(5000).optional(),
});

export const createNowPaymentsTestPayment = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: true;
      orderId: string;
      invoiceId: string;
      url: string;
      amountGbp: number;
      createdAt: string | null;
    }> => {
      const admin = await requireFirebaseAdmin(data.idToken);

      const {
        createNowPaymentsInvoice,
        isNowPaymentsConfigured,
        NowPaymentsError,
      } = await import("@/lib/nowpayments.server");

      if (!isNowPaymentsConfigured()) {
        throw new Error("NOWPayments is not configured (missing NOWPAYMENTS_API_KEY)");
      }

      const amountPence = data.amountPence ?? 600;
      const orderId = `TEST-${Date.now().toString(36).toUpperCase()}`;

      try {
        const invoice = await createNowPaymentsInvoice({
          amountMinor: amountPence,
          currency: "GBP",
          orderId,
          orderDescription: `PH LABS — Admin test payment (£${(amountPence / 100).toFixed(2)}) by ${admin.email || admin.uid}`,
          successUrl: `https://phlabs.co.uk/checkout/success?order_id=${encodeURIComponent(orderId)}&test=1`,
          cancelUrl: `https://phlabs.co.uk/checkout/cancel?order_id=${encodeURIComponent(orderId)}&test=1`,
          ipnCallbackUrl: "https://phlabs.co.uk/api/public/nowpayments-webhook",
        });

        return {
          ok: true,
          orderId,
          invoiceId: invoice.id,
          url: invoice.invoiceUrl,
          amountGbp: amountPence / 100,
          createdAt: invoice.createdAt,
        };
      } catch (err) {
        if (err instanceof NowPaymentsError) {
          throw new Error(`NOWPayments: ${err.userMessage} (${err.status})`);
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  );
