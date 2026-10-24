import { useEffect, useState } from "react";
import { bannerConfig as defaults, type BannerConfig } from "@/config/banner.config";

const DOC_PATH = ["settings", "smartBanner"] as const;

export function mergeSmartBannerConfig(raw: Partial<BannerConfig> | undefined | null): BannerConfig {
  return { ...defaults, ...(raw ?? {}) };
}

export async function loadSmartBannerConfig(): Promise<BannerConfig> {
  try {
    const { db, doc, getDoc } = await import("@/lib/firebase");
    const snap = await getDoc(doc(db, ...DOC_PATH));
    if (!snap.exists()) return defaults;
    return mergeSmartBannerConfig(snap.data() as Partial<BannerConfig>);
  } catch {
    return defaults;
  }
}

export async function saveSmartBannerConfig(cfg: BannerConfig): Promise<void> {
  const { db, doc, setDoc, Timestamp } = await import("@/lib/firebase");
  await setDoc(
    doc(db, ...DOC_PATH),
    { ...cfg, updatedAt: Timestamp.now() },
    { merge: true },
  );
}

/**
 * SSR-safe subscription. Returns defaults on the server / before hydration,
 * then live Firestore values on the client.
 */
export function useSmartBannerConfig(): BannerConfig {
  const [cfg, setCfg] = useState<BannerConfig>(defaults);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void import("@/lib/firebase")
      .then(({ db, doc, onSnapshot }) => {
        if (cancelled) return;
        unsub = onSnapshot(
          doc(db, ...DOC_PATH),
          (snap) => {
            if (cancelled) return;
            if (!snap.exists()) {
              setCfg(defaults);
              return;
            }
            setCfg(mergeSmartBannerConfig(snap.data() as Partial<BannerConfig>));
          },
          () => {
            if (!cancelled) setCfg(defaults);
          },
        );
      })
      .catch(() => {
        // ignore — keep defaults
      });
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  return cfg;
}
