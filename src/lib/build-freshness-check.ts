// Visible "app is up to date" health check.
//
// Companion to build-id-force-reload.ts — that module silently reloads when
// it detects a build mismatch on tab visibility/focus. This one owns the
// USER-VISIBLE recovery path for cases where the silent reload is
// suppressed (critical route, active interaction, cooldown, offline
// heuristic) or when another subsystem (chunk-reload, stale-asset watch)
// signals a build-asset mismatch mid-session.
//
// Trigger sources:
//   1. On mount (~2s after DOMContentLoaded) → GET /api/public/health/build,
//      compare buildId against the compiled __BUILD_ID__.
//   2. Custom event: window.dispatchEvent(new Event("phl:build-mismatch"))
//      from any other detector.
//
// UI:
//   Non-blocking bottom-center toast rendered via appendChild to
//   document.body — no React, no toast library dependency, safe to run
//   before hydration and inside any page. One at a time; dismisses on
//   Refresh click.

const HEALTH_URL = "/api/public/health/build";
const BANNER_ID = "phl-update-banner";
const SESSION_SHOWN_KEY = "__phl_update_banner_shown";
const CHECK_DELAY_MS = 2000;

const CURRENT_BUILD_ID =
  typeof __BUILD_ID__ === "string" && __BUILD_ID__ ? __BUILD_ID__ : "dev";

function isPreviewOrIframe(): boolean {
  try {
    if (window.top !== window.self) return true;
    const host = window.location.hostname;
    if (
      host.startsWith("id-preview--") ||
      host.startsWith("preview--") ||
      host === "lovableproject.com" ||
      host.endsWith(".lovableproject.com") ||
      host === "lovableproject-dev.com" ||
      host.endsWith(".lovableproject-dev.com") ||
      host === "beta.lovable.dev" ||
      host.endsWith(".beta.lovable.dev")
    ) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

function alreadyShown(): boolean {
  try {
    return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

function markShown(): void {
  try {
    sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const headerBuild = res.headers.get("x-build-id");
    if (headerBuild) return headerBuild;
    const body = (await res.json()) as { buildId?: string };
    return body?.buildId ?? null;
  } catch {
    return null;
  }
}

async function requestPurge(): Promise<void> {
  await Promise.race([
    fetch("/api/public/post-publish-check", {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
    }).catch(() => undefined),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
}

function hardReload(newBuildId: string | null): void {
  try {
    const loc = window.location;
    const sep = loc.search ? "&" : "?";
    const bust = encodeURIComponent(newBuildId ?? String(Date.now()));
    loc.replace(
      loc.pathname + loc.search + sep + "_bust=" + bust + "&_t=" + Date.now() + loc.hash,
    );
  } catch {
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
  }
}

function renderBanner(newBuildId: string | null): void {
  if (typeof document === "undefined" || !document.body) return;
  if (document.getElementById(BANNER_ID)) return;
  markShown();

  const wrap = document.createElement("div");
  wrap.id = BANNER_ID;
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");
  wrap.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:16px",
    "transform:translateX(-50%)",
    "z-index:2147483000",
    "max-width:calc(100vw - 24px)",
    "background:#0f172a",
    "color:#f0f6ff",
    "border:1px solid #1f2b44",
    "border-radius:12px",
    "box-shadow:0 12px 32px rgba(0,0,0,0.45)",
    "padding:12px 14px",
    "display:flex",
    "gap:12px",
    "align-items:center",
    "font:500 14px/1.4 Inter Tight,system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
  ].join(";");

  const text = document.createElement("span");
  text.style.cssText = "flex:1;min-width:0";
  text.innerHTML =
    '<strong style="display:block;font-weight:700;color:#f8fafc">App update ready</strong>' +
    '<span style="color:#9fb0c8;font-size:13px">A newer version is available. Refresh to load the latest.</span>';

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Refresh";
  btn.style.cssText = [
    "appearance:none",
    "border:0",
    "border-radius:8px",
    "background:#10b981",
    "color:#03140d",
    "font-weight:800",
    "padding:10px 14px",
    "cursor:pointer",
    "min-height:40px",
    "font-size:14px",
  ].join(";");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Refreshing…";
    try {
      await requestPurge();
    } finally {
      hardReload(newBuildId);
    }
  });

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss update notice");
  dismiss.textContent = "×";
  dismiss.style.cssText = [
    "appearance:none",
    "border:0",
    "background:transparent",
    "color:#9fb0c8",
    "font-size:20px",
    "line-height:1",
    "padding:4px 8px",
    "cursor:pointer",
  ].join(";");
  dismiss.addEventListener("click", () => {
    try {
      wrap.remove();
    } catch {
      /* ignore */
    }
  });

  wrap.appendChild(text);
  wrap.appendChild(btn);
  wrap.appendChild(dismiss);
  document.body.appendChild(wrap);
}

let checking = false;

async function checkAndShow(reason: string): Promise<void> {
  if (checking || alreadyShown()) return;
  checking = true;
  try {
    const serverBuildId = await fetchServerBuildId();
    if (!serverBuildId) return;
    if (serverBuildId === CURRENT_BUILD_ID) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[build-freshness] mismatch via ${reason} (client=${CURRENT_BUILD_ID}, server=${serverBuildId})`,
    );
    renderBanner(serverBuildId);
  } finally {
    checking = false;
  }
}

let installed = false;

export function installBuildFreshnessCheck(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (isPreviewOrIframe()) return;
  installed = true;

  // External signal: any other subsystem (chunk-reload, stale-asset watch)
  // can dispatch this event when it observes a build-asset mismatch. We
  // still confirm via /health/build so we don't render on a transient net
  // blip — the endpoint call is <200ms.
  try {
    window.addEventListener("phl:build-mismatch", () => {
      void checkAndShow("external-signal");
    });
  } catch {
    /* ignore */
  }

  // Initial "app is up to date" probe on load, delayed so it doesn't
  // compete with LCP work.
  const kick = () => {
    setTimeout(() => {
      void checkAndShow("on-load");
    }, CHECK_DELAY_MS);
  };
  if (document.readyState === "complete" || document.readyState === "interactive") {
    kick();
  } else {
    try {
      document.addEventListener("DOMContentLoaded", kick, { once: true });
    } catch {
      /* ignore */
    }
  }
}
