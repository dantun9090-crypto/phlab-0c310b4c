import { describe, expect, it } from 'vitest';
import {
  canRetryPayment,
  getDisplayStatus,
  payAgainHref,
} from './order-payment-retry';

describe('canRetryPayment', () => {
  it('allows pending Fena orders', () => {
    expect(canRetryPayment({ status: 'pending', paymentProvider: 'fena' })).toBe(true);
  });

  it('allows pending_payment Pay-by-Bank orders', () => {
    expect(
      canRetryPayment({ status: 'pending_payment', paymentMethod: 'pay_by_bank' }),
    ).toBe(true);
  });

  it('allows cancelled Fena orders (user cancelled at bank — still payable)', () => {
    expect(canRetryPayment({ status: 'cancelled', paymentProvider: 'fena' })).toBe(true);
  });

  it('is case-insensitive on status / method / provider', () => {
    expect(
      canRetryPayment({
        status: 'CANCELLED',
        paymentMethod: 'PAY_BY_BANK',
        paymentProvider: 'FENA',
      }),
    ).toBe(true);
  });

  it('rejects paid / shipped / delivered / refunded orders', () => {
    for (const status of ['paid', 'shipped', 'delivered', 'refunded']) {
      expect(canRetryPayment({ status, paymentProvider: 'fena' })).toBe(false);
    }
  });

  it('rejects cancelled orders that were NOT Pay-by-Bank/Fena (admin cancel)', () => {
    expect(canRetryPayment({ status: 'cancelled', paymentProvider: 'other' })).toBe(false);
    expect(canRetryPayment({ status: 'cancelled' })).toBe(false);
  });

  it('rejects manual bank_transfer orders (handled by 72h countdown instead)', () => {
    expect(
      canRetryPayment({ status: 'pending', paymentMethod: 'bank_transfer' }),
    ).toBe(false);
  });

  it('rejects orders with missing / unknown status', () => {
    expect(canRetryPayment({})).toBe(false);
    expect(canRetryPayment({ status: 'weird', paymentProvider: 'fena' })).toBe(false);
  });
});

describe('getDisplayStatus', () => {
  it('maps cancelled Fena orders to pending_payment so the badge reads "Awaiting Payment"', () => {
    expect(
      getDisplayStatus({ status: 'cancelled', paymentProvider: 'fena' }),
    ).toBe('pending_payment');
  });

  it('keeps admin-cancelled (non-retryable) orders as cancelled', () => {
    expect(getDisplayStatus({ status: 'cancelled' })).toBe('cancelled');
    expect(
      getDisplayStatus({ status: 'cancelled', paymentProvider: 'other' }),
    ).toBe('cancelled');
  });

  it('passes through other statuses unchanged', () => {
    for (const status of ['pending', 'pending_payment', 'paid', 'shipped', 'delivered', 'refunded']) {
      expect(getDisplayStatus({ status })).toBe(status);
    }
  });
});

describe('payAgainHref', () => {
  it('routes to /payment with the orderId query param', () => {
    expect(payAgainHref('order_123')).toBe('/payment?orderId=order_123');
  });

  it('URL-encodes ids containing reserved characters', () => {
    expect(payAgainHref('a b/c?d')).toBe('/payment?orderId=a%20b%2Fc%3Fd');
  });
});
