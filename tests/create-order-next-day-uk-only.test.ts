/**
 * Regression: `runCreateOrder` must reject `shippingMethod: 'next_day_12'`
 * whenever `customer.country` is not "United Kingdom".
 *
 * Next Day by 12 PM is a UK-only Royal Mail service. The client UI hides the
 * option for non-UK addresses (see src/pages/Checkout/index.tsx), but the
 * server is the source of truth — a hand-crafted payload from a non-UK
 * shopper MUST be refused with a clear error, and MUST NOT proceed to cart
 * re-validation, coupon application, or a Firestore write.
 *
 * All external side-effects (`runValidateCart`, admin Firestore writes,
 * cache invalidation, Firebase Auth verification) are mocked. If the guard
 * regresses and lets a non-UK next-day order through, `runValidateCart`
 * will be invoked and the assertions below fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────
// Must be declared BEFORE importing the SUT so vitest hoists them correctly.
const runValidateCartMock = vi.fn();
vi.mock('../src/lib/cart-validation.server', () => ({
  runValidateCart: (...args: unknown[]) => runValidateCartMock(...args),
}));

const addDocAdminMock = vi.fn(async () => ({ id: 'fake-doc' }));
const getDocAdminMock = vi.fn(async () => null);
const updateDocAdminMock = vi.fn(async () => undefined);
vi.mock('../src/lib/server/firestore-admin', () => ({
  addDocAdmin: (...a: unknown[]) => addDocAdminMock(...a),
  getDocAdmin: (...a: unknown[]) => getDocAdminMock(...a),
  updateDocAdmin: (...a: unknown[]) => updateDocAdminMock(...a),
}));

vi.mock('../src/lib/server/firebase-auth-admin', () => ({
  verifyFirebaseIdToken: vi.fn(async () => ({ uid: 'test-user' })),
}));

vi.mock('../src/lib/server/cache-invalidation', () => ({
  invalidateProductCacheFromServer: vi.fn(async () => undefined),
}));

import { runCreateOrder, type CreateOrderInput } from '../src/lib/create-order.server';

const baseCustomerUK = {
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.co.uk',
  phone: '',
  address: '10 Downing Street',
  city: 'London',
  postcode: 'SW1A 2AA',
  country: 'United Kingdom',
};

const baseCustomerDE = {
  firstName: 'Hans',
  lastName: 'Müller',
  email: 'hans@example.de',
  phone: '',
  address: 'Musterstraße 12',
  city: 'Berlin',
  postcode: '10115',
  country: 'Germany',
};

function baseInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    items: [{ productId: 'pt-141', productName: 'PT-141', quantity: 1 }],
    customer: baseCustomerUK,
    shippingMethod: 'next_day_12',
    paymentMethod: 'wallid',
    ageVerified: true,
    termsAccepted: true,
    couponCode: null,
    customerNote: null,
    idToken: null,
    ...overrides,
  };
}

describe('runCreateOrder — Next Day by 12 PM is UK-only', () => {
  beforeEach(() => {
    runValidateCartMock.mockReset();
    addDocAdminMock.mockClear();
    // Default: if cart validation is reached, return a valid pricing result.
    // The UK-only guard MUST fire before this is used.
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

  it.each([
    ['Germany',        baseCustomerDE],
    ['Ireland',        { ...baseCustomerDE, country: 'Ireland', postcode: 'D02 XY45' }],
    ['Other',          { ...baseCustomerDE, country: 'Other',   postcode: '10115' }],
    ['empty country',  { ...baseCustomerDE, country: '',        postcode: '10115' }],
  ])('rejects next_day_12 for %s and never calls runValidateCart', async (_label, customer) => {
    await expect(
      runCreateOrder(baseInput({ customer: customer as CreateOrderInput['customer'] })),
    ).rejects.toThrow(/Next Day by 12 PM.*UK/i);

    // Guard must run BEFORE any cart re-validation / Firestore work.
    expect(runValidateCartMock).not.toHaveBeenCalled();
    expect(addDocAdminMock).not.toHaveBeenCalled();
  });

  it('surfaces a clear, user-actionable error message', async () => {
    let caught: unknown;
    try {
      await runCreateOrder(baseInput({ customer: baseCustomerDE }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      'Next Day by 12 PM shipping is only available for UK delivery addresses.',
    );
  });

  it('allows next_day_12 for a UK customer (guard does not over-match)', async () => {
    // Reaching runValidateCart means the guard correctly let the UK order
    // through. We stop the flow at validation to avoid mocking every
    // downstream Firestore write for this focused test.
    runValidateCartMock.mockResolvedValueOnce({
      ok: false,
      errors: ['validation-stop-for-test'],
      items: [],
      subtotal: 0,
      discount: 0,
      shippingDiscount: 0,
      coupon: null,
    });
    await expect(runCreateOrder(baseInput())).rejects.toThrow('validation-stop-for-test');
    expect(runValidateCartMock).toHaveBeenCalledTimes(1);
  });

  it('allows standard shipping for a non-UK customer', async () => {
    runValidateCartMock.mockResolvedValueOnce({
      ok: false,
      errors: ['validation-stop-for-test'],
      items: [],
      subtotal: 0,
      discount: 0,
      shippingDiscount: 0,
      coupon: null,
    });
    await expect(
      runCreateOrder(baseInput({ shippingMethod: 'standard', customer: baseCustomerDE })),
    ).rejects.toThrow('validation-stop-for-test');
    expect(runValidateCartMock).toHaveBeenCalledTimes(1);
  });
});
