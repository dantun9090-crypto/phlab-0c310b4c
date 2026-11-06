/**
 * Admin on/off switch for the PeptidePay checkout method.
 *
 * Document: site_config/peptidepay  { enabled: boolean, updatedAt }
 *
 * Wallid Pay by Bank is unaffected by this flag — it stays the default
 * method regardless of this setting.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DOC_PATH = ['site_config', 'peptidepay'] as const;

/** Default when no admin choice has been saved yet. */
export const PEPTIDEPAY_DEFAULT_ENABLED = false;

export async function loadPeptidePayEnabled(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    const data = snap.data();
    if (data && typeof data.enabled === 'boolean') return data.enabled;
  } catch (err) {
    console.warn('[peptidepay-toggle] load failed, using default', err);
  }
  return PEPTIDEPAY_DEFAULT_ENABLED;
}

export async function savePeptidePayEnabled(enabled: boolean): Promise<void> {
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    { enabled, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Live-subscribed hook used by checkout to show/hide the card. */
export function usePeptidePayEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState<boolean>(PEPTIDEPAY_DEFAULT_ENABLED);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => {
        const data = snap.data();
        setEnabled(data && typeof data.enabled === 'boolean' ? data.enabled : PEPTIDEPAY_DEFAULT_ENABLED);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { enabled, loading };
}
