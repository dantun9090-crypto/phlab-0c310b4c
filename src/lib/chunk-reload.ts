import {
  hardReload,
  hasHydrationErrorState,
  isHydrationMismatchError,
  isOnline,
  isStaleChunkError,
  markHydrationError,
} from "@/lib/recovery";
import { logSwTelemetry, markCacheResetPending } from "@/lib/swTelemetry";
import { currentBrowser } from "@/lib/browser-info";

// Robust auto-recovery for a frozen / stuck page.
//
// Three layers:
// 1) Stale-chunk detection — when a lazy import fails (typically after a
//    new deploy), the page appears frozen. We trigger a one-shot reload.
// 2) Generic runtime error / unhandled rejection capture — if the same
//    error fires repeatedly in a short window the app is stuck in a loop;
//    reload once.
// 3) Tab-revisit revalidation — when the user returns to the tab after a
//    long pause, ping the server. If the current build no longer exists
//    or the page has been hidden > 30 min, soft reload.

const RELOAD_KEY = "__phl_reloaded_at";
const RELOAD_COUNT_KEY = "__phl_reloaded_count";
const COOLDOWN_MS = 15_000;
const REVISIT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const ERROR_BURST_WINDOW_MS = 4_000;
const ERROR_BURST_LIMIT = 6;

function getCurrentBuildId(): string {
  try {
    const meta = document.querySelector('meta[name="build-id"]') as HTMLMetaElement | null;
    if (meta?.content) return meta.content;
  } catch { /* ignore */ }
  return "unknown";
}

function logAutoPurge(detail: {
  stage: string;
  buildId: string;
  result?: unknown;
  reason?: string;
  error?: unknown;
}) {
  try {
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `%c[auto-purge] %c${detail.stage}%c build=${detail.buildId}`,
      "color:#10b981;font-weight:700",
      "color:#f0f6ff",
      "color:#9fb0c8",
    );
    // eslint-disable-next-line no-console
    if (detail.reason) console.log("reason:", detail.reason);
    // eslint-disable-next-line no-console
    if (detail.result !== undefined) console.log("server result:", detail.result);
    // eslint-disable-next-line no-console
    if (detail.error) console.warn("error:", detail.error);
    // eslint-disable-next-line no-console
    console.groupEnd();
  } catch { /* ignore */ }
}

