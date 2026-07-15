import { lazy, createElement, type ComponentType } from "react";
import { isStaleChunkError, hardReload } from "@/lib/recovery";

/**
 * React.lazy wrapper that retries a failed dynamic import with exponential
 * backoff. Handles the common post-deploy race where the browser has cached
 * HTML that references an already-deleted chunk hash.
 *
 * Behaviour on terminal failure:
 * - Stale-chunk error: return a safe "Refresh page" fallback component
 *   (and fire hardReload in the background) instead of throwing. This keeps
 *   the app usable — the user sees a refresh button rather than the generic
 *   error boundary screen.
 * - Non-stale error: rethrow so ErrorBoundary can handle it.
 */
function ChunkRefreshFallback() {
  return createElement(
    "div",
    {
      style: {
        padding: "40px 20px",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        color: "#fff",
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
      },
    },
    createElement("h2", { style: { margin: 0, fontSize: "1.5rem" } }, "Opening fresh store"),
    createElement(
      "p",
      { style: { margin: 0, color: "#94a3b8", maxWidth: "420px" } },
      "Clearing an old browser copy and loading the latest page.",
    ),
    createElement(
      "button",
      {
        onClick: () => {
          try { void hardReload({ clean: true }); } catch { /* ignore */ }
        },
        style: {
          padding: "12px 24px",
          fontSize: "16px",
          cursor: "pointer",
          background: "#10b981",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
        },
      },
      "Open fresh store",
    ),
  );
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  { retries = 2, delayMs = 500 }: { retries?: number; delayMs?: number } = {},
) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (attempt >= retries) break;
        if (!isStaleChunkError(err)) break;
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
      }
    }
    if (isStaleChunkError(lastError)) {
      // Kick off scoped cache eviction + hard reload in the background.
      try { void hardReload({ clean: true }); } catch { /* ignore */ }
      // Return a benign fallback so the error boundary doesn't crash the app.
      return { default: ChunkRefreshFallback as unknown as T };
    }
    throw lastError;
  });
}
