/**
 * Helpers for the customer order history "Pay Again" flow.
 *
 * When a user starts a Pay-by-Bank / Fena / Wallid payment but cancels it
 * at their bank (or never confirms), the webhook never fires, so the order
 * stays in `pending` / `pending_payment`. Some merchants also flip the
 * order to `cancelled` if the provider returns a cancellation status. In
 * both cases the order is still payable — we let the customer retry via
 * `/payment?orderId=<id>` which re-creates the HPP link for the same
 * order.
 *
 * These helpers are pure so they can be unit-tested without React,
 * Firebase, or framer-motion. The cooldown helpers below intentionally
 * accept an injected `now` + `storage` so they can be tested without
 * touching real localStorage / Date.now().
 */

export type OrderForRetry = {
  status?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
};

const RETRYABLE_STATUSES = new Set(['pending', 'pending_payment', 'cancelled']);
const RETRYABLE_PROVIDERS = new Set(['fena', 'wallid']);
const RETRYABLE_METHODS = new Set(['pay_by_bank']);

/**
 * Returns true when the order should expose a "Pay Again" CTA — i.e. it
 * is still unpaid AND was originally placed via Pay-by-Bank.
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
 * customer-facing badge. A bank-payment order whose status is `cancelled`
 * is really "payment cancelled at the bank" and is still payable, so we
 * surface it as `pending_payment` instead of the scary red "Cancelled"
 * pill that's used for admin-cancelled orders.
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

/* -------------------------- Pay-again cooldown -------------------------- */

/**
 * After a customer clicks "Pay Again" we disable the button for 30 minutes
 * on this device. Reason: Pay-by-Bank confirmations can lag by 5–10 min,
 * and a frustrated double-click would otherwise create a second payment
 * intent and (rarely) a second bank charge. The cooldown is client-side
 * by design — losing it on a different device / browser is fine because
 * the server-side reconcile cron + needs_review monitor will catch any
 * duplicate paid transition.
 */
export const PAY_AGAIN_COOLDOWN_MS = 30 * 60_000;
const STORAGE_PREFIX = 'php_pay_again:';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Returns the milliseconds left on the cooldown for this order, or 0 if
 * the user can retry now. Pass a custom `now` + `storage` for tests.
 */
export function getPayAgainCooldownRemainingMs(
  orderId: string,
  now: number = Date.now(),
  storage: StorageLike | null = safeStorage(),
): number {
  if (!storage || !orderId) return 0;
  const raw = storage.getItem(STORAGE_PREFIX + orderId);
  if (!raw) return 0;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) {
    storage.removeItem(STORAGE_PREFIX + orderId);
    return 0;
  }
  const elapsed = now - ts;
  if (elapsed >= PAY_AGAIN_COOLDOWN_MS) {
    storage.removeItem(STORAGE_PREFIX + orderId);
    return 0;
  }
  return PAY_AGAIN_COOLDOWN_MS - elapsed;
}

/** Mark the order as just-retried so the cooldown starts. */
export function markPayAgainAttempted(
  orderId: string,
  now: number = Date.now(),
  storage: StorageLike | null = safeStorage(),
): void {
  if (!storage || !orderId) return;
  try {
    storage.setItem(STORAGE_PREFIX + orderId, String(now));
  } catch {
    /* quota / disabled — best effort only */
  }
}

/** Human-readable mm:ss countdown for the disabled-button label. */
export function formatCooldown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
