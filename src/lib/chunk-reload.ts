import { hardReload, isOnline, isStaleChunkError } from "@/lib/recovery";

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
const COOLDOWN_MS = 15_000;
const REVISIT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const ERROR_BURST_WINDOW_MS = 4_000;
const ERROR_BURST_LIMIT = 6;

function reloadOnce(reason: string) {
  if (!isOnline()) return;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Date.now() - last < COOLDOWN_MS) return; // avoid loops
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.warn("[chunk-reload] reloading:", reason);
  void hardReload();
}

if (typeof window !== "undefined") {
  // --- Layer 1: chunk errors ---
  window.addEventListener("error", (event) => {
    if (isStaleChunkError(event.error ?? event.message)) {
      reloadOnce("chunk error");
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) {
      reloadOnce("chunk rejection");
    }
  });

  // --- Layer 2: error-burst detection (app stuck in a render loop) ---
  let burst: number[] = [];
  const recordError = () => {
    const now = Date.now();
    burst = burst.filter((t) => now - t < ERROR_BURST_WINDOW_MS);
    burst.push(now);
    if (burst.length >= ERROR_BURST_LIMIT) {
      reloadOnce("error burst");
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
        reloadOnce("long tab-away");
      }
    }
  });
}

export {};
