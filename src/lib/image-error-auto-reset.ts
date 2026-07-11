// Auto cache reset when Firebase Storage images repeatedly fail to load in a
// normal browser session. Symptom this fixes: images show fine in incognito
// but are missing in a returning browser because of a stale service worker,
// stale IndexedDB Firestore cache, or an expired image download token that
// was cached by an old SW.
//
// Strategy:
//   1) Listen to image `error` events (capture phase) globally.
//   2) Only count images hosted on firebasestorage.googleapis.com /
//      *.firebasestorage.app (the ones that can be broken by stale token/SW).
//   3) When >= THRESHOLD unique broken images accumulate within WINDOW_MS,
//      navigate once to /cache-reset?next=<current-path>, which wipes SW +
//      Cache Storage + IndexedDB + storage and reloads the app.
//   4) Guard with a sessionStorage flag so we do this at most once per tab
//      session — never in a loop.
//   5) Never run in iframes, dev, or preview hosts.

const THRESHOLD = 3;
const WINDOW_MS = 15_000;
const SESSION_FLAG = "__phl_image_auto_reset_done";
const IMG_HOST_RE = /(?:^|\.)firebasestorage\.(?:googleapis\.com|app)$/i;

function isPreviewOrDev(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h.endsWith(".lovableproject.com") || h.endsWith(".lovableproject-dev.com")) return true;
  if (h.endsWith(".lovable.app") || h.endsWith(".lovable.dev")) return true;
  return false;
}

function isFirebaseImage(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return IMG_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export function installImageErrorAutoReset(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (isPreviewOrDev()) return;
  try {
    if (sessionStorage.getItem(SESSION_FLAG) === "1") return;
  } catch { /* ignore */ }

  const broken = new Map<string, number>();

  const trigger = (): void => {
    try { sessionStorage.setItem(SESSION_FLAG, "1"); } catch { /* ignore */ }
    const next = window.location.pathname + window.location.search + window.location.hash;
    const url = `/cache-reset?next=${encodeURIComponent(next || "/")}`;
    try {
      // eslint-disable-next-line no-console
      console.warn("[image-auto-reset] repeated image load failures — resetting cache", {
        count: broken.size,
        sample: Array.from(broken.keys()).slice(0, 3),
      });
    } catch { /* ignore */ }
    window.location.replace(url);
  };

  const onError = (ev: Event): void => {
    const t = ev.target as (HTMLImageElement | HTMLSourceElement | null);
    if (!t) return;
    const src = (t as HTMLImageElement).currentSrc
      || (t as HTMLImageElement).src
      || (t as HTMLSourceElement).srcset
      || "";
    if (!src || !isFirebaseImage(src)) return;

    const now = Date.now();
    // Purge stale entries outside the window.
    for (const [k, ts] of broken) {
      if (now - ts > WINDOW_MS) broken.delete(k);
    }
    broken.set(src, now);

    if (broken.size >= THRESHOLD) trigger();
  };

  window.addEventListener("error", onError, true);
}
