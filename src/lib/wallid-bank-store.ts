/**
 * Firestore persistence + live hook for the admin-curated list of
 * UK bank tiles shown on Wallid Pay-by-Bank checkout.
 *
 * Document: site_config/wallid_banks  { ids: string[], updatedAt }
 */
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_WALLID_BANK_IDS } from '@/lib/wallid-bank-catalog';

const DOC_PATH = ['site_config', 'wallid_banks'] as const;

export async function loadWallidBankIds(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    const data = snap.data();
    if (data && Array.isArray(data.ids) && data.ids.every((x) => typeof x === 'string')) {
      return data.ids as string[];
    }
  } catch (err) {
    console.warn('[wallid-banks] load failed, using defaults', err);
  }
  return DEFAULT_WALLID_BANK_IDS;
}

export async function saveWallidBankIds(ids: string[]): Promise<void> {
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    { ids, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function useWallidBankIds(): { ids: string[]; loading: boolean } {
  const [ids, setIds] = useState<string[]>(DEFAULT_WALLID_BANK_IDS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, DOC_PATH[0], DOC_PATH[1]),
      (snap) => {
        const data = snap.data();
        if (data && Array.isArray(data.ids) && data.ids.every((x) => typeof x === 'string')) {
          setIds(data.ids as string[]);
        } else {
          setIds(DEFAULT_WALLID_BANK_IDS);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  return { ids, loading };
}
