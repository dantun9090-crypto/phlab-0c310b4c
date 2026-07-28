/**
 * Immediate "payment not completed — pay again" email.
 *
 * Called from the Wallid webhook the moment a payment comes back FAILED or
 * EXPIRED, so the customer gets a retry link within seconds instead of
 * waiting for the hourly reminder cron. Idempotent on two levels:
 *   - `enqueueMailOnce` with a deterministic doc id (`payment-retry:<orderId>`)
 *   - `paymentRetryEmailAt` stamped on the order, which the cron also checks
 *
 * Server-only: bank details are read from the trusted settings doc, never
 * from webhook or client input.
 */
import { getDocAdmin, updateDocAdmin } from "./firestore-admin";
import { enqueueMailOnce } from "./enqueue-mail";

function pick(a: unknown, b: unknown): string | undefined {
  if (typeof a === "string" && a.trim()) return a;
  if (typeof b === "string" && b.trim()) return b;
  return undefined;
}

function recipient(order: Record<string, unknown> | null | undefined): string | null {
  const customer = (order?.customer as Record<string, unknown> | undefined) || {};
  const to = String(order?.customerEmail ?? order?.email ?? customer.email ?? "").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) ? to : null;
}

export async function sendPaymentRetryEmailNow(
  orderId: string,
  order: Record<string, unknown> | null | undefined,
  source = "wallid:webhook:failed",
): Promise<boolean> {
  if (!orderId || !order) return false;
  // Already sent (by an earlier webhook delivery, admin action, or the cron).
  if (order.paymentRetryEmailAt || order.paymentRetryLinkSentAt) return false;

  const to = recipient(order);
  if (!to) return false;

  const site = await getDocAdmin("settings", "siteSettings").catch(() => null);
  const legacy = await getDocAdmin("settings", "bankTransfer").catch(() => null);

  const customer = (order.customer as Record<string, unknown> | undefined) || {};
  const firstName =
    String(
      (order.firstName as string) ||
        (customer.firstName as string) ||
        (order.customerName as string) ||
        "there",
    ).split(" ")[0] || "there";
  const shortId = String(orderId).slice(-8).toUpperCase();
  const totalAmount =
    Number(order.totalAmount ?? order.totalPrice ?? order.total ?? 0) || 0;
  const reference =
    typeof order.bankTransferReference === "string" && order.bankTransferReference.trim()
      ? order.bankTransferReference
      : `#${shortId}`;

  const { buildPaymentRetryEmail } = await import("@/templates/paymentRetryEmail");
  const html = buildPaymentRetryEmail({
    firstName,
    orderId,
    totalAmount,
    payLink: `https://phlabs.co.uk/payment?orderId=${encodeURIComponent(orderId)}`,
    reference,
    bankName: pick(site?.bankTransferName, legacy?.bankName),
    sortCode: pick(site?.bankTransferSortCode, legacy?.sortCode),
    accountNumber: pick(site?.bankTransferAccountNumber, legacy?.accountNumber),
    iban: pick(site?.bankTransferIBAN, legacy?.iban),
  });

  await enqueueMailOnce(`payment-retry:${orderId}`, {
    to,
    message: {
      subject: `Complete your payment — ${shortId} | PH Labs`,
      html,
      text: `Your payment for order ${shortId} was not completed. Finish it here: https://phlabs.co.uk/payment?orderId=${orderId}`,
    },
    source,
  });

  await updateDocAdmin("orders", orderId, { paymentRetryEmailAt: new Date() }).catch(() => {});
  return true;
}
