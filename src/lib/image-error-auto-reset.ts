// Auto cache reset + diagnostics for broken Firebase Storage images.
//
// Two jobs:
//   1) LOG every failing <img> load from firebasestorage.googleapis.com /
//      *.firebasestorage.app to the console AND to a small floating UI
//      panel bottom-left. Each entry probes the URL with fetch() to
//      capture the real HTTP status (403 = expired token / rules block,
//      404 = missing object, 0 = CORS/blocker/adblock).
//   2) After >= THRESHOLD unique broken images within WINDOW_MS, redirect
//      once per tab session to /cache-reset?next=<current-path>.
//
// Never runs in iframes, dev, or Lovable preview hosts.

const THRESHOLD = 3;
const WINDOW_MS = 15_000;
const SESSION_FLAG = "__phl_image_auto_reset_done";
const IMG_HOST_RE = /(?:^|\.)firebasestorage\.(?:googleapis\.com|app)$/i;
const PANEL_ID = "__phl-img-error-panel";

type ProbeResult = {
  url: string;
  status: number | "network";
  reason: string;
  at: number;
};

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

function reasonForStatus(status: number | "network"): string {
  if (status === "network") return "Network/CORS blocked (adblock, Brave Shields, DNS, or offline)";
  if (status === 403) return "403 Forbidden — expired download token or Storage rules deny";
  if (status === 404) return "404 Not Found — object deleted or wrong path";
  if (status === 401) return "401 Unauthorized — missing/invalid auth";
  if (status === 429) return "429 Too Many Requests — rate limited";
  if (status >= 500) return `${status} Server error at Firebase Storage`;
  if (status >= 400) return `${status} client error`;
  if (status >= 200 && status < 300) return `HTTP ${status} — image loaded via fetch (likely SW / decode issue in the <img> tag)`;
  return `HTTP ${status}`;
}

function ensurePanel(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(PANEL_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = PANEL_ID;
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Image load diagnostics");
  el.style.cssText = [
    "position:fixed",
    "left:12px",
    "bottom:12px",
    "z-index:2147483647",
    "max-width:min(420px,calc(100vw - 24px))",
    "max-height:50vh",
    "overflow:auto",
    "background:#0b1220",
    "color:#e5e7eb",
    "border:1px solid #ef4444",
    "border-radius:10px",
    "box-shadow:0 10px 30px rgba(0,0,0,.4)",
    "font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    "padding:10px 12px",
  ].join(";");

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px";
  header.innerHTML =
    '<strong style="color:#fca5a5">Image load errors</strong>' +
    '<span id="__phl-img-count" style="color:#94a3b8">0</span>' +
    '<span style="flex:1"></span>' +
    '<a id="__phl-img-reset" href="/cache-reset?next=/" ' +
    'style="color:#93c5fd;text-decoration:underline">Reset cache</a>' +
    '<button id="__phl-img-close" aria-label="Close" ' +
    'style="background:transparent;border:0;color:#94a3b8;font-size:14px;cursor:pointer;padding:0 4px">✕</button>';
  el.appendChild(header);

  const list = document.createElement("ol");
  list.id = "__phl-img-list";
  list.style.cssText = "margin:0;padding:0 0 0 18px;list-style:decimal";
  el.appendChild(list);

  document.body.appendChild(el);

  header.querySelector<HTMLButtonElement>("#__phl-img-close")?.addEventListener("click", () => {
    el?.remove();
  });
  return el;
}

function renderEntry(r: ProbeResult): void {
  const panel = ensurePanel();
  if (!panel) return;
  const list = panel.querySelector<HTMLOListElement>("#__phl-img-list");
  const count = panel.querySelector<HTMLSpanElement>("#__phl-img-count");
  if (!list) return;
  const li = document.createElement("li");
  li.style.cssText = "margin:4px 0;word-break:break-all";
  const short = r.url.length > 120 ? r.url.slice(0, 117) + "…" : r.url;
  li.innerHTML =
    `<div><strong style="color:#fecaca">${r.status}</strong> — ${escapeHtml(r.reason)}</div>` +
    `<div><a href="${escapeAttr(r.url)}" target="_blank" rel="noopener" ` +
    `style="color:#93c5fd;text-decoration:underline">${escapeHtml(short)}</a></div>`;
  list.appendChild(li);
  if (count) count.textContent = String(list.children.length);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
  ));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

async function probe(url: string): Promise<ProbeResult> {
  const at = Date.now();
  try {
    // GET with Range: bytes=0-0 avoids downloading the whole image but still
    // triggers auth/token/CORS checks and yields the real status code.
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { Range: "bytes=0-0" },
    });
    return { url, status: res.status, reason: reasonForStatus(res.status), at };
  } catch {
    return { url, status: "network", reason: reasonForStatus("network"), at };
  }
}

