/**
 * Helpers for the customer order history "Pay Again" flow.
 *
 * When a user starts a Pay-by-Bank / Fena payment but cancels it at their
 * bank (or never confirms), the Fena webhook never fires, so the order
 * stays in `pending` / `pending_payment`. Some merchants also flip the
 * order to `cancelled` if Fena returns a cancellation status. In both
 * cases the order is still payable — we let the customer retry via
 * `/payment?orderId=<id>` which re-creates the Fena HPP link for the
 * same order.
 *
 * These helpers are pure so they can be unit-tested without React,
 * Firebase, or framer-motion.
 */

export type OrderForRetry = {
  status?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
};

const RETRYABLE_STATUSES = new Set(['pending', 'pending_payment', 'cancelled']);
const RETRYABLE_PROVIDERS = new Set(['fena']);
const RETRYABLE_METHODS = new Set(['pay_by_bank']);

/**
 * Returns true when the order should expose a "Pay Again" CTA — i.e. it
 * is still unpaid AND was originally placed via Pay-by-Bank / Fena.
 *
 * Bank-transfer (manual) orders are NOT retryable here — those are
 * handled by the 72h countdown + emailing the receipt.
 */
export function canRetryPayment(order: OrderForRetry): boolean {
  const status = String(order.status ?? '').toLowerCase();
  if (!RETRYABLE_STATUSES.has(status)) return false;

  const method = String(order.paymentMethod ?? '').toLowerCase();
  const provider = String(order.paymentProvider ?? '').toLowerCase();
  return RETRYABLE_METHODS.has(method) || RETRYABLE_PROVIDERS.has(provider);
}

/**
 * Maps the raw Firestore status to the label-key we render in the
 * customer-facing badge. A Fena order whose status is `cancelled` is
 * really "payment cancelled at the bank" and is still payable, so we
 * surface it as `pending_payment` ("Awaiting Payment") instead of the
 * scary red "Cancelled" pill that's used for admin-cancelled orders.
 */
export function getDisplayStatus(order: OrderForRetry): string {
  const status = String(order.status ?? '').toLowerCase();
  if (status === 'cancelled' && canRetryPayment(order)) {
    return 'pending_payment';
  }
  return status;
}

/**
 * URL the "Pay Again" CTA links to. Centralised so tests + component +
 * any future call-site stay in sync.
 */
export function payAgainHref(orderId: string): string {
  return `/payment?orderId=${encodeURIComponent(orderId)}`;
}
