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
const FORCE_CSR_FALLBACK = true;

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
        if (added.length) console.warn("[HYDRATION DIAG] DOM mutated before React ready", added);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
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

if (FORCE_CSR_FALLBACK) {
  renderCsr(new Error("SSR hydration temporarily disabled for P0 recovery"));
} else {
  startTransition(hydrateOrFallback);
}

window.setTimeout(() => {
  window.__PHL_REACT_READY__ = true;
  stopMutationLogger();
}, 5000);