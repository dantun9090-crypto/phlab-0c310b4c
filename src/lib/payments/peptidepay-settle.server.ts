/**
 * PeptidePay settlement fallback — used when the signed webhook never lands.
 *
 * The webhook (`/api/public/peptidepay-webhook`) is the primary settlement
 * path. This helper is the safety net for the customer-facing status poller:
 * it asks PeptidePay for the authoritative session state and, only when the
 * provider says paid, performs the SAME atomic status transition the webhook
 * performs. The confirmation email uses the identical `enqueueMailOnce` key
 * (`payment-confirmed:{orderId}`), so a later webhook delivery can never send
 * a second email.
 *
 * Server-only.
 */
import { getPeptidePaySessionStatus } from "@/lib/peptidepay.server";

function mapStatus(raw: string): "paid" | "failed" | "expired" | null {
  const s = raw.toLowerCase();
  if (s === "paid" || s === "settled" || s === "succeeded" || s === "success" || s === "completed") return "paid";
  if (s === "failed" || s === "declined" || s === "cancelled" || s === "canceled") return "failed";
  if (s === "expired") return "expired";
  return null;
}

export type PeptidePaySettleOutcome = "paid" | "failed" | "expired" | "pending";

/**
 * Poll PeptidePay for `sessionId` and settle `orderId` if terminal.
 * Never throws — returns "pending" on any provider/network failure so the
 * poller simply keeps waiting.
 */
export async function pollAndSettlePeptidePay(
  orderId: string,
  sessionId: string,
  source = "peptidepay:status-poll",
): Promise<PeptidePaySettleOutcome> {
  let remote;
  try {
    remote = await getPeptidePaySessionStatus(sessionId);
  } catch (err) {
    console.warn(
      `[PeptidePay] session poll failed order=${orderId}:`,
      err instanceof Error ? err.message : err,
    );
    return "pending";
  }

  const mapped = mapStatus(remote.status);
  if (!mapped) return "pending";

  const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
  const { transitioned, prior } = await transitionDocStatusAdmin("orders", orderId, {
    allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
    updates: {
      status: mapped,
      paymentProvider: "peptidepay",
      peptidepaySessionId: sessionId,
      peptidepayStatus: remote.status,
      ...(remote.txid ? { peptidepayTxid: remote.txid } : {}),
      paymentUpdatedAt: new Date(),
      ...(mapped === "paid" ? { paidAt: new Date() } : {}),
      paymentTokenHash: null,
    },
  });

  if (!transitioned || !prior) return mapped;

  if (mapped === "paid") {
    const customerObj = (prior.customer as Record<string, unknown> | undefined) || {};
    const to = String(prior.customerEmail ?? prior.email ?? customerObj.email ?? "");
    if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      try {
        const { paymentConfirmedEmail } = await import("@/templates/paymentConfirmedEmail");
        const firstName =
          String(
            (prior.firstName as string) ||
              (customerObj.firstName as string) ||
              (prior.customerName as string) ||
              "",
          ).split(" ")[0] || "there";
        const { subject, html, text } = paymentConfirmedEmail({
          firstName,
          orderNumber: String(prior.orderNumber ?? orderId),
          amount: Number((prior.totalAmount as number) ?? (prior.total as number) ?? 0),
          paymentMethod: "Card / Apple Pay / Google Pay (PeptidePay)",
          paidAt: new Date(),
        });
        const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
        await enqueueMailOnce(`payment-confirmed:${orderId}`, {
          to,
          message: { subject, html, text },
          source,
        });
      } catch (mailErr) {
        console.warn(
          "[PeptidePay] fallback confirmation email failed:",
          mailErr instanceof Error ? mailErr.message : mailErr,
        );
      }
    }
  } else {
    try {
      const { sendPaymentRetryEmailNow } = await import("@/lib/server/send-payment-retry.server");
      await sendPaymentRetryEmailNow(orderId, prior as Record<string, unknown>, `${source}:${mapped}`);
    } catch (retryErr) {
      console.warn(
        "[PeptidePay] fallback retry email failed:",
        retryErr instanceof Error ? retryErr.message : retryErr,
      );
    }
  }

  return mapped;
}
