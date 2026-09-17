/**
 * Allowed order-status transitions for payment settlement.
 *
 * A successful payment must ALWAYS win. A customer whose first attempt
 * failed (or expired) and who then pays from the "Pay again" link left the
 * order stuck on `failed` — the atomic transition refused to move it to
 * `paid`, so no confirmation email was ever enqueued and an admin had to fix
 * it by hand. `PAID_ALLOW_FROM` therefore includes the failed/expired
 * states, while `UNPAID_ALLOW_FROM` stays narrow so a late FAILED/EXPIRED
 * callback can never pull a settled order back out of `paid`.
 *
 * Client-safe module: constants only, no server imports.
 */

/** Order states that are still waiting for money. */
export const PENDING_PAYMENT_STATUSES = [
  "pending",
  "pending_payment",
  "awaiting_payment",
  "processing_payment",
  "needs_review",
  "",
] as const;

/** States a successful payment may transition FROM (retries included). */
export const PAID_ALLOW_FROM: string[] = [
  ...PENDING_PAYMENT_STATUSES,
  "failed",
  "payment_failed",
  "expired",
  "payment_expired",
  "cancelled_payment",
];

/** States a failed/expired payment may transition FROM (never from paid). */
export const UNPAID_ALLOW_FROM: string[] = [...PENDING_PAYMENT_STATUSES];

/** Pick the correct allow-list for a target Firestore order status. */
export function allowFromFor(targetStatus: string): string[] {
  return String(targetStatus).toLowerCase() === "paid"
    ? PAID_ALLOW_FROM
    : UNPAID_ALLOW_FROM;
}