function extractAssetUrl(err: unknown): string | null {
  try {
    const anyErr = err as { message?: unknown; stack?: unknown };
    const msg = String([anyErr?.message, anyErr?.stack, err].filter(Boolean).join(" "));
    const match = msg.match(/https?:\/\/[^\s)'"`]+\/(?:assets|_build)\/[^\s)'"`]+\.(?:js|mjs|css|map)/i);
    if (match) return match[0];
  } catch {
    /* ignore */
  }
  return null;
}

function requestHydrationFallback(err: unknown): void {
  try {
    const fallback = (window as unknown as { __phlHydrationFallback?: (error?: unknown) => void }).__phlHydrationFallback;
    if (fallback) fallback(err);
  } catch {
    /* ignore */
  }
}

function stopForHydrationError(err: unknown): boolean {
  if (!isHydrationMismatchError(err)) return false;
  markHydrationError();
  requestHydrationFallback(err);
  // eslint-disable-next-line no-console
  console.warn("[chunk-reload] hydration mismatch detected; auto-reload disabled");
  return true;
}

const NEVER_RELOAD_PATHS = ["/login", "/auth", "/account", "/checkout", "/cart", "/register"];

function isCriticalRoute(): boolean {
  try {
    const path = window.location.pathname.toLowerCase();
    return NEVER_RELOAD_PATHS.some((p) => path.startsWith(p));
  } catch {
    return false;
  }
}

function showRecoveryToast(reason: string): void {
  try {
    if (document.getElementById('phl-recovery-toast')) return;
    const el = document.createElement('div');
    el.id = 'phl-recovery-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#0f172a;color:#f0f6ff;border:1px solid #1e293b;border-radius:10px;padding:12px 16px;font:600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);max-width:90vw;text-align:center';
    el.textContent = 'Loading the newest version…';
    document.body?.appendChild(el);
  } catch { /* ignore */ }
}

// --- Remote kill-switch --------------------------------------------------
// A single Firestore-backed flag (surfaced via /api/public/runtime-flags)
// lets us disable the entire chunk-reload fallback across all clients
// within ~60 s if a regression starts causing reload loops or bad UX.
// We cache the result in sessionStorage for the tab lifetime AND memoize
// the in-flight promise to avoid stampedes when multiple events fire.
const KILL_SWITCH_KEY = "__phl_chunk_reload_enabled";
let killSwitchInFlight: Promise<boolean> | null = null;

async function isChunkReloadEnabled(): Promise<boolean> {
  try {
    const cached = sessionStorage.getItem(KILL_SWITCH_KEY);
    if (cached === "0") return false;
    if (cached === "1") return true;
  } catch { /* ignore */ }
  if (killSwitchInFlight) return killSwitchInFlight;
  killSwitchInFlight = (async () => {
    try {
      const res = await fetch("/api/public/runtime-flags", {
        method: "GET", cache: "no-store", credentials: "omit",
      });
      if (!res.ok) return true; // fail-open: keep recovery working
      const j = (await res.json()) as { chunkReloadEnabled?: boolean };
      const enabled = j?.chunkReloadEnabled !== false;
      try { sessionStorage.setItem(KILL_SWITCH_KEY, enabled ? "1" : "0"); } catch { /* ignore */ }
      return enabled;
    } catch {
      return true; // fail-open
    } finally {
      // Allow re-checking after 60s to pick up an updated flag.
      setTimeout(() => { killSwitchInFlight = null; }, 60_000);
    }
  })();
  return killSwitchInFlight;
}

async function doReload(reason: string) {
  if (!isOnline()) return;
  if (hasHydrationErrorState()) return;
  if (isCriticalRoute()) {
    // eslint-disable-next-line no-console
    console.warn("[RELOAD BLOCKED] Critical route:", window.location.pathname, "reason:", reason);
    try { logSwTelemetry('sw_cache_recovery_failed', { reason, blocked: 'critical-route', path: window.location.pathname }); } catch {}
    return;
  }
  // Remote kill-switch — if disabled, show a brief non-blocking message and
  // record the suppression. We must NOT re-surface the old "cache reset
  // needed" screen when this happens.
  const enabled = await isChunkReloadEnabled();
  if (!enabled) {
    try { logSwTelemetry('sw_cache_recovery_failed', { reason, blocked: 'kill-switch', path: window.location.pathname }); } catch {}
    try { showRecoveryToast('kill-switch'); } catch {}
    return;
  }
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0");
    if (count >= 1) { try { logSwTelemetry('sw_cache_recovery_failed', { reason, blocked: 'loop-guard', count }); } catch {} return; }
    if (Date.now() - last < COOLDOWN_MS) { try { logSwTelemetry('sw_cache_recovery_failed', { reason, blocked: 'cooldown' }); } catch {} return; }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
  } catch {
    /* ignore */
  }
  const b = currentBrowser();
  try {
    logSwTelemetry('sw_cache_recovery_triggered', {
      reason,
      browser: b.name,
      browserVersion: b.version,
      os: b.os,
      mobile: b.mobile,
      path: window.location.pathname,
    });
    markCacheResetPending();
  } catch { /* ignore */ }
  showRecoveryToast(reason);
  // Delay slightly so the toast paints AND the telemetry write flushes.
  setTimeout(() => { void hardReload({ clean: true }); }, 350);
}

// Self-heal: when a stale chunk is confirmed missing, fire the public
// post-publish-check endpoint. That endpoint detects the new __BUILD_ID__
// and triggers a full Cloudflare purge + Prerender.io recache for EVERY
// visitor in one shot, so the next reload (and other users' navigations)
// get fresh HTML pointing at chunks that still exist.
//
// Locking model:
//   - localStorage key scoped to the current buildId, so concurrent tabs
//     observe a single purge-per-build (cross-tab lock).
//   - The server also dedupes via a Firestore + in-process in-flight map.
//   - On network failure we still allow ONE retry per build, but never loop.
const SELF_HEAL_LOCK_PREFIX = "__phl_self_heal_lock:";
const SELF_HEAL_RESULT_PREFIX = "__phl_self_heal_result:";
const SELF_HEAL_LOCK_TTL_MS = 5 * 60 * 1000;
const SELF_HEAL_FAIL_RETRY_MS = 30_000;

