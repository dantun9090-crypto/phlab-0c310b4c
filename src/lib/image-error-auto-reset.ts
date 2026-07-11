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
  // Disabled: previously showed a Polish confirm() dialog and a red debug
  // panel to end users on phlabs.co.uk when Firebase Storage images failed
  // to load, and could wipe local site data (cart, session) on accept.
  // Kept as a no-op export so existing call sites in src/client.tsx compile.
  return;
}


