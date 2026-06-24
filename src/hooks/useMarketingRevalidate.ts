import { useEffect, useRef } from 'react';

/**
 * Subscribes to settings/marketingVersion via Firestore onSnapshot. When the
 * admin saves a banner or advert (BannerTab / AdvertsTab call
 * bumpMarketingVersion), every open storefront tab fires `onChange` so it can
 * refetch its banner/advert state instantly — no waiting on CF edge TTL or
 * the 10-min localStorage cache.
 *
 * - Skips the initial snapshot emission (that's just the current value).
 * - Clears the homepage adverts localStorage cache on every bump.
 * - Fires a `marketing:revalidate` window event for any other listeners.
 * - Silent failure: if Firestore is unreachable, just no-ops.
 */
export function useMarketingRevalidate(onChange: () => void) {
  const lastVersion = useRef<number | null>(null);
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { db, doc, onSnapshot } = await import('@/lib/firebase');
        if (cancelled) return;
        unsub = onSnapshot(
          doc(db, 'settings', 'marketingVersion'),
          (snap) => {
            const v = (snap.data() as any)?.version;
            if (typeof v !== 'number') return;
            if (lastVersion.current === null) {
              lastVersion.current = v;
              return;
            }
            if (v === lastVersion.current) return;
            lastVersion.current = v;
            try { localStorage.removeItem('php_adverts_cache'); } catch { /* ignore */ }
            try { window.dispatchEvent(new CustomEvent('marketing:revalidate', { detail: { version: v } })); } catch { /* ignore */ }
            try { callbackRef.current(); } catch { /* ignore */ }
          },
          () => { /* permission/network error — silent */ },
        );
      } catch { /* ignore */ }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);
}
