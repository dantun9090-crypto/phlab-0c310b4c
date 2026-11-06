/**
 * Admin on/off switch for the NOWPayments (crypto) checkout method.
 *
 * Document: site_config/nowpayments  { enabled: boolean, updatedAt }
 *
 * Wallid Pay by Bank is unaffected by this flag — it stays the default method
 * regardless of this setting.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DOC_PATH = ['site_config', 'nowpayments'] as const;

/** Default when no admin choice has been saved yet. */
export const NOWPAYMENTS_DEFAULT_ENABLED = false;

export async function loadNowPaymentsEnabled(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    const data = snap.data();
    if (data && typeof data.enabled === 'boolean') return data.enabled;
  } catch (err) {
    console.warn('[nowpayments-toggle] load failed, using default', err);
  }
  return NOWPAYMENTS_DEFAULT_ENABLED;
}

export async function saveNowPaymentsEnabled(enabled: boolean): Promise<void> {
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    { enabled, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Live-subscribed hook used by checkout to show/hide the card. */
export function useNowPaymentsEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState<boolean>(NOWPAYMENTS_DEFAULT_ENABLED);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => {
        const data = snap.data();
        setEnabled(
          data && typeof data.enabled === 'boolean' ? data.enabled : NOWPAYMENTS_DEFAULT_ENABLED,
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { enabled, loading };
}