export function installImageErrorAutoReset(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (isPreviewOrDev()) return;

  const alreadyReset = (() => {
    try { return sessionStorage.getItem(SESSION_FLAG) === "1"; } catch { return false; }
  })();

  const broken = new Map<string, number>();
  const seen = new Set<string>();
  const retried = new Set<string>(); // original srcs we've already cache-busted once
  const errors: ProbeResult[] = [];
  (window as unknown as { __phlImageErrors?: ProbeResult[] }).__phlImageErrors = errors;

  const CONFIRM_MSG =
    "Zresetować pamięć podręczną?\n\n" +
    "• Wyczyści Service Worker, Cache Storage i lokalne dane strony.\n" +
    "• Wszystkie obrazki i strony zostaną pobrane ponownie ze świeżej wersji.\n" +
    "• Zajmie to kilka sekund i strona przeładuje się automatycznie.";

  const confirmReset = (): boolean => {
    try { return window.confirm(CONFIRM_MSG); } catch { return true; }
  };

  const trigger = (): void => {
    if (alreadyReset) return;
    if (!confirmReset()) return;
    try { sessionStorage.setItem(SESSION_FLAG, "1"); } catch { /* ignore */ }
    const next = window.location.pathname + window.location.search + window.location.hash;
    const url = `/cache-reset?next=${encodeURIComponent(next || "/")}`;
    // eslint-disable-next-line no-console
    console.warn("[image-auto-reset] repeated image load failures — resetting cache", {
      count: broken.size,
      sample: Array.from(broken.keys()).slice(0, 3),
    });
    window.location.replace(url);
  };

  // Global click gate: any <a href="/cache-reset..."> anywhere on the page
  // (footer link, diagnostics panel, blank-page fallback overlays, etc.)
  // must prompt for confirmation first.
  document.addEventListener("click", (ev: MouseEvent) => {
    if (ev.defaultPrevented) return;
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/cache-reset")) return;
    if (a.dataset.phlConfirmed === "1") return;
    ev.preventDefault();
    if (confirmReset()) {
      a.dataset.phlConfirmed = "1";
      a.click();
    }
  }, true);


  const withCacheBust = (src: string): string => {
    try {
      const u = new URL(src, window.location.href);
      u.searchParams.set("_cb", Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      return u.toString();
    } catch {
      const sep = src.includes("?") ? "&" : "?";
      return `${src}${sep}_cb=${Date.now().toString(36)}`;
    }
  };

  /** Strip a previously-added `_cb` param so we identify the "original" src. */
  const stripCacheBust = (src: string): string => {
    try {
      const u = new URL(src, window.location.href);
      u.searchParams.delete("_cb");
      return u.toString();
    } catch {
      return src;
    }
  };

  const tryRefetch = (el: HTMLImageElement, src: string): boolean => {
    const original = stripCacheBust(src);
    if (retried.has(original)) return false;
    retried.add(original);
    const fresh = withCacheBust(original);
    // eslint-disable-next-line no-console
    console.info(`[image-retry] cache-busting broken image once before counting\n  URL: ${original}`);
    // Force a re-request. Clearing srcset first avoids the browser re-picking
    // the failed candidate. crossOrigin toggle nudges some CDN caches.
    try { el.removeAttribute("srcset"); } catch { /* ignore */ }
    // Yield a tick so the current error event fully settles before we reassign.
    setTimeout(() => {
      try { el.src = fresh; } catch { /* ignore */ }
    }, 0);
    return true;
  };

  const onError = (ev: Event): void => {
    const t = ev.target as (HTMLImageElement | HTMLSourceElement | null);
    if (!t) return;
    const rawSrc = (t as HTMLImageElement).currentSrc
      || (t as HTMLImageElement).src
      || (t as HTMLSourceElement).srcset
      || "";
    if (!rawSrc || !isFirebaseImage(rawSrc)) return;

    // First failure for this image → silently retry once with cache-bust,
    // don't log/count yet. If the retry also fails we fall through to
    // normal diagnostics + threshold accounting below.
    if (t instanceof HTMLImageElement && tryRefetch(t, rawSrc)) return;

    const src = stripCacheBust(rawSrc);
    if (seen.has(src)) return;
    seen.add(src);

    const now = Date.now();
    for (const [k, ts] of broken) if (now - ts > WINDOW_MS) broken.delete(k);
    broken.set(src, now);

    void probe(src).then((r) => {
      errors.push(r);
      // eslint-disable-next-line no-console
      console.warn(`[image-error] ${r.status} ${r.reason} (after cache-bust retry)\n  URL: ${r.url}`);
      renderEntry(r);
      if (!alreadyReset && broken.size >= THRESHOLD) trigger();
    });
  };

  window.addEventListener("error", onError, true);
}