async function triggerSelfHealPurge(reason: string): Promise<void> {
  const buildId = getCurrentBuildId();
  const lockKey = SELF_HEAL_LOCK_PREFIX + buildId;
  const resultKey = SELF_HEAL_RESULT_PREFIX + buildId;

  // Cross-tab lock — only one tab per build id triggers the purge, others
  // observe the cached result and log it.
  try {
    const lockRaw = localStorage.getItem(lockKey);
    if (lockRaw) {
      const lock = JSON.parse(lockRaw) as { at: number; ok?: boolean };
      const age = Date.now() - lock.at;
      // Held lock or successful prior call: skip. Failed call > FAIL_RETRY: allow retry.
      if (age < SELF_HEAL_LOCK_TTL_MS && (lock.ok !== false || age < SELF_HEAL_FAIL_RETRY_MS)) {
        const cached = localStorage.getItem(resultKey);
        logAutoPurge({
          stage: "skipped (cross-tab lock)",
          buildId,
          reason,
          result: cached ? JSON.parse(cached) : { ok: lock.ok, age },
        });
        return;
      }
    }
    localStorage.setItem(lockKey, JSON.stringify({ at: Date.now() }));
  } catch { /* ignore */ }

  try {
    const res = await fetch("/api/public/post-publish-check", {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const ok = res.ok;
    try {
      localStorage.setItem(lockKey, JSON.stringify({ at: Date.now(), ok }));
      localStorage.setItem(resultKey, JSON.stringify({ status: res.status, body }));
    } catch { /* ignore */ }
    logAutoPurge({
      stage: ok ? "purge requested" : "purge endpoint error (no loop)",
      buildId,
      reason,
      result: { status: res.status, body },
    });
  } catch (e) {
    // Network failure — record a failed lock so we won't hammer the endpoint,
    // but allow a single retry after FAIL_RETRY_MS. We do NOT loop reloads.
    try {
      localStorage.setItem(lockKey, JSON.stringify({ at: Date.now(), ok: false }));
    } catch { /* ignore */ }
    logAutoPurge({
      stage: "purge unreachable (offline fallback, no loop)",
      buildId,
      reason,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function reloadOnce(reason: string, err?: unknown, requireMissingAsset = true) {
  if (requireMissingAsset) {
    const assetUrl = extractAssetUrl(err);
    if (!assetUrl) {
      // eslint-disable-next-line no-console
      console.warn("[chunk-reload] skipped reload; no missing asset URL:", reason);
      return;
    }
    try {
      fetch(assetUrl, { method: "HEAD", cache: "no-store", credentials: "omit" })
        .then(async (res) => {
          if (res.status === 404 || res.status === 410) {
            // Fire purge FIRST, await briefly (max 3s) so the next navigation
            // already sees fresh HTML. Then reload.
            await Promise.race([
              triggerSelfHealPurge(`${reason} → ${assetUrl}`),
              new Promise((r) => setTimeout(r, 3000)),
            ]);
            void doReload(reason);
          } else console.warn("[chunk-reload] skipped reload; asset is not missing:", assetUrl, res.status);
        })
        .catch(() => undefined);
    } catch {
      /* ignore */
    }
    return;
  }
  void doReload(reason);
}

// Skip the entire auto-recovery install on /compound (and other marketing
// landings). Those routes don't render the e-commerce app shell, so we
// have no lazy chunks to police and no need to add listeners to the LCP
// path. See src/lib/is-marketing-route.ts.
import { isMarketingRoute as __phlIsMarketing } from "@/lib/is-marketing-route";

if (typeof window !== "undefined" && !__phlIsMarketing()) {
  // --- Layer 1: chunk errors ---
  window.addEventListener("error", (event) => {
    if (stopForHydrationError(event.error ?? event.message)) return;
    if (isStaleChunkError(event.error ?? event.message)) {
      reloadOnce("chunk error", event.error ?? event.message);
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (stopForHydrationError(event.reason)) return;
    if (isStaleChunkError(event.reason)) {
      reloadOnce("chunk rejection", event.reason);
    }
  });

  // --- Layer 1b: CSS/script/sourcemap load failures (resource errors).
  // Resource errors don't bubble, so use capture phase. A failed <link>,
  // <script src>, or sourcemap fetch from /assets|/_build is a stale-build
  // signal even when no JS Error fires.
  const ASSET_PATH_RE = /\/(?:assets|_build)\/[^?#]+\.(?:js|mjs|css|map)(?:[?#]|$)/i;
  window.addEventListener(
    "error",
    (event) => {
      const target = (event as ErrorEvent).target as
        | (HTMLLinkElement & { href?: string })
        | (HTMLScriptElement & { src?: string })
        | (HTMLImageElement & { src?: string })
        | null;
      if (!target || target === (window as unknown as EventTarget)) return;
      const src = ((target as HTMLLinkElement).href || (target as HTMLScriptElement).src || "") + "";
      if (!src || !ASSET_PATH_RE.test(src)) return;
      const reason = (target as HTMLElement).tagName === "LINK" ? "css link error" : "asset load error";
      // Fabricate an Error so reloadOnce's URL extractor works uniformly.
      reloadOnce(reason, new Error(`Failed to load ${src}`));
    },
    true,
  );


  // --- Layer 2: error-burst detection (app stuck in a render loop) ---
  let burst: number[] = [];
  const recordError = (event: ErrorEvent | PromiseRejectionEvent) => {
    const source = "reason" in event ? event.reason : event.error ?? event.message;
    if (stopForHydrationError(source) || hasHydrationErrorState()) return;
    if (!isStaleChunkError(source)) return;
    const now = Date.now();
    burst = burst.filter((t) => now - t < ERROR_BURST_WINDOW_MS);
    burst.push(now);
    if (burst.length >= ERROR_BURST_LIMIT) {
      reloadOnce("error burst", source);
    }
  };
  window.addEventListener("error", recordError);
  window.addEventListener("unhandledrejection", recordError);

  // --- Layer 3: tab-revisit ---
  let hiddenAt: number | null = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (document.visibilityState === "visible" && hiddenAt) {
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      if (away > REVISIT_THRESHOLD_MS) {
        console.info("[chunk-reload] long tab-away detected; automatic reload disabled");
      }
    }
  });
}

export {};
