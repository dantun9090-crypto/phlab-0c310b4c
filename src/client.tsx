// === Expose build id to runtime =============================================
// vite.config.ts injects `__BUILD_ID__` at build time via `define`. Attach it
// to `window` so admin diagnostics, telemetry, and mount-timeout probes can
// read a stable runtime build id instead of falling back to "unknown".
try {
  if (typeof window !== "undefined" && typeof __BUILD_ID__ === "string") {
    (window as unknown as { __BUILD_ID__?: string }).__BUILD_ID__ = __BUILD_ID__;
  }
} catch { /* ignore */ }

// === Reload-loop breaker (runs before React mounts) ========================
// Only arm this during an actual cache-recovery navigation. Previously this
// counted every normal page load, so quick refreshes / preview reloads could
// falsely show the stale-cache screen even when the app was healthy.
//
// Thresholds are runtime-tunable WITHOUT a redeploy via any of:
//   • URL:           ?phl_loop_threshold=8&phl_loop_window_ms=120000&phl_loop_disabled=1
//   • localStorage:  __phl_loop_threshold / __phl_loop_window_ms / __phl_loop_disabled
//   • window global: window.__PHL_LOOP_CONFIG = { threshold, windowMs, disabled }
//   • <meta name="phl-loop-threshold" content="8"> (also: phl-loop-window-ms, phl-loop-disabled)
// Defaults: threshold=5 reloads within windowMs=90000. URL/localStorage values persist.
(() => {
  if (typeof window === "undefined") return;
  try {
    const KEY = "__phl_reload_window";
    const RECOVERY_KEYS = [
      "__phl_hard_reload_in_flight",
      "__phl_route_auto_recovery_done",
      "__phl_reloaded_at",
      "__phl_stale_asset_reload_at",
    ];
    const params = new URLSearchParams(window.location.search);

    // --- Runtime-tunable config (no redeploy required) --------------------
    const readNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const readBool = (v: unknown): boolean =>
      v === true || v === "1" || v === "true" || v === "yes";
    const metaVal = (name: string): string | null =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
    const lsGet = (k: string): string | null => {
      try { return localStorage.getItem(k); } catch { return null; }
    };
    const lsSet = (k: string, v: string): void => {
      try { localStorage.setItem(k, v); } catch { /* ignore */ }
    };
    const winCfg = (window as unknown as {
      __PHL_LOOP_CONFIG?: { threshold?: number; windowMs?: number; disabled?: boolean };
    }).__PHL_LOOP_CONFIG || {};

    // Persist URL overrides so they survive subsequent navigations.
    const urlThreshold = params.get("phl_loop_threshold");
    const urlWindowMs = params.get("phl_loop_window_ms");
    const urlDisabled = params.get("phl_loop_disabled");
    if (urlThreshold) lsSet("__phl_loop_threshold", urlThreshold);
    if (urlWindowMs) lsSet("__phl_loop_window_ms", urlWindowMs);
    if (urlDisabled != null) lsSet("__phl_loop_disabled", urlDisabled);

    const disabled =
      readBool(urlDisabled) ||
      readBool(lsGet("__phl_loop_disabled")) ||
      readBool(winCfg.disabled) ||
      readBool(metaVal("phl-loop-disabled"));
    if (disabled) {
      sessionStorage.removeItem(KEY);
      return;
    }

    const THRESHOLD =
      readNum(urlThreshold) ??
      readNum(lsGet("__phl_loop_threshold")) ??
      readNum(winCfg.threshold) ??
      readNum(metaVal("phl-loop-threshold")) ??
      5;
    const WINDOW_MS =
      readNum(urlWindowMs) ??
      readNum(lsGet("__phl_loop_window_ms")) ??
      readNum(winCfg.windowMs) ??
      readNum(metaVal("phl-loop-window-ms")) ??
      90_000;

    const isRecoveryNavigation =
      params.has("sw") ||
      params.has("_r") ||
      params.has("stale_recovery") ||
      params.has("cc") ||
      RECOVERY_KEYS.some((k) => sessionStorage.getItem(k));

    if (!isRecoveryNavigation) {
      sessionStorage.removeItem(KEY);
      return;
    }

    const now = Date.now();
    const raw = sessionStorage.getItem(KEY);
    const arr = (raw ? (JSON.parse(raw) as number[]) : []).filter(
      (t) => now - t < WINDOW_MS,
    );
    arr.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(arr));
    if (arr.length >= THRESHOLD) {

      sessionStorage.removeItem(KEY);
      document.documentElement.innerHTML =
        '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recovering — PH Labs</title><style>html,body{margin:0;min-height:100%;background:#060f1e;color:#f0f6ff;font-family:system-ui,sans-serif}.box{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{max-width:440px;text-align:center}h1{margin:0 0 12px;font-size:22px}p{margin:0 0 22px;color:#9fb0c8;font-size:14px;line-height:1.55}button{appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:700;padding:12px 18px;cursor:pointer;font-size:14px}</style></head><body><div class="box"><div class="card"><h1>⚠️ Loading issue detected</h1><p>Automatic recovery has been stopped to prevent refresh loops. Click once to clear local cache, then the page will open normally.</p><button id="phl-cc">Clear cache and open site</button></div></div></body>';
      const btn = document.getElementById("phl-cc");
      btn?.addEventListener("click", async () => {
        try {
          for (const key of [KEY, ...RECOVERY_KEYS, "phl_reload_count", "__phl_stale_asset_reload_count"]) {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
          }
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((k) => /^(phlabs-|workbox-|precache-|runtime-)/i.test(k))
                .map((k) => caches.delete(k)),
            );
          }
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
              regs
                .filter((r) => /\/(?:sw|service-worker)\.js(?:$|[?#])/i.test(r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || ""))
                .map((r) => r.unregister()),
            );
          }
        } catch {
          /* ignore */
        }
        location.replace("/cache-reset?next=" + encodeURIComponent(location.pathname + location.search + location.hash));
      });
      throw new Error("PHL_RELOAD_LOOP_BREAKER");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "PHL_RELOAD_LOOP_BREAKER") throw e;
    /* sessionStorage unavailable — proceed normally */
  }
})();

