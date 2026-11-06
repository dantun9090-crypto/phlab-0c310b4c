/**
 * Tiered bundle discount — SINGLE shared source of truth.
 *
 * Rule (agreed with the business owner):
 *   - 2 units in the basket  → 5% off the subtotal
 *   - 3 or more units        → 10% off the subtotal
 *   - NEVER combined with a coupon discount (e.g. SALE11). If a coupon
 *     already reduces the subtotal, the bundle discount is not applied.
 *
 * `create-order.server.ts` is the authority: unit prices always come from
 * Firestore, never from the request, and the bundle discount is recomputed
 * there. The checkout UI imports the exact same helpers so the number the
 * shopper sees matches the server to the penny.
 *
 * Client-safe: pure arithmetic, no imports.
 */

export interface BundleTier {
  /** Minimum number of units (summed quantities) required for the tier. */
  minUnits: number;
  /** Percentage off the subtotal. */
  percent: number;
}

/** Ordered high → low so the first match is the best tier. */
export const BUNDLE_TIERS: readonly BundleTier[] = [
  { minUnits: 3, percent: 10 },
  { minUnits: 2, percent: 5 },
] as const;

/** Total units in a basket (sum of quantities). */
export function countBundleUnits(items: ReadonlyArray<{ quantity: number }>): number {
  return items.reduce((sum, i) => sum + (Number.isFinite(i.quantity) ? Math.max(0, Math.trunc(i.quantity)) : 0), 0);
}

/** Best tier for a unit count, or null below the first threshold. */
export function bundleTierFor(units: number): BundleTier | null {
  for (const tier of BUNDLE_TIERS) {
    if (units >= tier.minUnits) return tier;
  }
  return null;
}

export interface BundleDiscountResult {
  /** Units counted. */
  units: number;
  /** Applied percentage (0 when no discount applies). */
  percent: number;
  /** Money off the subtotal, 2dp (0 when no discount applies). */
  amount: number;
  /** True when a coupon discount suppressed the bundle discount. */
  suppressedByCoupon: boolean;
  /** Units still needed for the next tier, or null when on the top tier. */
  unitsToNextTier: number | null;
  /** Percentage of the next tier, or null when on the top tier. */
  nextTierPercent: number | null;
}

/**
 * Compute the bundle discount.
 *
 * @param subtotal        Server-validated subtotal (before any discount).
 * @param items           Basket lines (only `quantity` is read).
 * @param couponDiscount  Monetary coupon discount already applied (0 if none).
 */
export function computeBundleDiscount(
  subtotal: number,
  items: ReadonlyArray<{ quantity: number }>,
  couponDiscount = 0,
): BundleDiscountResult {
  const units = countBundleUnits(items);
  const tier = bundleTierFor(units);
  const top = BUNDLE_TIERS[0]!;
  const next = tier && tier.percent >= top.percent
    ? null
    : (BUNDLE_TIERS.filter(t => !tier || t.percent > tier.percent).sort((a, b) => a.minUnits - b.minUnits)[0] ?? null);

  const couponActive = Number.isFinite(couponDiscount) && couponDiscount > 0;
  const suppressedByCoupon = couponActive && tier !== null;
  const safeSubtotal = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  const percent = tier && !suppressedByCoupon ? tier.percent : 0;
  const amount = percent > 0 ? +Math.min(safeSubtotal, safeSubtotal * percent / 100).toFixed(2) : 0;

  // With a coupon applied the bundle discount can never be earned, so there is
  // no next tier to promote — promising one would be misleading.
  const reachableNext = couponActive ? null : next;

  return {
    units,
    percent,
    amount,
    suppressedByCoupon,
    unitsToNextTier: reachableNext ? Math.max(0, reachableNext.minUnits - units) : null,
    nextTierPercent: reachableNext ? reachableNext.percent : null,
  };
}
