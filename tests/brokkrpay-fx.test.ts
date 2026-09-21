/**
 * BrokkrPay GBP→USD conversion.
 *
 * BrokkrPay charges WHOLE dollars, so the conversion must never round down
 * (we would undercharge) and must never emit a fractional amount (rejected).
 */
import { describe, it, expect } from 'vitest';
import {
  gbpPenceToUsdWhole,
  clampUsdRate,
  BROKKRPAY_DEFAULT_USD_RATE,
} from '../src/lib/brokkrpay-amount';

describe('clampUsdRate', () => {
  it('keeps sane rates and falls back on nonsense', () => {
    expect(clampUsdRate(1.27)).toBe(1.27);
    expect(clampUsdRate('1.35')).toBe(1.35);
    expect(clampUsdRate(0)).toBe(BROKKRPAY_DEFAULT_USD_RATE);
    expect(clampUsdRate(99)).toBe(BROKKRPAY_DEFAULT_USD_RATE);
    expect(clampUsdRate(undefined)).toBe(BROKKRPAY_DEFAULT_USD_RATE);
    expect(clampUsdRate('abc')).toBe(BROKKRPAY_DEFAULT_USD_RATE);
  });
});

describe('gbpPenceToUsdWhole', () => {
  it('always returns a whole number of dollars', () => {
    for (const pence of [1, 99, 100, 3998, 5699, 12345]) {
      const usd = gbpPenceToUsdWhole(pence, 1.27);
      expect(Number.isInteger(usd)).toBe(true);
    }
  });

  it('rounds up so the store is never underpaid', () => {
    // £39.98 * 1.27 = $50.7746 → $51
    expect(gbpPenceToUsdWhole(3998, 1.27)).toBe(51);
    // £56.99 * 1.27 = $72.3773 → $73
    expect(gbpPenceToUsdWhole(5699, 1.27)).toBe(73);
    // exact dollar stays put
    expect(gbpPenceToUsdWhole(10000, 1)).toBe(100);
  });

  it('enforces the $1 provider minimum for any non-zero basket', () => {
    expect(gbpPenceToUsdWhole(1, 1.27)).toBe(1);
    expect(gbpPenceToUsdWhole(50, 1.27)).toBe(1);
  });

  it('returns 0 for empty / invalid amounts', () => {
    expect(gbpPenceToUsdWhole(0, 1.27)).toBe(0);
    expect(gbpPenceToUsdWhole(-500, 1.27)).toBe(0);
    expect(gbpPenceToUsdWhole(Number.NaN, 1.27)).toBe(0);
  });

  it('uses the fallback rate when the configured rate is invalid', () => {
    expect(gbpPenceToUsdWhole(10000, 0)).toBe(gbpPenceToUsdWhole(10000, BROKKRPAY_DEFAULT_USD_RATE));
  });
});
