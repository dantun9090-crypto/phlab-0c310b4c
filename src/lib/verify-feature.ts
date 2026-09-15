/**
 * Global on/off switch for the batch verification feature (`/verify`).
 *
 * Stored in Firestore `settings/siteSettings` under `verifyBatchEnabled`
 * (default ON when the field is absent, so nothing changes for existing
 * installs). Toggled from Admin → Lab Tests.
 *
 * When OFF: the nav/footer links and the product-page "Certificates & lab
 * testing" block are hidden, and `/verify` shows a neutral notice. No URL,
 * slug, canonical or feed link is added or removed by this flag.
 */
import { useEffect, useState } from 'react';

const FIELD = 'verifyBatchEnabled';
const CACHE_KEY = 'php_site_settings';

function readCached(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed[FIELD] === undefined ? true : Boolean(parsed[FIELD]);
  } catch {
    return true;
  }
}

export async function fetchVerifyBatchEnabled(): Promise<boolean> {
  const { getDoc, doc, db } = await import('@/lib/firebase');
  const snap = await getDoc(doc(db, 'settings', 'siteSettings'));
  const value = snap.exists() ? (snap.data() as Record<string, unknown>)[FIELD] : undefined;
  return value === undefined ? true : Boolean(value);
}

export async function setVerifyBatchEnabled(enabled: boolean): Promise<void> {
  const { setDoc, doc, db } = await import('@/lib/firebase');
  await setDoc(doc(db, 'settings', 'siteSettings'), { [FIELD]: enabled }, { merge: true });
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed[FIELD] = enabled;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    /* cache is best-effort */
  }
}

/** Optimistic read: cached value first, then the live Firestore value. */
export function useVerifyBatchEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(readCached);

  useEffect(() => {
    let alive = true;
    void fetchVerifyBatchEnabled()
      .then((v) => {
        if (alive) setEnabled(v);
      })
      .catch(() => {
        /* keep the cached/default value */
      });
    return () => {
      alive = false;
    };
  }, []);

  return enabled;
}
