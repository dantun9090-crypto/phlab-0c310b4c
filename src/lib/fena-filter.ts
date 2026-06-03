/**
 * Pure predicate used by the admin Orders tab's "Fena Auto-Paid" filter.
 * Must stay in sync with OrdersTab.tsx (statusFilter === 'fena_paid' branch
 * and the `fena_paid` count).
 *
 * An order qualifies ONLY when BOTH:
 *   - paymentProvider === 'fena'  (Fena Open Banking initiated the payment)
 *   - fenaStatus      === 'paid'  (Fena webhook authoritatively confirmed it)
 */
export function isFenaAutoPaid(order: unknown): boolean {
  if (!order || typeof order !== "object") return false;
  const o = order as Record<string, unknown>;
  return (
    o.paymentProvider === "fena" &&
    String(o.fenaStatus ?? "").toLowerCase() === "paid"
  );
}
