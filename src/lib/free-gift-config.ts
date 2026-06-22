import { useEffect, useState } from 'react';
import { db, doc, onSnapshot, getDoc, setDoc } from '@/lib/firebase';

export interface FreeGiftConfig {
  enabled: boolean;
  title: string;
  description: string;
  minSubtotal: number; // £, 0 = always
}

export const FREE_GIFT_DEFAULTS: FreeGiftConfig = {
  enabled: false,
  title: '3ml Vial Case',
  description: 'Free protective case with every order — limited promo',
  minSubtotal: 0,
};

const DOC_PATH = ['siteConfig', 'freeGift'] as const;

export async function loadFreeGiftConfig(): Promise<FreeGiftConfig> {
  try {
    const snap = await getDoc(doc(db, ...DOC_PATH));
    if (!snap.exists()) return FREE_GIFT_DEFAULTS;
    return { ...FREE_GIFT_DEFAULTS, ...(snap.data() as Partial<FreeGiftConfig>) };
  } catch {
    return FREE_GIFT_DEFAULTS;
  }
}

export async function saveFreeGiftConfig(cfg: FreeGiftConfig): Promise<void> {
  await setDoc(doc(db, ...DOC_PATH), cfg, { merge: true });
}

export function useFreeGiftConfig(): FreeGiftConfig {
  const [cfg, setCfg] = useState<FreeGiftConfig>(FREE_GIFT_DEFAULTS);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ...DOC_PATH),
      (snap) => {
        if (!snap.exists()) { setCfg(FREE_GIFT_DEFAULTS); return; }
        setCfg({ ...FREE_GIFT_DEFAULTS, ...(snap.data() as Partial<FreeGiftConfig>) });
      },
      () => setCfg(FREE_GIFT_DEFAULTS),
    );
    return () => unsub();
  }, []);
  return cfg;
}

export function freeGiftApplies(cfg: FreeGiftConfig, subtotal: number): boolean {
  return cfg.enabled && subtotal >= (cfg.minSubtotal || 0);
}