import { Component, StrictMode, startTransition, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import LegacyClientApp from "./legacy/LegacyClientApp";
import { installClientErrorReporter, reportClientError } from "./lib/client-error-reporter";
import { initSwTelemetry } from "./lib/swTelemetry";
import { initSentry } from "./lib/sentry";
import { installChunkAutoRecovery } from "./lib/chunk-auto-recovery";
import { installImageErrorAutoReset } from "./lib/image-error-auto-reset";
import { installBuildIdForceReload } from "./lib/build-id-force-reload";
import { installBuildFreshnessCheck } from "./lib/build-freshness-check";
import appCss from "./styles.css?url";

try { installImageErrorAutoReset(); } catch { /* ignore */ }
try { installBuildIdForceReload(); } catch { /* ignore */ }
try { installBuildFreshnessCheck(); } catch { /* ignore */ }

// Sentry init is heavy (tracing + session replay integrations patch fetch,
// install observers, install listeners). Running synchronously before
// hydration cost ~500-1000ms TBT and ~1s LCP on throttled mobile.
// Defer the init until after the browser is idle. Errors thrown before
// then are still captured by the ErrorBoundary + client-error-reporter
// path — they're just buffered until Sentry is ready.
const kickSentry = () => { try { initSentry(); } catch { /* ignore */ } };
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(kickSentry, { timeout: 4000 });
} else {
  setTimeout(kickSentry, 2500);
}
installClientErrorReporter();
initSwTelemetry();
// Auto-recover from stale-chunk failures after a deploy (countdown overlay,
// once-per-session, then hard reload with cache purge).
installChunkAutoRecovery();

declare global {
  interface Window {
    __PHL_PRE_HYDRATION_DOM__?: unknown;
    __PHL_REACT_READY__?: boolean;
    __phlHydrationFallback?: (error?: unknown) => void;
  }
}

const HYDRATION_ERROR_FLAG = "__phl_hydration_error_seen";

