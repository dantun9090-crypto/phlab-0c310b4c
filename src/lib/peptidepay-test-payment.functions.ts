/**
 * Admin-only PeptidePay test payment.
 *
 * Creates a real hosted PeptidePay checkout session (card / Apple Pay /
 * Google Pay / crypto) for a small amount so admins can verify the full
 * flow end-to-end. There is no PeptidePay sandbox, so this moves real funds
 * if completed — the session can simply be abandoned to test only the
 * redirect + hosted page.
 *
 * Order id is prefixed `TEST-` so it never collides with the `PHP-` order id
 * space and is easy to spot in webhook/session logs.
 *
 * Access: admin-only via Firebase ID token. Never callable anonymously.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  /** Amount in pence. Defaults to £1.00 (the provider minimum). */
  amountPence: z.number().int().min(100).max(5000).optional(),
});

export const createPeptidePayTestPayment = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: true;
      orderId: string;
      sessionId: string;
      url: string;
      status: string;
      amountGbp: number;
      expiresAt: string | null;
    }> => {
      const admin = await requireFirebaseAdmin(data.idToken);

      const { createPeptidePaySession, PeptidePayError } = await import(
        "@/lib/peptidepay.server"
      );

      const amountPence = data.amountPence ?? 100;
      const orderId = `TEST-${Date.now().toString(36).toUpperCase()}`;
      const customerEmail = admin.email || "admin-test@phlabs.co.uk";

      try {
        const session = await createPeptidePaySession({
          amountCents: amountPence,
          currency: "GBP",
          customerEmail,
          productName: `PH LABS — Admin test payment (£${(amountPence / 100).toFixed(2)})`,
          metadata: { order_id: orderId, test: "1", admin_uid: admin.uid },
          successUrl: `https://phlabs.co.uk/checkout/success?order_id=${encodeURIComponent(orderId)}&test=1`,
          cancelUrl: `https://phlabs.co.uk/checkout/cancel?order_id=${encodeURIComponent(orderId)}&test=1`,
          idempotencyKey: `peptidepay-test:${orderId}`,
        });

        return {
          ok: true,
          orderId,
          sessionId: session.id,
          url: session.url,
          status: session.status,
          amountGbp: amountPence / 100,
          expiresAt: session.expiresAt ?? null,
        };
      } catch (err) {
        if (err instanceof PeptidePayError) {
          throw new Error(`PeptidePay: ${err.userMessage} (${err.status})`);
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  );
