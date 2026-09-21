/**
 * BrokkrPay GBP→USD conversion + admin toggle.
 *
 * BrokkrPay settles in USD only and accepts WHOLE dollars — no cents. A
 * £39.98 basket therefore has to become an integer dollar amount. The rate is
 * set manually by an admin (site_config/brokkrpay.usdRate) and the converted
 * amount always rounds UP, so the shopper never pays less than the order is
 * worth.
 *
 * Safe to import on the client (no server-only modules).
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DOC_PATH = ['site_config', 'brokkrpay'] as const;

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
 *
 * `1` is the provider minimum, so any non-zero basket charges at least $1.
 */
export function gbpPenceToUsdWhole(amountPence: number, usdRate: number): number {
  const pence = Math.round(Number(amountPence));
  if (!Number.isFinite(pence) || pence <= 0) return 0;
  const rate = clampUsdRate(usdRate);
  return Math.max(1, Math.ceil((pence / 100) * rate));
}

export async function loadBrokkrPayConfig(): Promise<BrokkrPayConfig> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    const data = snap.data();
    if (data) {
      return {
        enabled: typeof data.enabled === 'boolean' ? data.enabled : BROKKRPAY_DEFAULT_ENABLED,
        usdRate: clampUsdRate(data.usdRate),
      };
    }
  } catch (err) {
    console.warn('[brokkrpay-fx] load failed, using defaults', err);
  }
  return { enabled: BROKKRPAY_DEFAULT_ENABLED, usdRate: BROKKRPAY_DEFAULT_USD_RATE };
}

export async function saveBrokkrPayConfig(patch: Partial<BrokkrPayConfig>): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (typeof patch.enabled === 'boolean') payload.enabled = patch.enabled;
  if (patch.usdRate !== undefined) payload.usdRate = clampUsdRate(patch.usdRate);
  await setDoc(doc(db, DOC_PATH[0], DOC_PATH[1]), payload, { merge: true });
}

/** Live-subscribed hook used by checkout to show/hide the BrokkrPay card. */
export function useBrokkrPayConfig(): BrokkrPayConfig & { loading: boolean } {
  const [config, setConfig] = useState<BrokkrPayConfig>({
    enabled: BROKKRPAY_DEFAULT_ENABLED,
    usdRate: BROKKRPAY_DEFAULT_USD_RATE,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => {
        const data = snap.data();
        setConfig({
          enabled: data && typeof data.enabled === 'boolean' ? data.enabled : BROKKRPAY_DEFAULT_ENABLED,
          usdRate: clampUsdRate(data?.usdRate),
        });
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { ...config, loading };
}

/** Shopper-facing disclosure required by BrokkrPay — keep all three facts. */
export const BROKKRPAY_DISCLOSURE =
  'Before you pay. Your payment is handled by our retail partner — an online retail store — so your receipt and card statement will show retail items, not the products you ordered. Same products, same price, same delivery.';
