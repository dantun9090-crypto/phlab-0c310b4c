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
        '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recovering — PH Labs</title><style>html,body{margin:0;min-height:100%;background:#060f1e;color:#f0f6ff;font-family:system-ui,sans-serif}.box{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{max-width:440px;text-align:center}h1{margin:0 0 12px;font-size:22px}p{margin:0 0 22px;color:#9fb0c8;font-size:14px;line-height:1.55}button{appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:700;padding:12px 18px;cursor:pointer;font-size:14px}</style></head><body><div class="box"><div class="card"><h1>⚠️ Loading issue detected</h1><p>This is usually a stale cache. Clearing it and reloading should fix it.</p><button id="phl-cc">Clear Cache &amp; Reload</button></div></div></body>';
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
        location.replace(location.pathname + "?sw=off&cc=" + Date.now());
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
// Flip ENABLE_SSR_HYDRATION ONLY after user confirms
// "mutations = 0" on Chrome + Firefox over 10 hard reloads.
// ============================================================
const ENABLE_SSR_HYDRATION = false;
const SSR_HYDRATION_ROUTES: string[] = ["/"];

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
  console.error("[HYDRATION FALLBACK] Switched to CSR due to:", error);
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
    document.documentElement.innerHTML =
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="google" content="notranslate"><title>PH Labs UK</title><style>html,body{margin:0;min-height:100%;background:#060f1e;color:#f0f6ff;font-family:Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.phl-boot{display:flex;min-height:100vh;align-items:center;justify-content:center;color:#9fb0c8;font-size:14px}</style></head><body><div class="phl-boot" aria-live="polite">Loading PH Labs…</div></body>';
  } catch (error) {
    console.error("[HYDRATION FALLBACK] Could not wipe SSR DOM", error);
  }
}

function showStaticFallback(error: unknown): void {
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
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060f1e", color: "#f0f6ff", padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 10px", fontWeight: 700 }}>Please refresh</h1>
          <p style={{ margin: "0 0 22px", color: "#9fb0c8", fontSize: 14, lineHeight: 1.55 }}>
            The page could not initialise cleanly.
          </p>
          <button type="button" onClick={() => location.reload()} style={{ appearance: "none", border: 0, borderRadius: 8, background: "#10b981", color: "#03140d", fontWeight: 700, padding: "12px 16px", cursor: "pointer" }}>
            Refresh
          </button>
        </div>
      </div>
    );
  }
}

function app() {
  return (
    <StrictMode>
      <ClientRootErrorBoundary>
        <StartClient />
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
  try {
    createRoot(document, {
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
    }).render(app());
  } catch (renderError) {
    showStaticFallback(renderError);
  }
}

function hydrateOrFallback(): void {
  try {
    hydrationRoot = hydrateRoot(document, app(), {
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
}, 5000);