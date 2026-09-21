/**
 * BrokkrPay money maths — pure, dependency-free.
 *
 * Kept separate from `brokkrpay-fx.ts` (which pulls in the Firebase client)
 * so both the Cloudflare Worker routes and unit tests can import it cheaply.
 *
 * BrokkrPay settles in USD and charges WHOLE dollars — it rejects cents. Our
 * store prices in GBP pence, so every amount is converted with the
 * admin-configured rate and rounded UP, never down.
 */

/** Conservative default until an admin saves a rate. */
export const BROKKRPAY_DEFAULT_USD_RATE = 1.3;
export const BROKKRPAY_DEFAULT_ENABLED = false;
export const BROKKRPAY_MIN_RATE = 0.5;
export const BROKKRPAY_MAX_RATE = 3;

export interface BrokkrPayConfig {
  enabled: boolean;
  usdRate: number;
}

export function clampUsdRate(rate: unknown): number {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < BROKKRPAY_MIN_RATE || n > BROKKRPAY_MAX_RATE) {
    return BROKKRPAY_DEFAULT_USD_RATE;
  }
  return Math.round(n * 10000) / 10000;
}

/**
 * GBP pence → whole USD units, rounded UP.
 * `1` is the provider minimum, so any non-zero basket charges at least $1.
 */
export function gbpPenceToUsdWhole(amountPence: number, usdRate: number): number {
  const pence = Math.round(Number(amountPence));
  if (!Number.isFinite(pence) || pence <= 0) return 0;
  const rate = clampUsdRate(usdRate);
  return Math.max(1, Math.ceil((pence / 100) * rate));
}

/** Shopper-facing disclosure required by BrokkrPay — keep all three facts. */
export const BROKKRPAY_DISCLOSURE =
  'Before you pay. Your payment is handled by our retail partner — an online retail store — so your receipt and card statement will show retail items, not the products you ordered. Same products, same price, same delivery.';
