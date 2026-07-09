/**
 * Server-side validation coverage for the Germany checkout flow.
 *
 * These tests exercise `createOrderInputSchema` directly (pure Zod, no
 * network, no Firestore) to lock down the country-aware rules added for
 * German shoppers:
 *
 *   - PLZ must be exactly 5 digits.
 *   - The street line must contain both a name (letters, incl. umlauts / ß)
 *     and a house number.
 *   - UK / IE regexes must NOT reject German input, and vice versa.
 *
 * If any of these regress, the check fails BEFORE the order write, so a
 * malformed German address can never land in Firestore.
 */
import { describe, it, expect } from 'vitest';
import { createOrderInputSchema } from '@/lib/create-order.server';

const baseValidInput = {
  items: [{ productId: 'pt-141', productName: 'PT-141', quantity: 1 }],
  shippingMethod: 'standard' as const,
  paymentMethod: 'wallid' as const,
  ageVerified: true as const,
  termsAccepted: true as const,
};

function withCustomer(customer: Record<string, string>) {
  return { ...baseValidInput, customer };
}

const goodDE = {
  firstName: 'Hans',
  lastName: 'Müller',
  email: 'hans@example.de',
  address: 'Musterstraße 12',
  city: 'Berlin',
  postcode: '10115',
  country: 'Germany',
};

describe('createOrderInputSchema — Germany', () => {
  it('accepts a well-formed German address', () => {
    const r = createOrderInputSchema.safeParse(withCustomer(goodDE));
    expect(r.success).toBe(true);
  });

  it('accepts umlaut / ß in the street', () => {
    const r = createOrderInputSchema.safeParse(
      withCustomer({ ...goodDE, address: 'Königsallee 3', city: 'Düsseldorf', postcode: '40212' }),
    );
    expect(r.success).toBe(true);
  });

  it.each([
    ['1234', 'too short'],
    ['123456', 'too long'],
    ['1234A', 'contains a letter'],
    ['SW1A 1AA', 'UK postcode format'],
    ['', 'empty'],
  ])('rejects PLZ "%s" (%s)', (postcode) => {
    const r = createOrderInputSchema.safeParse(withCustomer({ ...goodDE, postcode }));
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map(i => i.path.join('.'));
      expect(paths).toContain('customer.postcode');
    }
  });

  it('rejects a street line with no house number', () => {
    const r = createOrderInputSchema.safeParse(withCustomer({ ...goodDE, address: 'Musterstraße' }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some(i => i.path.join('.') === 'customer.address')).toBe(true);
    }
  });

  it('rejects a street line that is only a house number', () => {
    const r = createOrderInputSchema.safeParse(withCustomer({ ...goodDE, address: '12' }));
    expect(r.success).toBe(false);
  });

  it('rejects an empty street line', () => {
    const r = createOrderInputSchema.safeParse(withCustomer({ ...goodDE, address: '   ' }));
    expect(r.success).toBe(false);
  });
});

describe('createOrderInputSchema — cross-country isolation', () => {
  it('UK still accepts a valid UK postcode', () => {
    const r = createOrderInputSchema.safeParse(
      withCustomer({
        firstName: 'Alice', lastName: 'Smith', email: 'a@b.co.uk',
        address: '10 Downing Street', city: 'London',
        postcode: 'SW1A 2AA', country: 'United Kingdom',
      }),
    );
    expect(r.success).toBe(true);
  });

  it('UK rejects a German PLZ posted with country=UK', () => {
    const r = createOrderInputSchema.safeParse(
      withCustomer({
        firstName: 'Alice', lastName: 'Smith', email: 'a@b.co.uk',
        address: '10 Downing Street', city: 'London',
        postcode: '10115', country: 'United Kingdom',
      }),
    );
    expect(r.success).toBe(false);
  });

  it('Ireland accepts a valid Eircode', () => {
    const r = createOrderInputSchema.safeParse(
      withCustomer({
        firstName: 'Aoife', lastName: 'Byrne', email: 'a@b.ie',
        address: '1 O\'Connell Street', city: 'Dublin',
        postcode: 'D02 XY45', country: 'Ireland',
      }),
    );
    expect(r.success).toBe(true);
  });
});
