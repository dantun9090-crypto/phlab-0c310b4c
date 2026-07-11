/**
 * Auto-recovery for stale-chunk errors after a deploy.
 *
 * Trigger: window `error` / `unhandledrejection` whose message matches
 * `isStaleChunkError` (dynamic import failure, chunk load failure, missing
 * asset in /assets or /_build).
 *
 * Behaviour: show a full-screen manual recovery overlay. This used to reload
 * automatically after a countdown, but multiple missing chunks after a publish
 * could chain into a visible refresh loop. Recovery is now user-triggered only.
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
    url.searchParams.set("sw", "off");
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    try { window.location.reload(); } catch { /* give up */ }
  }
}

async function performRecovery(): Promise<void> {
  try { sessionStorage.setItem(GUARD_KEY, "1"); } catch { /* ignore */ }
  await clearAppCachesAndSW();
  reloadClean();
}

function showCountdownOverlay(): void {
  if (overlayShown) return;
  overlayShown = true;

  if (!document.body) {
    document.addEventListener("DOMContentLoaded", showCountdownOverlay, { once: true });
    return;
  }

  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = OVERLAY_ID;
  wrap.setAttribute("role", "alert");
  wrap.setAttribute("aria-live", "assertive");
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#060f1e;color:#f0f6ff;" +
    "font-family:Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
    "display:flex;align-items:center;justify-content:center;padding:24px";
  wrap.innerHTML =
    '<div style="max-width:460px;text-align:center">' +
      '<h1 style="font-size:22px;margin:0 0 10px;font-weight:800">PH Labs update in progress</h1>' +
      '<p style="margin:0 0 18px;color:#9fb0c8;font-size:15px;line-height:1.55">' +
        "Your browser is using an old page file. Automatic refreshing has been stopped." +
      "</p>" +
      '<button id="phl-chunk-refresh" type="button" style="appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:800;padding:14px 18px;cursor:pointer;font-size:16px">' +
        "Open fresh store" +
      "</button>" +
    "</div>";
  document.body.appendChild(wrap);

  document.getElementById("phl-chunk-refresh")?.addEventListener("click", () => {
    void performRecovery();
  });
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
      showCountdownOverlay();
    }
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (shouldHandle(event.reason)) {
      void reportChunkMismatch(event.reason);
      showCountdownOverlay();
    }
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection, true);
}

export const CHUNK_RECOVERY_GUARD_KEY = GUARD_KEY;
