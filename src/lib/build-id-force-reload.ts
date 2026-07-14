// Automatic force-reload when the server's BUILD_ID no longer matches the
// build the current tab was booted with.
//
// Problem this solves:
//   After a publish, Chrome (esp. Android) can hold onto a stale HTML shell
//   while the underlying hashed assets on the CDN have already rotated.
//   Users used to end up on the manual "Update available" wall — one more
//   click before the app worked. This module proactively detects the
//   mismatch and does a silent fresh-HTML recovery before the user ever sees
//   that wall.
//
// Signal source:
//   GET /api/public/health/build → { buildId } (also x-build-id header).
//   The endpoint is `cache-control: no-store` so every call is fresh.
//
// Trigger points (all cheap):
//   1. Tab becomes visible after being hidden.
//   2. Window regains focus.
//   3. `pageshow` (covers bfcache restore).
//   4. A slow 30-min interval as a floor.
//
// Safety rails (all needed — this ships to production):
//   • Runs only in the browser, only after mount, never in an iframe /
//     Lovable preview host.
//   • Never reloads on critical routes (checkout, auth, admin, etc.).
//   • Session-scoped one-shot flag → at most ONE force-reload per tab per
//     session, regardless of how many build changes happen while the tab
//     is open. Subsequent mismatches log only.
//   • 10s cooldown between checks; skip if a check is already in flight.
//   • Skips when offline (would just fail).
//   • The recovery path fetches `/` with `cache: "no-store"` before opening
//     clean `/`; no query-string cache busting is used for HTML.

import { hardReload as forceFreshHtmlReload } from "@/lib/recovery";

const CURRENT_BUILD_ID =
  typeof __BUILD_ID__ === "string" && __BUILD_ID__ ? __BUILD_ID__ : "dev";

const HEALTH_URL = "/api/public/health/build";
const CHECK_COOLDOWN_MS = 10_000;
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const RELOADED_KEY = "__phl_build_force_reload_at";
const CHECKED_AT_KEY = "__phl_build_check_at";

const NEVER_RELOAD_PATHS = [
  "/login",
  "/auth",
  "/account",
  "/checkout",
  "/cart",
  "/register",
  "/admin",
  "/payment",
];

function isPreviewOrIframe(): boolean {
  try {
    if (window.top !== window.self) return true;
    const host = window.location.hostname;
    if (
      host.startsWith("id-preview--") ||
      host.startsWith("preview--") ||
      host === "lovableproject.com" ||
      host.endsWith(".lovableproject.com") ||
      host === "lovableproject-dev.com" ||
      host.endsWith(".lovableproject-dev.com") ||
      host === "beta.lovable.dev" ||
      host.endsWith(".beta.lovable.dev")
    ) {
      return true;
    }
  } catch {
    /* cross-origin frame access → treat as iframe */
    return true;
  }
  return false;
}

function isCriticalRoute(): boolean {
  try {
    const path = window.location.pathname.toLowerCase();
    return NEVER_RELOAD_PATHS.some((p) => path.startsWith(p));
  } catch {
    return false;
  }
}

function alreadyReloadedThisSession(): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) != null;
  } catch {
    return false;
  }
}

function markReloadedThisSession(): void {
  try {
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function withinCooldown(): boolean {
  try {
    const raw = sessionStorage.getItem(CHECKED_AT_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < CHECK_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function stampCheck(): void {
  try {
    sessionStorage.setItem(CHECKED_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const headerBuild = res.headers.get("x-build-id");
    if (headerBuild) return headerBuild;
    const body = (await res.json()) as { buildId?: string };
    return body?.buildId ?? null;
  } catch {
    return null;
  }
}

async function requestPurgeBeforeReload(): Promise<void> {
  // Best-effort — capped at 2s so we never delay the reload noticeably.
  await Promise.race([
    fetch("/api/public/post-publish-check", {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
    }).catch(() => undefined),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
}

function forceReload(newBuildId: string): void {
  markReloadedThisSession();
  try {
    // eslint-disable-next-line no-console
    console.warn(
      `[build-id-force-reload] mismatch (client=${CURRENT_BUILD_ID}, server=${newBuildId}) → fetching fresh HTML`,
    );
    void forceFreshHtmlReload({ clean: true });
  } catch {
    try {
      window.location.replace("/");
    } catch {
      /* ignore */
    }
  }
}

let inFlight = false;

async function checkOnce(reason: string): Promise<void> {
  if (inFlight) return;
  if (!navigator.onLine) return;
  if (withinCooldown()) return;
  if (alreadyReloadedThisSession()) return;
  if (isCriticalRoute()) return;

  inFlight = true;
  stampCheck();
  try {
    const serverBuildId = await fetchServerBuildId();
    if (!serverBuildId) return;
    if (serverBuildId === CURRENT_BUILD_ID) return;
    // Re-check the guards right before the destructive action.
    if (alreadyReloadedThisSession() || isCriticalRoute()) {
      // eslint-disable-next-line no-console
      console.info(
        `[build-id-force-reload] mismatch on ${reason} but reload suppressed (critical/session-guard)`,
      );
      return;
    }
    await requestPurgeBeforeReload();
    forceReload(serverBuildId);
  } finally {
    inFlight = false;
  }
}

let installed = false;

export function installBuildIdForceReload(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (isPreviewOrIframe()) return;
  installed = true;

  const trigger = (reason: string) => {
    // Fire-and-forget; errors are swallowed in checkOnce.
    void checkOnce(reason);
  };

  try {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible") trigger("visibilitychange");
      },
      false,
    );
  } catch {
    /* ignore */
  }
  try {
    window.addEventListener("focus", () => trigger("focus"), false);
  } catch {
    /* ignore */
  }
  try {
    window.addEventListener(
      "pageshow",
      (ev: PageTransitionEvent) => {
        if (ev.persisted) trigger("pageshow-bfcache");
      },
      false,
    );
  } catch {
    /* ignore */
  }
  try {
    setInterval(() => trigger("interval"), INTERVAL_MS);
  } catch {
    /* ignore */
  }

  // NOTE: No initial-delayed trigger on fresh page loads.
  //
  // A fresh page load ALWAYS receives an HTML shell whose compiled
  // __BUILD_ID__ is the one the server just rendered — the whole point of
  // this detector is stale-tab recovery, not first-paint recovery. Running
  // the check ~1.5s after mount used to fire on every deploy while the
  // edge was warming up and triggered a `hardReload({ clean: true })`
  // mid-render — which the Playwright cache-stability suite
  // (`e2e/cache-stability.spec.ts`) then flags as "detected 2 main-frame
  // navigations — refresh loop" on every public route. Visibility / focus
  // / pageshow / interval remain — those fire only when the tab has been
  // idle long enough for a real build rotation to have happened.



}