// ============================================================
// SSR HYDRATION FLAGS (P0 RECOVERY)
// ENABLE_SSR_HYDRATION: master flag. false = CSR for everyone.
// SSR_HYDRATION_ROUTES: when ENABLE_SSR_HYDRATION = true,
//   only these paths hydrate via SSR. Empty array = ALL routes.
// Keep homepage SSR hydrated instead of wiping the server HTML into CSR.
// The home route now renders a stable SSR shell and upgrades LegacyApp after mount.
// ============================================================
// EMERGENCY: SSR hydration on "/" was crashing in Chrome/Edge with a
// NotFoundError removeChild during hydration, then the CSR unmount failed
// with "createRoot called twice on same container" and left the page blank.
// Force full CSR boot for every route until the underlying legacy-router
// hydration mismatch is fixed — matches the "emergency CSR mode" documented
// in Admin › Tools.
const ENABLE_SSR_HYDRATION = false;
const SSR_HYDRATION_ROUTES: string[] = [];

function shouldHydrateCurrentRoute(): boolean {
  if (!ENABLE_SSR_HYDRATION) return false;
  if (SSR_HYDRATION_ROUTES.length === 0) return true;
  try {
    return SSR_HYDRATION_ROUTES.includes(location.pathname);
  } catch {
    return false;
  }
}

function errorText(error: unknown): string {
  if (!error) return "";
  const err = error as { message?: unknown; name?: unknown; stack?: unknown };
  return [err.name, err.message, err.stack, error].filter(Boolean).join(" ");
}

function isHydrationCrash(error: unknown): boolean {
  return /hydrat|Minified React error #418\b|react\.dev\/errors\/418\b|removeChild|not a child of this node|NotFoundError/i.test(
    errorText(error),
  );
}

function markHydrationCrash(error: unknown): void {
  try {
    sessionStorage.setItem(HYDRATION_ERROR_FLAG, String(Date.now()));
  } catch {
    /* ignore */
  }
  const text = errorText(error);
  if (/SSR hydration disabled by flag/i.test(text)) {
    console.info("[HYDRATION FALLBACK] CSR boot enabled by config");
  } else {
    console.error("[HYDRATION FALLBACK] Switched to CSR due to:", error);
  }
}

