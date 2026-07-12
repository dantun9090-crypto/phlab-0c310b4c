import { useState } from "react";

async function clearCachesAndReload(setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (r) => {
          try {
            if (r.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" });
          } catch {}
          try {
            await r.unregister();
          } catch {}
        }),
      );
    }
  } catch {}
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {}
  try {
    const keep = new Set(["theme", "currency"]);
    Object.keys(localStorage).forEach((k) => {
      if (!keep.has(k)) {
        try {
          localStorage.removeItem(k);
        } catch {}
      }
    });
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
  setTimeout(() => {
    try {
      window.location.reload();
    } catch {
      window.location.href = "/";
    }
  }, 300);
}

export function LoadingFallback() {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="min-h-screen bg-[#060f1e] px-6 pt-24 flex items-center justify-center text-[#f0f6ff]"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="relative" aria-hidden="true">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-600/20 border-t-emerald-500 animate-spin" />
          <div
            className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-b-emerald-400/40 animate-spin"
            style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
          />
        </div>
        <p className="mt-5 text-sm font-semibold tracking-[0.18em] text-emerald-400 uppercase">
          PH Labs loading
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          If this stays here, refresh once to fetch the latest store version.
        </p>
        <button
          type="button"
          onClick={() => void clearCachesAndReload(setBusy)}
          disabled={busy}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-70"
        >
          {busy ? "Clearing…" : "Reload store"}
        </button>
      </div>
    </div>
  );
}
