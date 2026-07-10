/**
 * Sync contract: the Checkout UI hides `next_day_12` for a specific set of
 * conditions. `runCreateOrder` MUST reject a direct request under every
 * one of those same conditions — otherwise a hand-crafted POST could book
 * a Next Day promise the fulfilment side cannot honour.
 *
 * Hidden-in-UI branches (src/pages/Checkout/index.tsx):
 *   1. `country !== 'United Kingdom'`               (non-UK address)
 *   2. `!checkNextDayEligibility().qualifies`, driven by:
 *        a. current UK time is past the 11:30 cut-off
 *        b. today is Saturday / Sunday in Europe/London
 *        c. today is a UK bank holiday
 *        d. tomorrow is a UK bank holiday (rolled next-working-day)
 *
 * This test freezes the server clock with `vi.useFakeTimers()` and drives
 * `runCreateOrder` through every branch. Any acceptance is a sync
 * regression.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runValidateCartMock = vi.fn();
vi.mock('../src/lib/cart-validation.server', () => ({
  runValidateCart: (...a: unknown[]) => runValidateCartMock(...a),
}));

const written: Array<Record<string, unknown>> = [];
vi.mock('../src/lib/server/firestore-admin', () => ({
  addDocAdmin: vi.fn(async (_col: string, data: Record<string, unknown>) => {
    written.push(data); return { id: `f-${written.length}` };
  }),
  getDocAdmin: vi.fn(async () => null),
  updateDocAdmin: vi.fn(async () => undefined),
}));
vi.mock('../src/lib/server/firebase-auth-admin', () => ({
  verifyFirebaseIdToken: vi.fn(async () => ({ uid: 'u' })),
}));
vi.mock('../src/lib/server/cache-invalidation', () => ({
  invalidateProductCacheFromServer: vi.fn(async () => undefined),
}));

import { runCreateOrder, type CreateOrderInput } from '../src/lib/create-order.server';
import { checkNextDayEligibility } from '../src/lib/shipping/next-day';

const UK = {
  firstName: 'Alice', lastName: 'Smith', email: 'a@b.co.uk',
  address: '10 Downing Street', city: 'London',
  postcode: 'SW1A 2AA', country: 'United Kingdom', phone: '',
};
const DE = {
  firstName: 'Hans', lastName: 'Müller', email: 'h@example.de',
  address: 'Musterstraße 12', city: 'Berlin',
  postcode: '10115', country: 'Germany', phone: '',
};

function nextDayInput(customer: typeof UK): CreateOrderInput {
  return {
    items: [{ productId: 'pt-141', productName: 'PT-141', quantity: 1 }],
    customer,
    shippingMethod: 'next_day_12',
    paymentMethod: 'wallid',
    ageVerified: true, termsAccepted: true,
    couponCode: null, customerNote: null, idToken: null,
  };
}

// Helper: build a UTC instant that lands at a specific Europe/London
// wall-clock time on a specific YYYY-MM-DD. In winter GMT=UTC, in summer
// BST=UTC+1. We stick to winter (Jan / Feb / Dec) so hour math is trivial.
function londonWinter(dateKey: string, hh: number, mm: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
}

describe('Sync contract: every branch that hides next_day_12 in the UI is rejected server-side', () => {
  beforeEach(() => {
    written.length = 0;
    runValidateCartMock.mockReset();
    runValidateCartMock.mockResolvedValue({
      ok: true,
      items: [{ productId: 'pt-141', variantId: null, unitPrice: 14.99 }],
      subtotal: 14.99, discount: 0, shippingDiscount: 0, coupon: null, errors: [],
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  // ── Branch 1: non-UK address ────────────────────────────────────────
  it('non-UK address → rejected (matches UI: option filtered out)', async () => {
    // Fix clock inside UK cut-off to isolate the country check.
    vi.useFakeTimers();
    vi.setSystemTime(londonWinter('2027-01-04', 9, 0)); // Mon 09:00 UK
    expect(checkNextDayEligibility(new Date()).qualifies).toBe(true);

    await expect(runCreateOrder(nextDayInput(DE))).rejects.toThrow(/UK delivery/i);
    expect(runValidateCartMock).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });

  // ── Branch 2a: past 11:30 UK cut-off ────────────────────────────────
  it('past 11:30 UK cut-off → rejected (matches UI: option filtered out)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(londonWinter('2027-01-04', 12, 0)); // Mon 12:00 UK
    expect(checkNextDayEligibility(new Date()).qualifies).toBe(false);

    await expect(runCreateOrder(nextDayInput(UK))).rejects.toThrow(/cut-off|Standard/i);
    expect(runValidateCartMock).not.toHaveBeenCalled();
  });

  // ── Branch 2b: weekend ──────────────────────────────────────────────
  it.each([
    ['Saturday', '2027-01-02'],
    ['Sunday',   '2027-01-03'],
  ])('%s in London → rejected (matches UI: option filtered out)', async (_label, dateKey) => {
    vi.useFakeTimers();
    vi.setSystemTime(londonWinter(dateKey, 9, 0));
    expect(checkNextDayEligibility(new Date()).qualifies).toBe(false);

    await expect(runCreateOrder(nextDayInput(UK))).rejects.toThrow();
    expect(runValidateCartMock).not.toHaveBeenCalled();
  });

  // ── Branch 2c: today is a UK bank holiday ───────────────────────────
  it('today is a UK bank holiday (2027-01-01) → rejected', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(londonWinter('2027-01-01', 9, 0)); // New Year's Day
    expect(checkNextDayEligibility(new Date()).qualifies).toBe(false);

    await expect(runCreateOrder(nextDayInput(UK))).rejects.toThrow();
    expect(runValidateCartMock).not.toHaveBeenCalled();
  });

  // ── Branch 2d: tomorrow is a UK bank holiday (Boxing Day roll) ──────
  it('tomorrow is a UK bank holiday (2027-12-27) → rejected', async () => {
    vi.useFakeTimers();
    // 2027-12-24 is Fri; the next working day after Fri lands on Mon
    // 2027-12-27 which IS a UK bank holiday, so eligibility must fail.
    vi.setSystemTime(londonWinter('2027-12-24', 9, 0));
    expect(checkNextDayEligibility(new Date()).qualifies).toBe(false);

    await expect(runCreateOrder(nextDayInput(UK))).rejects.toThrow();
    expect(runValidateCartMock).not.toHaveBeenCalled();
  });

  // ── Positive control: inside every gate, next_day_12 IS accepted ────
  it('UK + Mon 09:00 + not a holiday → accepted and priced at £7.99', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(londonWinter('2027-01-04', 9, 0));
    expect(checkNextDayEligibility(new Date()).qualifies).toBe(true);

    const res = await runCreateOrder(nextDayInput(UK));
    expect(res.shippingCost).toBe(7.99);
    expect(written).toHaveLength(1);
    expect((written[0] as { shippingMethod: string }).shippingMethod).toBe('next_day_12');
    expect((written[0] as { expectedDeliveryDate: string }).expectedDeliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
