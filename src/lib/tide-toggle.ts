/**
 * Admin on/off switch for the "Pay with Tide" checkout method
 * (hosted Tide payment link — QR code / Open Banking).
 *
 * Document: site_config/tide  { enabled: boolean, updatedAt }
 *
 * Wallid Pay by Bank and Manual Bank Transfer are unaffected by this flag.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DOC_PATH = ['site_config', 'tide'] as const;

/** Default when no admin choice has been saved yet (Tide is live today). */
export const TIDE_DEFAULT_ENABLED = true;

export async function loadTideEnabled(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    const data = snap.data();
    if (data && typeof data.enabled === 'boolean') return data.enabled;
  } catch (err) {
    console.warn('[tide-toggle] load failed, using default', err);
  }
  return TIDE_DEFAULT_ENABLED;
}

export async function saveTideEnabled(enabled: boolean): Promise<void> {
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    { enabled, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Live-subscribed hook used by checkout to show/hide the Tide card. */
export function useTideEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState<boolean>(TIDE_DEFAULT_ENABLED);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => {
        const data = snap.data();
        setEnabled(data && typeof data.enabled === 'boolean' ? data.enabled : TIDE_DEFAULT_ENABLED);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { enabled, loading };
}
