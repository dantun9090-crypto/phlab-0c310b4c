/**
 * The order payload must never carry money. A hand-crafted request with
 * prices, discounts or totals is not honoured: the schema drops those keys,
 * so the server can only price from Firestore + the bundle rule.
 */
import { describe, it, expect } from 'vitest';
import { createOrderInputSchema } from '../src/lib/create-order.server';

const base = {
  items: [{ productId: 'bpc-157', productName: 'BPC-157', quantity: 2 }],
  customer: {
    firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '',
    address: '12 High Street', city: 'London', postcode: 'SW1A 1AA',
    country: 'United Kingdom',
  },
  shippingMethod: 'standard' as const,
  paymentMethod: 'wallid' as const,
  ageVerified: true as const,
  termsAccepted: true as const,
};

describe('create-order input schema — no client-supplied money', () => {
  it('strips injected price / discount / total fields', () => {
    const parsed = createOrderInputSchema.parse({
      ...base,
      subtotal: 1,
      discount: 999,
      bundleDiscount: 999,
      totalAmount: 0.01,
      shippingCost: 0,
      items: [{ productId: 'bpc-157', productName: 'BPC-157', quantity: 2, price: 0.01, total: 0.01 }],
    } as unknown);
    const flat = JSON.stringify(parsed);
    expect(flat).not.toContain('999');
    expect(flat).not.toContain('0.01');
    expect((parsed as Record<string, unknown>).totalAmount).toBeUndefined();
    expect((parsed as Record<string, unknown>).discount).toBeUndefined();
    expect(parsed.items[0]).toEqual({ productId: 'bpc-157', productName: 'BPC-157', quantity: 2 });
  });

  it('rejects an out-of-range quantity', () => {
    expect(() => createOrderInputSchema.parse({ ...base, items: [{ productId: 'x', productName: 'x', quantity: 0 }] })).toThrow();
    expect(() => createOrderInputSchema.parse({ ...base, items: [{ productId: 'x', productName: 'x', quantity: 100 }] })).toThrow();
  });

  it('rejects a coupon code with injected characters', () => {
    expect(() => createOrderInputSchema.parse({ ...base, couponCode: "SALE11' OR 1=1" })).toThrow();
  });
});
