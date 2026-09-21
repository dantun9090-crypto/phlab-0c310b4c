/**
 * BrokkrPay checkout availability + GBP→USD rate stored in Firestore
 * (site_config/brokkrpay). The pure conversion maths lives in
 * `brokkrpay-amount.ts` and is re-exported here for convenience.
 *
 * Safe to import on the client.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  clampUsdRate,
  BROKKRPAY_DEFAULT_ENABLED,
  BROKKRPAY_DEFAULT_USD_RATE,
  type BrokkrPayConfig,
} from '@/lib/brokkrpay-amount';

export {
  clampUsdRate,
  gbpPenceToUsdWhole,
  BROKKRPAY_DEFAULT_ENABLED,
  BROKKRPAY_DEFAULT_USD_RATE,
  BROKKRPAY_MIN_RATE,
  BROKKRPAY_MAX_RATE,
  BROKKRPAY_DISCLOSURE,
  type BrokkrPayConfig,
} from '@/lib/brokkrpay-amount';

const DOC_PATH = ['site_config', 'brokkrpay'] as const;

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