function capturePreHydrationDom(): void {
  try {
    const root = document.documentElement;
    const comments: string[] = [];
    const textNodes: string[] = [];
    const scripts: Array<{ src: string; id: string; parent: string }> = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node && comments.length + textNodes.length < 80) {
      const value = (node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (value) {
        if (node.nodeType === Node.COMMENT_NODE) comments.push(value.slice(0, 180));
        if (node.nodeType === Node.TEXT_NODE && node.parentElement?.tagName !== "SCRIPT") {
          textNodes.push(`${node.parentElement?.tagName || "#text"}: ${value.slice(0, 180)}`);
        }
      }
      node = walker.nextNode();
    }
    document.querySelectorAll("script").forEach((script) => {
      scripts.push({
        src: script.getAttribute("src") || "[inline]",
        id: script.id || "",
        parent: script.parentElement?.tagName || "",
      });
    });
    const snapshot = {
      at: new Date().toISOString(),
      url: location.href,
      htmlLength: root.innerHTML.length,
      headChildren: Array.from(document.head.children).map((el) => `${el.tagName}${el.id ? `#${el.id}` : ""}`),
      bodyChildren: Array.from(document.body?.children || []).map((el) => `${el.tagName}${el.id ? `#${el.id}` : ""}`),
      comments,
      textNodes,
      scripts,
      thirdPartyScripts: scripts.filter((s) => /googletagmanager|google-analytics|\/60z6\//i.test(s.src)),
    };
    window.__PHL_PRE_HYDRATION_DOM__ = snapshot;
    console.info("[HYDRATION DIAG] pre-render DOM snapshot", snapshot);
  } catch (error) {
    console.warn("[HYDRATION DIAG] snapshot failed", error);
  }
}

function installPreReactMutationLogger(): () => void {
  let mutationCount = 0;
  const mutatedNames: string[] = [];
  try {
    const observer = new MutationObserver((records) => {
      if (window.__PHL_REACT_READY__) return;
      for (const record of records) {
        const added = Array.from(record.addedNodes)
          .map((node) => {
            if (node.nodeType === Node.COMMENT_NODE) return `comment:${(node.nodeValue || "").slice(0, 120)}`;
            if (node.nodeType === Node.TEXT_NODE) return `text:${(node.nodeValue || "").replace(/\s+/g, " ").trim().slice(0, 120)}`;
            if (node instanceof HTMLScriptElement) return `script:${node.src || "[inline]"}`;
            if (node instanceof Element) return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}`;
            return node.nodeName;
          })
          .filter(Boolean);
        if (added.length) {
          mutationCount += added.length;
          mutatedNames.push(...added);
          console.warn(`[HYDRATION DIAG] mutation #${mutationCount}`, added);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (mutationCount > 0) {
        console.warn(`[HYDRATION DIAG] FINAL pre-React mutation count = ${mutationCount}`, mutatedNames);
      } else {
        console.info("[HYDRATION DIAG] FINAL pre-React mutation count = 0 ✓");
      }
    };
  } catch {
    return () => undefined;
  }
}

function prepareDocumentForCsr(): void {
  try {
    document.documentElement.setAttribute("lang", "en-GB");

    // Do not mount React on `document` in CSR recovery mode. Owning the whole
    // Document lets third-party/head mutations race React's commit phase and
    // causes the production NotFoundError/removeChild crash. Keep <head>
    // intact (metadata + CSS) and mount into a normal app container only.
    if (!document.head.querySelector('meta[charset]')) {
      const charset = document.createElement("meta");
      charset.setAttribute("charset", "utf-8");
      document.head.prepend(charset);
    }
    if (!document.head.querySelector('meta[name="viewport"]')) {
      const viewport = document.createElement("meta");
      viewport.setAttribute("name", "viewport");
      viewport.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
      document.head.appendChild(viewport);
    }
    if (!document.head.querySelector('meta[name="google"]')) {
      const google = document.createElement("meta");
      google.setAttribute("name", "google");
      google.setAttribute("content", "notranslate");
      document.head.appendChild(google);
    }
    if (!document.title) document.title = "PH Labs UK";

    const existingAppCss = document.getElementById("appcss") as HTMLLinkElement | null;
    if (existingAppCss) {
      existingAppCss.rel = "stylesheet";
      existingAppCss.media = "all";
    } else {
      const link = document.createElement("link");
      link.id = "appcss";
      link.rel = "stylesheet";
      link.href = appCss;
      document.head.appendChild(link);
    }

    document.body.style.margin = "0";
    document.body.style.backgroundColor = "#060f1e";
    document.body.style.color = "#f0f6ff";
    document.body.innerHTML =
      '<div id="phl-csr-root"><div class="phl-boot" aria-live="polite" style="display:flex;min-height:100vh;align-items:center;justify-content:center;color:#9fb0c8;font-size:14px;font-family:Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">Loading PH Labs…</div></div>';
  } catch (error) {
    console.error("[HYDRATION FALLBACK] Could not wipe SSR DOM", error);
  }
}

function getCsrMountNode(): HTMLElement {
  let mountNode = document.getElementById("phl-csr-root");
  if (!mountNode) {
    mountNode = document.createElement("div");
    mountNode.id = "phl-csr-root";
    document.body.replaceChildren(mountNode);
  }
  return mountNode;
}

function CsrBootFallback() {
  return (
    <div
      className="phl-boot"
      aria-live="polite"
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        color: "#9fb0c8",
        fontSize: 14,
        fontFamily: "Inter Tight, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      Loading PH Labs…
    </div>
  );
}

function CsrLegacyApp() {
  const initialPath = typeof window !== "undefined" ? window.location.pathname : "/";
  return <LegacyClientApp initialPath={initialPath} fallback={<CsrBootFallback />} />;
}

function attemptCacheBustReload(): boolean {
  // Fires before rendering the "Please refresh" fallback. If this tab hasn't
  // already been cache-busted (session flag + URL `_bust` param), do a hard
  // reload with a cache-busting query so Cloudflare / the SW can't replay
  // the stale HTML shell that likely caused this crash.
  try {
    const RELOADED_KEY = "__phl_hydration_bust_reload_at";
    if (sessionStorage.getItem(RELOADED_KEY)) return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("_bust")) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    const loc = window.location;
    const sep = loc.search ? "&" : "?";
    const target =
      loc.pathname + loc.search + sep + "_bust=hydration&_t=" + Date.now() + loc.hash;
    console.warn("[ROOT ERROR BOUNDARY] Attempting cache-bust reload before fallback");
    loc.replace(target);
    return true;
  } catch {
    return false;
  }
}

function showStaticFallback(error: unknown): void {
  // First-chance recovery: silently reload once with a cache-buster. If the
  // real cause was a stale HTML/JS mismatch, the reload fixes it and the user
  // never sees the "Please refresh" screen.
  if (attemptCacheBustReload()) return;
  try {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060f1e;color:#f0f6ff;font-family:Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px"><div style="max-width:460px;text-align:center"><h1 style="font-size:22px;margin:0 0 10px;font-weight:700">Please refresh</h1><p style="margin:0 0 22px;color:#9fb0c8;font-size:14px;line-height:1.55">The page could not initialise cleanly.</p><button id="phl-root-refresh" style="appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:700;padding:12px 16px;cursor:pointer">Refresh</button></div></div>';
    document.getElementById("phl-root-refresh")?.addEventListener("click", () => location.reload());
  } catch {
    /* ignore */
  }
  console.error("[ROOT ERROR BOUNDARY] Static fallback rendered", error);
}


class ClientRootErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state: { hasError: boolean; error?: Error } = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    if (isHydrationCrash(error)) markHydrationCrash(error);
    console.error("[ROOT ERROR BOUNDARY]", error, info?.componentStack || "");
    reportClientError({
      source: "error-boundary",
      message: error?.message || String(error),
      stack: [error?.stack, info?.componentStack].filter(Boolean).join("\n--- componentStack ---\n"),
      routeId: typeof location !== "undefined" ? location.pathname : undefined,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060f1e", color: "#f0f6ff", padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 10px", fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ margin: "0 0 18px", color: "#9fb0c8", fontSize: 14, lineHeight: 1.55 }}>
            We hit an unexpected error rendering this page. The issue has been reported. Please try again or refresh.
          </p>
          {this.state.error?.message ? (
            <pre style={{ margin: "0 0 18px", padding: 10, background: "#0b1a2e", border: "1px solid #1f2d44", borderRadius: 8, color: "#cdd9ea", fontSize: 12, textAlign: "left", overflow: "auto", maxHeight: 140 }}>
              {String(this.state.error.message).slice(0, 400)}
            </pre>
          ) : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => this.setState({ hasError: false, error: undefined })} style={{ appearance: "none", border: "1px solid #1f2d44", borderRadius: 8, background: "transparent", color: "#f0f6ff", fontWeight: 600, padding: "10px 14px", cursor: "pointer" }}>
              Try again
            </button>
            <button type="button" onClick={() => location.reload()} style={{ appearance: "none", border: 0, borderRadius: 8, background: "#10b981", color: "#03140d", fontWeight: 700, padding: "10px 14px", cursor: "pointer" }}>
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }
}

let csrRouter: ReturnType<typeof getRouter> | undefined;

function getCsrRouter() {
  if (!csrRouter) csrRouter = getRouter();
  return csrRouter;
}

function app(mode: "ssr" | "csr" = "ssr", router?: ReturnType<typeof getRouter>) {
  return (
    <StrictMode>
      <ClientRootErrorBoundary>
        {mode === "csr" ? <CsrLegacyApp /> : <StartClient />}
      </ClientRootErrorBoundary>
    </StrictMode>
  );
}

let hydrationRoot: Root | undefined;
let switchedToCsr = false;

function renderCsr(error: unknown): void {
  if (switchedToCsr) return;
  switchedToCsr = true;
  markHydrationCrash(error);
  try {
    hydrationRoot?.unmount();
  } catch (unmountError) {
    console.error("[HYDRATION FALLBACK] Hydration root unmount failed", unmountError);
  }
  prepareDocumentForCsr();
  void (async () => {
    const router = getCsrRouter();
    // Kick off initial load but DO NOT await — awaiting router.load() before
    // mount has hung the boot in preview/mobile cases, leaving the user on
    // the "Loading PH Labs…" shell forever. <Transitioner /> will drive the
    // first render correctly once React mounts.
    try {
      const loadPromise = router.load();
      if (loadPromise && typeof (loadPromise as Promise<unknown>).catch === "function") {
        (loadPromise as Promise<unknown>).catch((loadError) => {
          console.error("[CSR BOOT] initial router.load failed", loadError);
        });
      }
    } catch (loadError) {
      console.error("[CSR BOOT] initial router.load threw synchronously", loadError);
    }

    try {
      createRoot(getCsrMountNode(), {
        onUncaughtError: (rootError, info) => {
          console.error("[ROOT ERROR BOUNDARY] uncaught", rootError, info?.componentStack || "");
          showStaticFallback(rootError);
        },
        onCaughtError: (rootError, info) => {
          console.error("[ROOT ERROR BOUNDARY] caught", rootError, info?.componentStack || "");
        },
        onRecoverableError: (rootError, info) => {
          console.error("[ROOT ERROR BOUNDARY] recoverable", rootError, info?.componentStack || "");
        },
      }).render(app("csr", router));
    } catch (renderError) {
      showStaticFallback(renderError);
    }
  })();

}

function hydrateOrFallback(): void {
  try {
    hydrationRoot = hydrateRoot(document, app("ssr"), {
      onRecoverableError: (error, info) => {
        console.error("[HYDRATION DIAG] recoverable", error, info?.componentStack || "");
        if (isHydrationCrash(error)) window.setTimeout(() => renderCsr(error), 0);
      },
      onUncaughtError: (error, info) => {
        console.error("[HYDRATION DIAG] uncaught", error, info?.componentStack || "");
        window.setTimeout(() => renderCsr(error), 0);
      },
      onCaughtError: (error, info) => {
        console.error("[HYDRATION DIAG] caught", error, info?.componentStack || "");
        if (isHydrationCrash(error)) window.setTimeout(() => renderCsr(error), 0);
      },
    });
  } catch (error) {
    renderCsr(error);
  }
}

capturePreHydrationDom();
const stopMutationLogger = installPreReactMutationLogger();
window.__phlHydrationFallback = (error?: unknown) => renderCsr(error || new Error("External hydration fallback requested"));

// Temporary SW debug instrumentation — gated by ?sw_debug=1 (persists).
void import("@/lib/sw-debug").then((m) => m.startSwDebug()).catch(() => { /* noop */ });

window.addEventListener("error", (event) => {
  const error = event.error ?? event.message;
  if (isHydrationCrash(error)) renderCsr(error);
}, true);
window.addEventListener("unhandledrejection", (event) => {
  if (isHydrationCrash(event.reason)) renderCsr(event.reason);
}, true);

if (shouldHydrateCurrentRoute()) {
  console.info(`[HYDRATION] SSR active on ${location.pathname}`);
  startTransition(hydrateOrFallback);
} else {
  console.info(
    `[HYDRATION] CSR mode on ${location.pathname} (ENABLE_SSR_HYDRATION=${ENABLE_SSR_HYDRATION}, allowed=${JSON.stringify(SSR_HYDRATION_ROUTES)})`,
  );
  renderCsr(new Error("SSR hydration disabled by flag"));
}

window.setTimeout(() => {
  window.__PHL_REACT_READY__ = true;
  stopMutationLogger();
  try {
    sessionStorage.removeItem("__phl_reload_window");
    sessionStorage.removeItem("__phl_hard_reload_in_flight");
  } catch {
    /* ignore */
  }
  // --- Mount / blank-page telemetry ------------------------------------
  // If the initial boot loader is still on screen after 5s, React never
  // mounted successfully — report the exact cause. Sampled + rate-limited
  // to avoid flooding Firestore during large-scale outages.
  try {
    const bootStillVisible = !!document.querySelector(".phl-boot");
    const bodyChildCount = document.body?.childElementCount ?? 0;
    const reactRootMounted = !!document.querySelector("[data-tanstack-scripts], [data-tsr-scripts], #root, main, header, nav");
    const mountFailed = bootStillVisible || !reactRootMounted || bodyChildCount <= 1;

    if (mountFailed) {
      const buildId =
        (window as unknown as { __BUILD_ID__?: string }).__BUILD_ID__ ||
        document.querySelector('meta[name="x-build-id"]')?.getAttribute("content") ||
        document.querySelector('meta[name="build-id"]')?.getAttribute("content") ||
        "n/a";
      const assetHash = document.querySelector('meta[name="asset-hash"]')?.getAttribute("content") || "n/a";
      // Normalize into a stable code so canary/admin charts can correlate.
      // Lazy import to keep boot path free of extra chunks.
      void import("@/lib/mount-error-codes").then(({ classifyMountError, pushMountSample }) => {
        const classified = classifyMountError({
          message: "[MOUNT-TIMEOUT] React did not mount within 5s",
          bootStillVisible,
          reactRootMounted,
          bodyChildCount,
        });
        // Always retain a local sample (per-browser ring buffer, no PII).
        const nowMs = Date.now();
        const mountDurationMs = Math.round(typeof performance !== 'undefined' ? performance.now() : 0);
        pushMountSample({
          ts: nowMs,
          eventTs: nowMs, // capture original event time for accurate rate math
          mountDurationMs,
          code: classified.code,
          category: classified.category,
          route: location.pathname,
          buildId,
          assetHash,
          message: classified.reason,
        });


        // === Sampling + retention controls ==================================
        const SAMPLE_KEY = "__phl_mount_sample";
        const REPORTED_KEY = "__phl_mount_reported";
        const LAST_REPORT_KEY = "__phl_mount_last_report_at";
        const HOUR_MS = 3_600_000;
        let sampleRate = 1;
        try {
          const raw = localStorage.getItem(SAMPLE_KEY);
          if (raw != null) {
            const n = Number(raw);
            if (Number.isFinite(n) && n >= 0 && n <= 1) sampleRate = n;
          }
        } catch { /* ignore */ }
        const alreadyReported = sessionStorage.getItem(REPORTED_KEY) === "1";
        const lastReportAt = Number(localStorage.getItem(LAST_REPORT_KEY) || "0");
        const withinRateLimit = Date.now() - lastReportAt < HOUR_MS;
        const passesSample = Math.random() < sampleRate;

        if (!alreadyReported && !withinRateLimit && passesSample) {
          try { sessionStorage.setItem(REPORTED_KEY, "1"); } catch { /* ignore */ }
          try { localStorage.setItem(LAST_REPORT_KEY, String(Date.now())); } catch { /* ignore */ }
          reportClientError({
            source: "manual",
            message: `[MOUNT-TIMEOUT] ${classified.code} — ${classified.reason} (bootVisible=${bootStillVisible}, bodyChildren=${bodyChildCount}, rootFound=${reactRootMounted})`,
            stack: [
              `code=${classified.code}`,
              `category=${classified.category}`,
              `url=${location.href}`,
              `buildId=${buildId}`,
              `assetHash=${assetHash}`,
              `switchedToCsr=${switchedToCsr}`,
              `sampleRate=${sampleRate}`,
              `preHydrationDom=${JSON.stringify(window.__PHL_PRE_HYDRATION_DOM__ || null).slice(0, 500)}`,
            ].join("\n"),
            routeId: location.pathname,
          });
        } else {
          console.info("[MOUNT-TIMEOUT] suppressed", { alreadyReported, withinRateLimit, sampleRate, code: classified.code });
        }
      }).catch(() => { /* never let telemetry throw */ });
    }
  } catch { /* never let telemetry throw */ }
}, 5000);

