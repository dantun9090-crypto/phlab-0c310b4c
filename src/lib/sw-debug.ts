// Temporary Service Worker debug logger.
//
// Enable with `?sw_debug=1` (persists to localStorage) or `?sw_debug=0` to
// disable. Logs activations, controllerchange, statechange events, and
// periodic cache key snapshots to the browser console with the `[SW-DEBUG]`
// prefix so we can confirm there is no reload loop after publishing.
//
// Safe to ship: it only attaches listeners, never mutates SW state.

const TAG = "[SW-DEBUG]";
const LS_KEY = "__phl_sw_debug";

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("sw_debug");
    if (q === "1" || q === "true") {
      localStorage.setItem(LS_KEY, "1");
      return true;
    }
    if (q === "0" || q === "false") {
      localStorage.removeItem(LS_KEY);
      return false;
    }
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function log(...args: unknown[]): void {
  try {
    // eslint-disable-next-line no-console
    console.info(TAG, ...args);
  } catch {
    /* noop */
  }
}

export function startSwDebug(): void {
  if (!isEnabled()) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    log("serviceWorker unsupported");
    return;
  }

  log("enabled at", new Date().toISOString(), "ua=", navigator.userAgent);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    log("controllerchange — new controller:", navigator.serviceWorker.controller?.scriptURL ?? "(none)");
  });

  navigator.serviceWorker.addEventListener("message", (e) => {
    log("message from SW:", e.data);
  });

  navigator.serviceWorker.getRegistrations().then((regs) => {
    log("registrations:", regs.map((r) => ({ scope: r.scope, active: r.active?.scriptURL, waiting: r.waiting?.scriptURL })));
    for (const reg of regs) {
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        log("updatefound for", reg.scope, "installing=", sw?.scriptURL);
        sw?.addEventListener("statechange", () => {
          log("statechange", reg.scope, "->", sw.state);
        });
      });
    }
  }).catch((err) => log("getRegistrations error", err));

  // Cache snapshots — log changes only, every 5s for 60s.
  let last = "";
  let ticks = 0;
  const interval = window.setInterval(async () => {
    ticks += 1;
    try {
      const keys = (await caches.keys()).sort();
      const snap = keys.join("|");
      if (snap !== last) {
        log("caches.keys() changed:", keys);
        last = snap;
      }
    } catch (err) {
      log("caches.keys() error", err);
    }
    if (ticks >= 12) window.clearInterval(interval);
  }, 5000);

  // Initial snapshot.
  caches.keys().then((k) => log("caches.keys() initial:", k)).catch(() => { /* noop */ });
}
