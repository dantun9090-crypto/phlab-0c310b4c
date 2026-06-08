/**
 * Last-Known-Good runtime precache.
 *
 * Without a service worker we can still write to Cache Storage from the
 * page. We use that to keep:
 *
 *  - The current page's HTML (so the offline screen can offer a
 *    "last cached page" link that actually opens).
 *  - The current page's critical same-origin assets (CSS, JS chunks)
 *    so when the browser eventually opens the cached HTML it can
 *    paint without a network round-trip.
 *
 * This is best-effort: every write is wrapped in try/catch and bounded
 * via Promise.allSettled. Quota errors are swallowed.
 *
 * Guards: only runs in production browsers on real PH Labs origins,
 * never in Lovable preview, dev, iframes, or when ?sw=off is present.
 */

const LKG_CACHE = "phlabs-lkg-v1";
const MAX_ENTRIES = 24; // soft cap — old entries pruned by URL recency
const MAX_ASSET_BYTES = 1_500_000; // skip individual responses > 1.5 MB

function isLovablePreviewHost(host: string): boolean {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev") ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovable.dev")
  );
}

function shouldPrecache(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof caches === "undefined") return false;
  if (!import.meta.env.PROD) return false;
  try {
    if (window.top !== window.self) return false;
    if (new URLSearchParams(window.location.search).get("sw") === "off") return false;
    if (isLovablePreviewHost(window.location.hostname)) return false;
  } catch { return false; }
  // Routes we never cache (personalised, mutating, or admin-only).
  const path = window.location.pathname;
  const skip = ["/admin", "/account", "/cart", "/checkout", "/payment", "/login", "/register", "/api", "/vip-store"];
  if (skip.some((p) => path.startsWith(p))) return false;
  return true;
}

async function pruneOldEntries(cache: Cache): Promise<void> {
  try {
    const reqs = await cache.keys();
    if (reqs.length <= MAX_ENTRIES) return;
    // Drop the oldest (insertion order in the Cache API).
    const drop = reqs.slice(0, reqs.length - MAX_ENTRIES);
    await Promise.allSettled(drop.map((r) => cache.delete(r)));
  } catch { /* ignore */ }
}

async function cachePut(cache: Cache, url: string): Promise<void> {
  try {
    const res = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (!res.ok) return;
    const len = Number(res.headers.get("content-length") || "0");
    if (len && len > MAX_ASSET_BYTES) return;
    await cache.put(url, res.clone());
  } catch { /* ignore */ }
}

function collectCriticalSameOriginAssets(): string[] {
  const out = new Set<string>();
  try {
    const origin = window.location.origin;
    // Stylesheets + scripts already in the document.
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((el) => {
      try {
        const u = new URL(el.href, origin);
        if (u.origin === origin) out.add(u.toString());
      } catch { /* ignore */ }
    });
    document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((el) => {
      try {
        const u = new URL(el.src, origin);
        if (u.origin === origin) out.add(u.toString());
      } catch { /* ignore */ }
    });
    // Anything the browser already fetched for this navigation — picks up
    // route-split chunks that loaded after hydration.
    try {
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      for (const e of entries) {
        if (!e.name) continue;
        if (!/\.(js|mjs|css)(\?|$)/i.test(e.name)) continue;
        try {
          const u = new URL(e.name);
          if (u.origin === origin) out.add(u.toString());
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  } catch { /* ignore */ }
  return Array.from(out).slice(0, MAX_ENTRIES);
}

let scheduled = false;

/**
 * Schedules a single best-effort precache pass for the current page.
 * Safe to call multiple times — only the first call per page does work.
 * Runs in `requestIdleCallback` when available to avoid contending with
 * hydration / LCP.
 */
export function schedulePrecacheCurrentPage(): void {
  if (scheduled) return;
  scheduled = true;
  if (!shouldPrecache()) return;

  const run = async () => {
    try {
      const cache = await caches.open(LKG_CACHE);
      const url = window.location.origin + window.location.pathname + window.location.search;
      const assets = collectCriticalSameOriginAssets();
      // Cache the HTML first (this is what the offline screen looks for),
      // then the assets so the cached HTML can render without network.
      await cachePut(cache, url);
      await Promise.allSettled(assets.map((a) => cachePut(cache, a)));
      await pruneOldEntries(cache);
    } catch { /* ignore */ }
  };

  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(() => { void run(); }, { timeout: 4000 });
  } else {
    setTimeout(() => { void run(); }, 2000);
  }
}
