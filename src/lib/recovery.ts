/**
 * Stale-chunk recovery helpers.
 *
 * Pure, side-effect-light, and DOM-API-only so they can be unit tested in
 * jsdom with mocked `caches` / `navigator.serviceWorker` / `window.location`.
 *
 * Used by src/routes/__root.tsx (ErrorComponent + OfflineScreen).
 */

export function isStaleChunkError(err: unknown): boolean {
  if (!err) return false;
  if (isHydrationMismatchError(err)) return false;
  const anyErr = err as { message?: unknown; name?: unknown };
  const msg = String(anyErr?.message ?? anyErr?.name ?? err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Unable to preload (?:CSS|module)/i.test(msg)
  );
}

export const HYDRATION_ERROR_FLAG = "__phl_hydration_error_seen";

export function isHydrationMismatchError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { message?: unknown; name?: unknown; stack?: unknown };
  const msg = String(
    [anyErr?.message, anyErr?.name, anyErr?.stack, err]
      .filter(Boolean)
      .join(" "),
  );
  return (
    /Minified React error #418\b/i.test(msg) ||
    /react\.dev\/errors\/418\b/i.test(msg) ||
    /NotFoundError.+removeChild/i.test(msg) ||
    /removeChild.+not a child of this node/i.test(msg) ||
    /Node\.removeChild/i.test(msg) ||
    /Hydration failed/i.test(msg) ||
    /hydration mismatch/i.test(msg) ||
    /server rendered HTML didn't match/i.test(msg) ||
    /server-rendered HTML.+client-side React/i.test(msg)
  );
}

export function markHydrationError(): void {
  try { sessionStorage.setItem(HYDRATION_ERROR_FLAG, String(Date.now())); }
  catch { /* ignore */ }
}

export function clearHydrationError(): void {
  try { sessionStorage.removeItem(HYDRATION_ERROR_FLAG); }
  catch { /* ignore */ }
}

export function hasHydrationErrorState(): boolean {
  try { return sessionStorage.getItem(HYDRATION_ERROR_FLAG) === "1" || !!sessionStorage.getItem(HYDRATION_ERROR_FLAG); }
  catch { return false; }
}

// Caches owned by THIS app's service worker (see public/sw.js) and runtime
// LKG (last-known-good) cache (see src/lib/lkg-cache.ts). Anything else on
// the origin — notably `firebase-messaging-*` for FCM push and any future
// third-party worker — is left untouched.
export const APP_CACHE_PREFIXES = [
  "phlabs-offline-",
  "phlabs-lkg-",
  "phlabs-",
  "workbox-",
  "precache-",
  "runtime-",
];

export function isAppOwnedCache(name: string): boolean {
  if (APP_CACHE_PREFIXES.some((p) => name.startsWith(p))) return true;
  return /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
}

// Caches safe to evict during a deploy recovery. Keep phlabs-lkg-* so if the
// network is still unavailable after the hard reload, the offline screen can
// still offer last-known content instead of a dead end.
export function isEvictableAppCache(name: string): boolean {
  if (name.startsWith("phlabs-lkg-")) return false;
  if (APP_CACHE_PREFIXES.some((p) => name.startsWith(p))) return true;
  return /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
}

// Matches the SW we register in src/lib/sw-register.ts. Filtering by
// scriptURL means we never touch a Firebase Messaging or third-party SW.
export const APP_SW_SCRIPT_BASENAMES = new Set(["sw.js", "service-worker.js"]);

export function isAppOwnedRegistration(
  reg: ServiceWorkerRegistration,
): boolean {
  const url =
    reg.active?.scriptURL ||
    reg.installing?.scriptURL ||
    reg.waiting?.scriptURL ||
    "";
  if (!url) return false;
  try {
    const u = new URL(url);
    if (
      typeof window !== "undefined" &&
      u.origin !== window.location.origin
    ) {
      return false;
    }
    const basename = u.pathname.split("/").pop() || "";
    return APP_SW_SCRIPT_BASENAMES.has(basename);
  } catch {
    return false;
  }
}

/**
 * Scoped eviction: unregisters ONLY our app-shell service worker(s) and
 * deletes ONLY the cache buckets we own. Awaits so the next navigation
 * can't be intercepted by the old worker. Bounded by `timeoutMs` so the
 * caller never hangs on a stalled SW or cache backend.
 */
export async function clearClientCaches(timeoutMs = 1500): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      tasks.push(
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) =>
            Promise.allSettled(
              regs
                .filter(isAppOwnedRegistration)
                .map((r) => r.unregister().catch(() => false)),
            ),
          )
          .catch(() => undefined),
      );
    }
  } catch { /* ignore */ }

  try {
    if (typeof caches !== "undefined") {
      tasks.push(
        caches
          .keys()
          .then((keys) =>
            Promise.allSettled(
              keys
                .filter(isEvictableAppCache)
                .map((k) => caches.delete(k).catch(() => false)),
            ),
          )
          .catch(() => undefined),
      );
    }
  } catch { /* ignore */ }

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

export const HARD_RELOAD_FLAG = "__phl_hard_reload_in_flight";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type HardReloadOptions = {
  clean?: boolean;
  home?: boolean;
};

function stripRecoveryParams(url: URL): void {
  url.searchParams.delete("_r");
  url.searchParams.delete("sw");
  url.searchParams.delete("stale_recovery");
}

export function isOnline(): boolean {
  try {
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  } catch {
    return true;
  }
}

/**
 * Performs the scoped eviction then navigates to a clean version of the same
 * URL. Re-entrant: a second concurrent call is a no-op so double-clicks can't
 * queue multiple navigations.
 */
export async function hardReload(options: HardReloadOptions = {}): Promise<void> {
  try {
    if (sessionStorage.getItem(HARD_RELOAD_FLAG) === "1") return;
    sessionStorage.setItem(HARD_RELOAD_FLAG, "1");
  } catch { /* ignore */ }

  await clearClientCaches(options.clean ? 4000 : 1500);

  // Give Cloudflare/Prerender purges a short propagation window before the
  // navigation. Without this, stale HTML can be re-fetched immediately after
  // a deploy/purchase purge and the browser can appear to "spin refresh".
  if (options.clean) await wait(2000);

  try {
    const url = new URL(window.location.href);
    if (options.home) {
      url.pathname = "/";
      url.hash = "";
    }
    stripRecoveryParams(url);
    if (options.clean) url.searchParams.set("sw", "off");
    window.location.replace(url.toString());
  } catch {
    try { window.location.reload(); } catch { /* give up */ }
  }
}

/**
 * Scans app-owned Cache Storage buckets for the most recent same-origin
 * HTML response and returns its path+search. Used by the offline screen
 * to offer a "last cached page" link.
 */
export async function findCachedLastKnownUrl(): Promise<string | null> {
  try {
    if (typeof caches === "undefined") return null;
    const keys = await caches.keys();
    for (const name of keys.filter(isAppOwnedCache)) {
      const cache = await caches.open(name).catch(() => null);
      if (!cache) continue;
      const reqs = await cache.keys().catch(() => [] as Request[]);
      const sameOrigin = reqs.filter((r) => {
        try { return new URL(r.url).origin === window.location.origin; }
        catch { return false; }
      });
      const root = sameOrigin.find((r) => new URL(r.url).pathname === "/");
      const candidates = root ? [root, ...sameOrigin] : sameOrigin;
      for (const req of candidates) {
        const res = await cache.match(req).catch(() => null);
        if (res && (res.headers.get("content-type") || "").includes("text/html")) {
          const u = new URL(req.url);
          return u.pathname + u.search;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}
