/**
 * Pure helper for the customer Order Tracking timeline shown on
 * `src/pages/Account/index.tsx`. Maps a raw order status to the index of
 * the currently-active step in the 4-step bar:
 *
 *   0 Placed  →  1 Processing  →  2 Shipped  →  3 Delivered
 *
 * Special cases:
 *  - `pending_payment` collapses back to step 0 (Placed).
 *  - `paid` advances to step 1 (Processing) — payment received but the
 *    warehouse has not yet picked the order.
 *  - `cancelled` returns -1; the UI renders a dedicated "Order Cancelled"
 *    state instead of the bar.
 *  - Unknown statuses return -1 so nothing in the bar is highlighted.
 */
export const ORDER_TRACKING_STEPS = [
  "pending",
  "processing",
  "shipped",
  "delivered",
] as const;

export type OrderTrackingStep = (typeof ORDER_TRACKING_STEPS)[number];

export function getOrderTrackingIndex(status: string): number {
  if (status === "cancelled") return -1;
  const normalized =
    status === "pending_payment"
      ? "pending"
      : status === "paid"
        ? "processing"
        : status;
  return (ORDER_TRACKING_STEPS as readonly string[]).indexOf(normalized);
}
