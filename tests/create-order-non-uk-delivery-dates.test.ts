/**
 * Regression: non-UK orders must NOT be stamped with UK-timezone delivery
 * dates.
 *
 * `getStandardDeliveryWindow()` / `checkNextDayEligibility()` /
 * `getCutoffInstant()` all reason in Europe/London and skip UK bank
 * holidays. Sending those dates to a shopper in Germany, Ireland, or
 * "Other" is misleading — customs, international carriers, and local
 * public holidays make a fixed UK-day promise impossible to honour.
 *
 * `runCreateOrder` therefore leaves `expectedDeliveryDate`,
 * `expectedDeliveryFrom`, `expectedDeliveryTo`, and `cutoffTime` null for
 * every non-UK customer, and downstream email/UI code renders a generic
 * international message instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const runValidateCartMock = vi.fn();
vi.mock('../src/lib/cart-validation.server', () => ({
  runValidateCart: (...a: unknown[]) => runValidateCartMock(...a),
}));

const writtenOrders: Array<Record<string, unknown>> = [];
vi.mock('../src/lib/server/firestore-admin', () => ({
  addDocAdmin: vi.fn(async (_col: string, data: Record<string, unknown>) => {
    writtenOrders.push(data);
    return { id: `fake-${writtenOrders.length}` };
  }),
  getDocAdmin: vi.fn(async () => null),
  updateDocAdmin: vi.fn(async () => undefined),
}));

vi.mock('../src/lib/server/firebase-auth-admin', () => ({
  verifyFirebaseIdToken: vi.fn(async () => ({ uid: 'test-user' })),
}));
vi.mock('../src/lib/server/cache-invalidation', () => ({
  invalidateProductCacheFromServer: vi.fn(async () => undefined),
}));

import { runCreateOrder, type CreateOrderInput } from '../src/lib/create-order.server';

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
const IE = {
  firstName: 'Aoife', lastName: 'Byrne', email: 'a@b.ie',
  address: "1 O'Connell Street", city: 'Dublin',
  postcode: 'D02 XY45', country: 'Ireland', phone: '',
};
const OTHER = { ...DE, country: 'Other', postcode: '75008' };

function input(customer: typeof UK, overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    items: [{ productId: 'pt-141', productName: 'PT-141', quantity: 1 }],
    customer,
    shippingMethod: 'standard',
    paymentMethod: 'wallid',
    ageVerified: true,
    termsAccepted: true,
    couponCode: null,
    customerNote: null,
    idToken: null,
    ...overrides,
  };
}

describe('runCreateOrder — non-UK orders never get UK-timezone delivery dates', () => {
  beforeEach(() => {
    writtenOrders.length = 0;
    runValidateCartMock.mockReset();
    runValidateCartMock.mockResolvedValue({
      ok: true,
      items: [{ productId: 'pt-141', variantId: null, unitPrice: 14.99 }],
      subtotal: 14.99,
      discount: 0,
      shippingDiscount: 0,
      coupon: null,
      errors: [],
    });
  });

  it('UK standard order IS stamped with a Europe/London delivery window', async () => {
    await runCreateOrder(input(UK));
    const order = writtenOrders[0];
    expect(order.expectedDeliveryFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(order.expectedDeliveryTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(order.expectedDeliveryDate).toBeNull();
    expect(order.cutoffTime).toBeInstanceOf(Date);
  });

  it.each([
    ['Germany', DE],
    ['Ireland', IE],
    ['Other',   OTHER],
  ])('%s standard order leaves all UK-timezone delivery fields null', async (_label, customer) => {
    await runCreateOrder(input(customer));
    const order = writtenOrders[0];
    expect(order.expectedDeliveryDate).toBeNull();
    expect(order.expectedDeliveryFrom).toBeNull();
    expect(order.expectedDeliveryTo).toBeNull();
    expect(order.cutoffTime).toBeNull();
    // Sanity — the shopper's country IS persisted for downstream code.
    expect((order.customer as { country: string }).country).toBe(customer.country);
  });

  it('non-UK order cannot be booked as next_day_12 in the first place', async () => {
    await expect(
      runCreateOrder(input(DE, { shippingMethod: 'next_day_12' })),
    ).rejects.toThrow(/UK/i);
    expect(writtenOrders).toHaveLength(0);
  });
});
