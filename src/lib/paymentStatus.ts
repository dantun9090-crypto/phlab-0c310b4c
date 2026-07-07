/**
 * Shared payment-status helpers. Imported by BOTH the Wallid webhook handler
 * and the reconciliation cron. Do NOT duplicate this logic anywhere else.
 *
 * Safe for client bundles (pure functions, no side-effects).
 */

/**
 * Canonical mapping from Wallid's provider-level status strings to the
 * internal status we store on `orders.paymentStatus`. Unknown inputs return
 * "unknown" so the caller can flag the order for human review instead of
 * silently accepting a mystery value.
 */
export function mapWallidStatusToInternal(wallidStatus: string): string {
  const map: Record<string, string> = {
    completed: "paid",
    pending: "pending",
    failed: "failed",
    cancelled: "cancelled",
    refunded: "refunded",
    settled: "paid",
  };
  return map[String(wallidStatus || "").toLowerCase()] || "unknown";
}

/**
 * Returns true when applying `next` on top of `current` would be a
 * downgrade (e.g. "paid" → "pending"). Used to reject out-of-order
 * webhook deliveries and stop the reconcile cron from clobbering a
 * terminal state with a stale poll result.
 */
export function isStatusConflict(current: string, next: string): boolean {
  const hierarchy = ["pending", "failed", "cancelled", "paid", "refunded"];
  const currIdx = hierarchy.indexOf(String(current || "").toLowerCase());
  const nextIdx = hierarchy.indexOf(String(next || "").toLowerCase());
  if (currIdx === -1 || nextIdx === -1) return false;
  return nextIdx < currIdx;
}

/**
 * Exponential-ish backoff schedule (minutes) for the retry cron.
 * Index = attemptCount - 1 (clamped to the last entry).
 */
export const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 240] as const;
