/**
 * Auto-recovery for stale-chunk errors after a deploy.
 *
 * Trigger: window `error` / `unhandledrejection` whose message matches
 * `isStaleChunkError` (dynamic import failure, chunk load failure, missing
 * asset in /assets or /_build).
 *
 * Behaviour: show a full-screen countdown overlay (3s) with a "Cancel &
 * stay here" button. On countdown 0 (or if the user does nothing), clear
 * app-owned Service Worker registrations + caches, then hard-reload with
 * `?sw=off&_r=<ts>` so the next paint uses fresh HTML pointing at chunks
 * that still exist.
 *
 * Guard: `sessionStorage.__phl_chunk_recovery === '1'` — runs at most once
 * per session, so a persistent failure can never loop.
 *
 * Skipped when a hydration error was already logged (that has its own
 * fallback in client.tsx) or when the reload-loop breaker fired.
 */
import { isStaleChunkError, hasHydrationErrorState } from "@/lib/recovery";

const GUARD_KEY = "__phl_chunk_recovery";
const OVERLAY_ID = "phl-chunk-recovery-overlay";
const REPORTED_KEY = "__phl_chunk_reported";

let overlayShown = false;

function currentBuildId(): string | undefined {
  try {
    return (
      document.querySelector('meta[name="build-id"]')?.getAttribute("content") ||
      document.querySelector('meta[name="x-build-id"]')?.getAttribute("content") ||
      undefined
    );
  } catch { return undefined; }
}

function extractAssetUrl(err: unknown): string | null {
  try {
    const anyErr = err as { message?: unknown; stack?: unknown };
    const msg = String([anyErr?.message, anyErr?.stack, err].filter(Boolean).join(" "));
    const m = msg.match(/https?:\/\/[^\s)'"`]+\/(?:assets|_build)\/[^\s)'"`]+\.(?:js|mjs|css|map)/i);
    return m ? m[0] : null;
  } catch { return null; }
}

/**
 * Fire-and-forget beacon reporting a chunk mismatch / stale-cache event
 * with enough forensic detail to diagnose which build ↔ which asset
 * mismatch occurred, plus the Cloudflare cache status of the failing
 * asset when we can fetch its headers. Deduped per session so a burst
 * doesn't spam alerts.
 */
async function reportChunkMismatch(err: unknown): Promise<void> {
  try {
    if (sessionStorage.getItem(REPORTED_KEY) === "1") return;
    sessionStorage.setItem(REPORTED_KEY, "1");
  } catch { /* ignore */ }

  const buildId = currentBuildId();
  const assetUrl = extractAssetUrl(err);
  const anyErr = err as { message?: unknown; stack?: unknown };
  const message = String(anyErr?.message ?? err ?? "chunk load failure").slice(0, 500);
  const stack = typeof anyErr?.stack === "string" ? String(anyErr.stack).slice(0, 4000) : undefined;

  const details: Record<string, string | number | boolean | null> = {
    detector: "chunk-auto-recovery",
    assetUrl: assetUrl ?? "",
    online: typeof navigator !== "undefined" ? String(navigator.onLine) : "unknown",
  };

  // Best-effort: probe the failing asset URL to capture the CF cache-status
  // header. This tells us whether the miss is a stale CF cache vs an origin
  // 404 vs a network failure.
  if (assetUrl) {
    try {
      const probe = await fetch(assetUrl, { method: "HEAD", cache: "no-store", mode: "cors" });
      details["assetStatus"] = probe.status;
      details["cfCacheStatus"] = probe.headers.get("cf-cache-status") ?? "";
      details["age"] = probe.headers.get("age") ?? "";
      details["cacheControl"] = probe.headers.get("cache-control") ?? "";
      details["cdnCacheControl"] = probe.headers.get("cdn-cache-control") ?? "";
    } catch (probeErr) {
      details["probeError"] = String((probeErr as Error)?.message || probeErr).slice(0, 200);
    }
  }

  const payload = {
    type: "chunk_load_error" as const,
    path: location.pathname + location.search,
    referrer: document.referrer || undefined,
    userAgent: navigator.userAgent,
    message: `[chunk-auto-recovery] ${message}`,
    stack,
    buildId,
    release: buildId,
    details,
  };

  try {
    const body = JSON.stringify(payload);
    const url = "/api/public/error-monitor";
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    });
  } catch { /* never throw */ }
}


async function clearAppCachesAndSW(): Promise<void> {
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => /^(phlabs-|workbox-|precache-|runtime-)/i.test(n))
          .map((n) => caches.delete(n).catch(() => false)),
      );
    }
  } catch { /* ignore */ }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => {
            const url =
              r.active?.scriptURL ||
              r.installing?.scriptURL ||
              r.waiting?.scriptURL ||
              "";
            return /\/(?:sw|service-worker)\.js(?:$|[?#])/i.test(url);
          })
          .map((r) => r.unregister().catch(() => false)),
      );
    }
  } catch { /* ignore */ }
}

function reloadClean(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("nocache", "1");
    url.searchParams.set("sw", "off");
    url.searchParams.set("phl_loop_disabled", "1");
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.href = `/?nocache=1&sw=off&phl_loop_disabled=1&_r=${Date.now()}`;
  }
}

async function performRecovery(): Promise<void> {
  try { sessionStorage.setItem(GUARD_KEY, "1"); } catch { /* ignore */ }
  await clearAppCachesAndSW();
  reloadClean();
}

function recoverWithoutOverlay(): void {
  if (overlayShown) return;
  overlayShown = true;
  const existing = typeof document !== "undefined" ? document.getElementById(OVERLAY_ID) : null;
  try { existing?.remove(); } catch { /* ignore */ }
  void performRecovery();
}

function shouldHandle(err: unknown): boolean {
  if (!isStaleChunkError(err)) return false;
  if (hasHydrationErrorState()) return false;
  try {
    if (sessionStorage.getItem(GUARD_KEY) === "1") return false;
  } catch { /* ignore */ }
  return true;
}

export function installChunkAutoRecovery(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __phlChunkAutoRecoveryInstalled?: boolean };
  if (w.__phlChunkAutoRecoveryInstalled) return;
  w.__phlChunkAutoRecoveryInstalled = true;

  const onError = (event: ErrorEvent) => {
    const err = event.error ?? event.message;
    if (shouldHandle(err)) {
      void reportChunkMismatch(err);
      recoverWithoutOverlay();
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (shouldHandle(event.reason)) {
      void reportChunkMismatch(event.reason);
      recoverWithoutOverlay();
    }
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection, true);
}

export const CHUNK_RECOVERY_GUARD_KEY = GUARD_KEY;
