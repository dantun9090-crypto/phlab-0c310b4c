/**
 * Regression tests for `lookupCoupon` (server-side coupon validation).
 *
 * Guards against silent breakage of:
 *   - admin-only `/coupons` collection lookup via service account helper
 *     (NOT public Firestore REST, which 403s in production)
 *   - inactive / expired / usage-capped / min-order rejection
 *   - case-insensitive code matching
 *   - support for both legacy field names (`maxUsage`/`usageCount`)
 *     and current names (`maxUses`/`usedCount`)
 *
 * Run with: `bun test src/lib/coupon-validation.test.ts`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the admin Firestore helpers BEFORE importing the module under test.
vi.mock('./server/firestore-admin', () => ({
  findDocByFieldAdmin: vi.fn(),
  getDocAdmin: vi.fn(),
}));
vi.mock('./server/firebase-auth-admin', () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

import { lookupCoupon } from './cart-validation.server';
import { findDocByFieldAdmin } from './server/firestore-admin';

const mockFind = findDocByFieldAdmin as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFind.mockReset();
});

describe('lookupCoupon — admin-only path & gating', () => {
  it('queries the admin helper with the UPPERCASED code', async () => {
    mockFind.mockResolvedValue(null);
    await lookupCoupon('save10', 100);
    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFind).toHaveBeenCalledWith('coupons', 'code', 'SAVE10');
  });

  it('returns coupon for an active percentage coupon', async () => {
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'SAVE10', isActive: true, type: 'percentage', value: 10,
    });
    const r = await lookupCoupon('save10', 100);
    expect(r.error).toBeNull();
    expect(r.coupon).toEqual({ id: 'c1', code: 'SAVE10', type: 'percentage', value: 10 });
  });

  it('rejects when the coupon does not exist', async () => {
    mockFind.mockResolvedValue(null);
    const r = await lookupCoupon('NOPE', 100);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/invalid or expired/i);
  });

  it('rejects when isActive is false', async () => {
    mockFind.mockResolvedValue({ __id: 'c1', code: 'X', isActive: false, type: 'fixed', value: 5 });
    const r = await lookupCoupon('x', 100);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/invalid or expired/i);
  });

  it('rejects when isActive is missing (must be explicitly true)', async () => {
    mockFind.mockResolvedValue({ __id: 'c1', code: 'X', type: 'fixed', value: 5 });
    const r = await lookupCoupon('x', 100);
    expect(r.coupon).toBeNull();
  });

  it('rejects an expired coupon', async () => {
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'X', isActive: true, type: 'percentage', value: 10,
      expiryDate: '2020-01-01T00:00:00.000Z',
    });
    const r = await lookupCoupon('x', 100);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/expired/i);
  });

  it('accepts a coupon with a future expiryDate', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'X', isActive: true, type: 'percentage', value: 10,
      expiryDate: future,
    });
    const r = await lookupCoupon('x', 100);
    expect(r.error).toBeNull();
    expect(r.coupon?.id).toBe('c1');
  });

  it('rejects when usedCount has reached maxUses', async () => {
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'X', isActive: true, type: 'fixed', value: 5,
      maxUses: 10, usedCount: 10,
    });
    const r = await lookupCoupon('x', 100);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/limit reached/i);
  });

  it('honours legacy `maxUsage`/`usageCount` field names', async () => {
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'X', isActive: true, type: 'fixed', value: 5,
      maxUsage: 3, usageCount: 3,
    });
    const r = await lookupCoupon('x', 100);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/limit reached/i);
  });

  it('rejects when subtotal is below minOrderValue', async () => {
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'X', isActive: true, type: 'fixed', value: 5,
      minOrderValue: 50,
    });
    const r = await lookupCoupon('x', 25);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/at least £50/i);
  });

  it('accepts a free_shipping coupon with value=0', async () => {
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'SHIP', isActive: true, type: 'free_shipping',
    });
    const r = await lookupCoupon('ship', 100);
    expect(r.error).toBeNull();
    expect(r.coupon?.type).toBe('free_shipping');
  });

  it('rejects unknown coupon types', async () => {
    mockFind.mockResolvedValue({
      __id: 'c1', code: 'X', isActive: true, type: 'bogus', value: 10,
    });
    const r = await lookupCoupon('x', 100);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/invalid coupon configuration/i);
  });

  it('returns a safe error (does not throw) when the admin helper throws', async () => {
    mockFind.mockRejectedValue(new Error('boom'));
    const r = await lookupCoupon('x', 100);
    expect(r.coupon).toBeNull();
    expect(r.error).toMatch(/could not validate/i);
  });
});
