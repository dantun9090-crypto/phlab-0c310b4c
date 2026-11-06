/**
 * Tiered bundle discount — shared client/server rule.
 * 2 units = −5%, 3+ units = −10%, never stacked with a coupon discount.
 */
import { describe, it, expect } from 'vitest';
import { computeBundleDiscount, countBundleUnits, bundleTierFor } from '../src/lib/bundle-discount';

describe('bundle discount tiers', () => {
  it('no discount for a single unit', () => {
    const r = computeBundleDiscount(50, [{ quantity: 1 }]);
    expect(r.percent).toBe(0);
    expect(r.amount).toBe(0);
    expect(r.unitsToNextTier).toBe(1);
    expect(r.nextTierPercent).toBe(5);
  });

  it('2 units → 5%', () => {
    const r = computeBundleDiscount(100, [{ quantity: 1 }, { quantity: 1 }]);
    expect(r.percent).toBe(5);
    expect(r.amount).toBe(5);
    expect(r.nextTierPercent).toBe(10);
    expect(r.unitsToNextTier).toBe(1);
  });

  it('2 units of one line also counts', () => {
    expect(computeBundleDiscount(80, [{ quantity: 2 }]).percent).toBe(5);
  });

  it('3+ units → 10% and is the top tier', () => {
    const r = computeBundleDiscount(150, [{ quantity: 2 }, { quantity: 1 }]);
    expect(r.percent).toBe(10);
    expect(r.amount).toBe(15);
    expect(r.nextTierPercent).toBeNull();
    expect(r.unitsToNextTier).toBeNull();
    expect(computeBundleDiscount(200, [{ quantity: 9 }]).percent).toBe(10);
  });

  it('does NOT stack with a coupon discount (SALE11)', () => {
    const r = computeBundleDiscount(100, [{ quantity: 3 }], 11);
    expect(r.amount).toBe(0);
    expect(r.percent).toBe(0);
    expect(r.suppressedByCoupon).toBe(true);
  });

  it('client preview and server arithmetic agree to the penny', () => {
    const items = [{ quantity: 1 }, { quantity: 2 }];
    const subtotal = 137.97;
    const client = computeBundleDiscount(subtotal, items, 0);
    const server = computeBundleDiscount(subtotal, items, 0);
    expect(client.amount).toBe(server.amount);
    expect(+(subtotal - client.amount).toFixed(2)).toBe(124.17);
  });

  it('rounds to 2dp and never exceeds the subtotal', () => {
    expect(computeBundleDiscount(33.33, [{ quantity: 2 }]).amount).toBe(1.67);
    expect(computeBundleDiscount(0, [{ quantity: 5 }]).amount).toBe(0);
  });

  it('helpers behave', () => {
    expect(countBundleUnits([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
    expect(bundleTierFor(1)).toBeNull();
    expect(bundleTierFor(2)?.percent).toBe(5);
    expect(bundleTierFor(7)?.percent).toBe(10);
  });
});
