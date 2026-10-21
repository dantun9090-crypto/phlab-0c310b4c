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
  // E2E override: the Playwright suites run against production Firestore,
  // so an intentional admin pause would red the whole checkout pipeline.
  // `localStorage.phl_e2e_checkout_unpaused = "1"` (set via addInitScript)
  // forces the open state in tests only. Read once per render — NOT a hook.
  let e2eUnpaused = false;
  try {
    e2eUnpaused = typeof window !== 'undefined'
      && window.localStorage.getItem('phl_e2e_checkout_unpaused') === '1';
  } catch {
    /* ignore — private mode */
  }
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (e2eUnpaused) return;
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => setPaused(snap.data()?.paused === true),
      () => undefined,
    );
    return () => unsub();
  }, [e2eUnpaused]);
  return e2eUnpaused ? false : paused;
}
