/**
 * Admin on/off switch that temporarily pauses the whole checkout.
 *
 * Document: site_config/checkoutPause  { paused: boolean, updatedAt }
 * Enforced server-side in runCreateOrder; the checkout page shows a notice.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DOC_PATH = ['site_config', 'checkoutPause'] as const;

export async function loadCheckoutPaused(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    return snap.data()?.paused === true;
  } catch (err) {
    console.warn('[checkout-pause] load failed', err);
    return false;
  }
}

export async function saveCheckoutPaused(paused: boolean): Promise<void> {
  await setDoc(doc(db, DOC_PATH[0], DOC_PATH[1]), { paused, updatedAt: serverTimestamp() }, { merge: true });
}

/** Live hook used by the checkout page. */
export function useCheckoutPaused(): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => setPaused(snap.data()?.paused === true),
      () => undefined,
    );
    return () => unsub();
  }, []);
  return paused;
}
