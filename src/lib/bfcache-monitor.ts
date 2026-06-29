/**
 * Lightweight bfcache health monitor.
 *
 * Goals:
 *  1. Log whether the current page restored from the browser's back/forward
 *     cache (Chrome / Firefox / Safari) — invaluable for debugging the
 *     "images blank when I press Back" class of bugs.
 *  2. Warn loudly in the console if a public/anonymous route loaded with a
 *     `Cache-Control` header that disqualifies it from bfcache
 *     (i.e. contains `no-store`). The server (src/server.ts) is supposed to
 *     emit `private, max-age=0, must-revalidate` for these routes — anything
 *     stricter is a regression and means CF or an intermediary overrode it.
 *
 * Zero dependencies, idempotent, runs only in the browser.
 */

const SENSITIVE_PREFIXES = [
  "/admin",
  "/cart",
  "/checkout",
  "/payment",
  "/account",
  "/login",
  "/register",
  "/api/",
  "/vip",
];

function isSensitive(pathname: string): boolean {
  for (const p of SENSITIVE_PREFIXES) {
    if (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")) {
      return true;
    }
  }
  return false;
}

let installed = false;

export function installBfcacheMonitor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // 1) pageshow fires on initial load AND on bfcache restore.
  window.addEventListener("pageshow", (ev) => {
    const persisted = (ev as PageTransitionEvent).persisted === true;
    if (persisted) {
      // Restored from bfcache — DOM, images, scroll state all preserved.
      // No further work required. Useful for verification in DevTools.
      // eslint-disable-next-line no-console
      console.info("[bfcache] ✔ restored from back/forward cache:", location.pathname);
    }
  });

  // 2) Inspect the current document's Cache-Control via a HEAD probe so we
  //    can warn when an upstream (CDN/edge/Worker) overrides it with no-store
  //    on a route that should be bfcache-eligible. Runs once, deferred, and
  //    only for public routes. We use the current pathname (not "/") so
  //    per-route overrides are visible.
  const path = location.pathname;
  if (isSensitive(path)) return;

  const probe = () => {
    fetch(location.href, { method: "HEAD", credentials: "same-origin", cache: "no-store" })
      .then((res) => {
        const cc = (res.headers.get("cache-control") || "").toLowerCase();
        const cdn = (res.headers.get("cdn-cache-control") || "").toLowerCase();
        const blocksBfcache = cc.includes("no-store");
        const tag = "[bfcache]";
        if (blocksBfcache) {
          // eslint-disable-next-line no-console
          console.warn(
            `${tag} ⚠ Cache-Control on ${path} contains "no-store" — page is NOT bfcache-eligible. ` +
              `This causes images to flash blank on back/forward navigation. ` +
              `Headers: cache-control="${cc}" cdn-cache-control="${cdn}"`,
          );
        } else {
          // eslint-disable-next-line no-console
          console.debug(`${tag} ${path} cache-control="${cc}" cdn-cache-control="${cdn}"`);
        }
      })
      .catch(() => {
        /* ignore probe failures (offline, blocked, etc.) */
      });
  };

  if ("requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback(probe, { timeout: 4000 });
  } else {
    setTimeout(probe, 2500);
  }
}
