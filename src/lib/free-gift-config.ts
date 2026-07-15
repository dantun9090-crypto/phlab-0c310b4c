import { useEffect, useState } from 'react';
import { db, doc, onSnapshot, getDoc, setDoc } from '@/lib/firebase';

/**
 * A single gift the customer can receive / choose at checkout.
 * Multiple items => customer picks one (radio). One item => auto-applied
 * as before. `minSubtotal` gates each item independently so admins can
 * offer, e.g., "free pen ≥ £50" and "free case ≥ £100".
 */
export interface FreeGiftItem {
  id: string;
  title: string;
  description: string;
  /** £, 0 = always eligible when the promo is enabled. */
  minSubtotal: number;
  enabled: boolean;
}

export interface FreeGiftConfig {
  enabled: boolean;
  /** Legacy single-gift fields — still honoured when `items` is empty. */
  title: string;
  description: string;
  minSubtotal: number;
  /** New: multiple gifts the customer can choose from. */
  items: FreeGiftItem[];
}

export const FREE_GIFT_DEFAULTS: FreeGiftConfig = {
  enabled: false,
  title: '3ml Vial Case',
  description: 'Free protective case with every order — limited promo',
  minSubtotal: 0,
  items: [],
};

const DOC_PATH = ['site_config', 'freeGift'] as const;

function normalize(raw: Partial<FreeGiftConfig> | undefined | null): FreeGiftConfig {
  const merged: FreeGiftConfig = { ...FREE_GIFT_DEFAULTS, ...(raw || {}) };
  const items = Array.isArray(merged.items) ? merged.items : [];
  merged.items = items
    .filter((it) => it && typeof it === 'object')
    .map((it, idx) => ({
      id: String((it as any).id || `gift-${idx + 1}`),
      title: String((it as any).title || '').slice(0, 80),
      description: String((it as any).description || '').slice(0, 240),
      minSubtotal: Math.max(0, Number((it as any).minSubtotal) || 0),
      enabled: (it as any).enabled !== false,
    }));
  return merged;
}

export async function loadFreeGiftConfig(): Promise<FreeGiftConfig> {
  try {
    const snap = await getDoc(doc(db, ...DOC_PATH));
    if (!snap.exists()) return FREE_GIFT_DEFAULTS;
    return normalize(snap.data() as Partial<FreeGiftConfig>);
  } catch {
    return FREE_GIFT_DEFAULTS;
  }
}

export async function saveFreeGiftConfig(cfg: FreeGiftConfig): Promise<void> {
  await setDoc(doc(db, ...DOC_PATH), normalize(cfg), { merge: true });
}

export function useFreeGiftConfig(): FreeGiftConfig {
  const [cfg, setCfg] = useState<FreeGiftConfig>(FREE_GIFT_DEFAULTS);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ...DOC_PATH),
      (snap) => {
        if (!snap.exists()) { setCfg(FREE_GIFT_DEFAULTS); return; }
        setCfg(normalize(snap.data() as Partial<FreeGiftConfig>));
      },
      () => setCfg(FREE_GIFT_DEFAULTS),
    );
    return () => unsub();
  }, []);
  return cfg;
}

export function freeGiftApplies(cfg: FreeGiftConfig, subtotal: number): boolean {
  if (!cfg.enabled) return false;
  if (cfg.items.length > 0) return cfg.items.some((it) => it.enabled && subtotal >= (it.minSubtotal || 0));
  return subtotal >= (cfg.minSubtotal || 0);
}

/**
 * All gifts the customer currently qualifies for. Falls back to the legacy
 * single-gift shape when no `items` are configured, so behaviour is
 * unchanged for existing setups.
 */
export function eligibleGifts(cfg: FreeGiftConfig, subtotal: number): FreeGiftItem[] {
  if (!cfg.enabled) return [];
  if (cfg.items.length > 0) {
    return cfg.items.filter((it) => it.enabled && subtotal >= (it.minSubtotal || 0));
  }
  if (subtotal >= (cfg.minSubtotal || 0)) {
    return [{
      id: 'legacy',
      title: cfg.title || FREE_GIFT_DEFAULTS.title,
      description: cfg.description || '',
      minSubtotal: cfg.minSubtotal || 0,
      enabled: true,
    }];
  }
  return [];
}
