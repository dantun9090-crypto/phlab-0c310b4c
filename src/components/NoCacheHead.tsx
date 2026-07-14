import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * Anti-cache head for sensitive flows (checkout/payment).
 *
 * - Emits no-store / no-cache meta tags so browsers + intermediate caches
 *   never serve a stale rendered checkout to a returning user.
 * - Kills Safari's back-forward cache (bfcache) — the biggest culprit for
 *   "old cart total" complaints on iPhone. When the page is restored from
 *   bfcache we force a real network reload so cart/pricing/stock are
 *   re-fetched.
 * - Detects `back_forward` navigation type (Chrome/Firefox parity) and
 *   reloads.
 *
 * Scoped ONLY to /checkout (and /payment). Other pages keep normal
 * caching so LCP on home/product isn't affected.
 */
export default function NoCacheHead({ title }: { title?: string }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        try {
          window.location.reload();
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('pageshow', onPageShow);

    // Detect back_forward navigation via Performance API (covers non-Safari).
    try {
      const nav = performance.getEntriesByType?.('navigation') as
        | PerformanceNavigationTiming[]
        | undefined;
      if (nav && nav[0] && (nav[0] as PerformanceNavigationTiming).type === 'back_forward') {
        // Only reload once per navigation — sessionStorage guard.
        const key = '__phl_bfcache_reload_at';
        const last = Number(sessionStorage.getItem(key) || '0');
        if (Date.now() - last > 2000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
        }
      }
    } catch {
      /* ignore */
    }

    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  return (
    <Helmet>
      {title ? <title>{title}</title> : null}
      <meta
        http-equiv="Cache-Control"
        content="no-store, no-cache, must-revalidate, proxy-revalidate"
      />
      <meta http-equiv="Pragma" content="no-cache" />
      <meta http-equiv="Expires" content="0" />
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}
