/**
 * Firestore persistence + React hook for the admin-curated list of
 * Wallid trust badges shown on checkout. Selection is a simple array
 * of badge IDs (see `wallid-badge-catalog.ts`).
 *
 * Document: site_config/wallid_badges  { ids: string[], updatedAt }
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_WALLID_BADGE_IDS } from '@/lib/wallid-badge-catalog';

const DOC_PATH = ['site_config', 'wallid_badges'] as const;

export async function loadWallidBadgeIds(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    const data = snap.data();
    if (data && Array.isArray(data.ids) && data.ids.every((x) => typeof x === 'string')) {
      return data.ids as string[];
    }
  } catch (err) {
    console.warn('[wallid-badges] load failed, using defaults', err);
  }
  return DEFAULT_WALLID_BADGE_IDS;
}

export async function saveWallidBadgeIds(ids: string[]): Promise<void> {
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    { ids, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Live-subscribed hook used by the checkout badge row. */
export function useWallidBadgeIds(): { ids: string[]; loading: boolean } {
  const [ids, setIds] = useState<string[]>(DEFAULT_WALLID_BADGE_IDS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => {
        const data = snap.data();
        if (data && Array.isArray(data.ids) && data.ids.every((x) => typeof x === 'string')) {
          setIds(data.ids as string[]);
        } else {
          setIds(DEFAULT_WALLID_BADGE_IDS);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { ids, loading };
}
