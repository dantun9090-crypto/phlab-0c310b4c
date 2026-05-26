// Auto-recovery for stale chunk errors after a deploy.
// When the browser tries to lazy-load a chunk that no longer exists
// (e.g. after a new build), Vite throws "Failed to fetch dynamically
// imported module" / "Importing a module script failed". The page
// appears frozen until the user manually refreshes. We detect this
// and trigger a one-shot hard reload.

const RELOAD_KEY = "__phl_chunk_reloaded_at";
const COOLDOWN_MS = 10_000;

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as any)?.message ?? String(err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Date.now() - last < COOLDOWN_MS) return; // avoid reload loops
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore storage errors */
  }
  window.location.reload();
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.error ?? event.message)) reloadOnce();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) reloadOnce();
  });
}

export {};
