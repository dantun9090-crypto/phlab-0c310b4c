import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { notifySsrError } from "./lib/ssr-alert";
import { isGoneLegacyPath, resolveLegacyRedirect } from "./lib/legacy-redirects";
import { isKnownFirstSegment } from "./lib/known-roots";
import { extractClientIp, log, truncate } from "./lib/worker-log";
import { getHtmlTtlSeconds } from "./lib/server/cache-config-server";


type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type WorkerEnv = {
  PRERENDER_TOKEN?: string;
  PRERENDER_LOG?: string;
  /**
   * Second-factor gate for /admin/*. When set, the Worker requires an
   * `admin_gate` cookie whose value equals this secret BEFORE the SPA
   * shell is served — so a stolen Firebase ID token alone can't reach
   * the admin panel. Unset = disabled (no behaviour change).
   * Cookie is provisioned via POST /admin-unlock (form field `token`).
   */
  ADMIN_GATE_SECRET?: string;
};

type WorkerCtx = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

// Per-isolate guard keyed by BUILD_ID. Cloudflare can reuse an isolate across
// deploys; a single boolean/string gate can therefore suppress the next build's
// trigger. A Set makes the guard explicitly per-build while still deduping
// repeat requests inside the same isolate.
const postPublishCheckedBuildIds = new Set<string>();
function maybeTriggerPostPublish(request: Request, ctx: WorkerCtx): void {
  const url = new URL(request.url);
  if (url.hostname !== "phlabs.co.uk") return;
  const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
  if (postPublishCheckedBuildIds.has(buildId)) return;
  postPublishCheckedBuildIds.add(buildId);
  if (postPublishCheckedBuildIds.size > 12) {
    const oldest = postPublishCheckedBuildIds.values().next().value;
    if (oldest) postPublishCheckedBuildIds.delete(oldest);
  }
  const origin = `${url.protocol}//${url.host}`;
  const p = fetch(`${origin}/api/public/post-publish-check`, {
    headers: { "user-agent": "phlabs-ssr-post-publish/1.0" },
  })
    .then(async (r) => {
      const body = await r.text().catch(() => "");
      log.info({ event: "post_publish_ssr_trigger", buildId, status: r.status, body: body.slice(0, 300) });
    })
    .catch((e) => {
      log.warn({
        event: "post_publish_ssr_trigger_failed",
        buildId,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  if (ctx?.waitUntil) ctx.waitUntil(p);
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

// Canonical host: phlabs.co.uk is primary; legacy brand domains 301-redirect here.  check-domains-allow-line
// Build marker: phl_loop_fix_20260602_1115 — forces fresh Worker deploy to drop
// stale `phl_p0_recovery_20260601_2300` build that 302'd www → apex and caused
// an infinite redirect loop with the app-level long→short canonical.
const CANONICAL_HOST = "phlabs.co.uk";

// In-memory rate-limit bucket for /admin-unlock (per Worker isolate).
const adminUnlockAttempts = new Map<string, { count: number; start: number }>();
// Hosts that should 301 to the canonical host (legacy brand domains).
// Lovable preview/published hosts (*.lovable.app, *.lovableproject.com) are
// intentionally excluded so previews keep working. phlabs.co.uk apex is NOT
// in this list — it is served directly to avoid hosting-layer loops.
//
// check-domains-allow-next-line: doc comment about legacy host
// NOTE: `prohealthpeptides.co.uk` is intentionally NOT in this set — it is
// served as an isolated "legacy host" that renders the same app but with
// canonical → phlabs.co.uk (set per-route). Used as the home of a separate
// Google Merchant Center Free-Listings account with full molecule names.
// check-domains-allow-next-line: doc comment about legacy host
// `www.prohealthpeptides.co.uk` 301s to the bare apex of the legacy host.
const REDIRECT_HOSTS = new Set<string>([
  // www.phlabs.co.uk → phlabs.co.uk (apex is canonical)
  "www.phlabs.co.uk",
]);

// Hosts that 301 to their own apex (not to phlabs.co.uk).
// check-domains-allow-next-line: own-apex redirect for legacy host
const WWW_TO_APEX_HOSTS = new Map<string, string>([
  // check-domains-allow-next-line: legacy host, www → apex on the same legacy host
  ["www.prohealthpeptides.co.uk", "prohealthpeptides.co.uk"],
]);


// Content-Security-Policy — strict per-request nonce policy for production.
//
// script-src uses 'nonce-<random>' + 'strict-dynamic'. Modern browsers then
// trust only nonce-bearing bootstrap scripts and the scripts they load. Host
// allowlists are intentionally omitted here because they are ignored under
// 'strict-dynamic' and create noisy console warnings in Firefox/Chromium.
// HTMLRewriter (see applySecurityHeaders below) stamps the nonce on every
// <script> and <style> element in the response body so TanStack Start's inline
// bootstrap payload and our own inline boot guards all pass the policy. No
// 'unsafe-inline' on script-src. style-src keeps 'unsafe-inline' because React
// emits inline style attributes at runtime.

function buildStrictCsp(nonce: string): string {
  // 'unsafe-eval' is required by a small number of built vendor chunks
  // (Firebase / analytics polyfills) that call Function()/eval on Safari
  // and Firefox. Without it /products renders a black screen on those
  // engines because hydration and the CSR fallback both throw. Chromium was
  // masking this by ignoring the eval violation under 'strict-dynamic'.
  const scriptSrc = `'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  const scriptSrcElem = `'nonce-${nonce}' 'strict-dynamic'`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `script-src-elem ${scriptSrcElem}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com",
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://ssl.google-analytics.com https://www.google.com https://www.google.co.uk https://www.google.se https://www.gstatic.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://*.google.com https://*.google.se https://bat.bing.net https://bat.bing.com https://*.bing.com https://s.clarity.ms https://*.clarity.ms",
    "media-src 'self' https: data:",
    "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebasestorage.googleapis.com https://*.firebaseapp.com https://*.googleapis.com https://*.supabase.co https://www.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://region1.analytics.google.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.merchant-center-analytics.goog https://service.prerender.io https://api.prerender.io https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net https://royal-mail-order.dantun9090.workers.dev https://www.googleadservices.com https://googleads.g.doubleclick.net https://apis.google.com https://bat.bing.net https://bat.bing.com https://*.bing.com https://*.taboola.com https://s.clarity.ms https://*.clarity.ms https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://o4511662760525824.ingest.de.sentry.io https://*.wallid.io https://*.wallid.com",
    "frame-src 'self' blob: https://firebasestorage.googleapis.com https://*.firebaseapp.com https://www.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://www.recaptcha.net https://*.wallid.io https://*.wallid.com https://*.stripe.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "report-uri /api/public/csp-report",
    "report-to csp-endpoint",
  ].join("; ");
}

// Permissive CSP for Lovable preview / staging hosts. The Lovable preview
// wrapper injects extra inline bootstrap scripts and external assets
// (cdn.gpteng.co/lovable.js, /__l5e/events.js) AFTER our worker returns —
// HTMLRewriter can't nonce them, and 'strict-dynamic' ignores host
// allowlists. Without this the preview boots into a blank page.
const CSP_TEMPLATE_PREVIEW = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:",
  "script-src-elem 'self' 'unsafe-inline' https: data:",
  "style-src 'self' 'unsafe-inline' https:",
  "style-src-elem 'self' 'unsafe-inline' https:",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' data: https:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https: data: blob:",
  "connect-src 'self' https: wss: data: blob:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com",
  "report-uri /api/public/csp-report",
  "report-to csp-endpoint",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  // 2y HSTS + preload — required for hstspreload.org submission.
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  // Legacy header; modern browsers ignore it but some scanners still flag its absence.
  "x-xss-protection": "0",
  // Framing is controlled by CSP `frame-ancestors` (allows Lovable preview).
  // NOT setting X-Frame-Options: DENY on purpose — it would break the
  // Lovable in-app preview iframe. CSP frame-ancestors is the modern control.
  "referrer-policy": "strict-origin-when-cross-origin",
  // Deny every powerful feature except payment (Stripe/TrueLayer/Fena need it on self).
  "permissions-policy": [
    "accelerometer=()",
    "ambient-light-sensor=()",
    "autoplay=()",
    "battery=()",
    "camera=()",
    "display-capture=()",
    "document-domain=()",
    "encrypted-media=()",
    "fullscreen=(self)",
    "geolocation=()",
    "gyroscope=()",
    "interest-cohort=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=(self)",
    "picture-in-picture=()",
    "publickey-credentials-get=(self)",
    "screen-wake-lock=()",
    "sync-xhr=()",
    "usb=()",
    "web-share=(self)",
    "xr-spatial-tracking=()",
  ].join(", "),
  "cross-origin-opener-policy": "same-origin-allow-popups",
  // Reporting API v1 — modern browsers POST violations here as application/reports+json.
  "reporting-endpoints": 'csp-endpoint="/api/public/csp-report"',
};


function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function isLovableHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovable.dev") ||
    h === "lovable.dev"
  );
}

function useStrictCsp(hostname?: string): boolean {
  return !(hostname && isLovableHost(hostname));
}

function buildCsp(nonce: string, hostname?: string): string {
  if (!useStrictCsp(hostname)) return CSP_TEMPLATE_PREVIEW;
  return buildStrictCsp(nonce);
}



// ==================== Bot management + Prerender.io ====================
const PRERENDER_ORIGIN = "https://service.prerender.io";
// Bumped from 15s → 30s: Googlebot was getting 5xx on /contact and other
// static pages when Prerender.io's cold render exceeded the old budget.
// 30s matches Prerender.io's own default and Googlebot's tolerance.
const PRERENDER_TIMEOUT_MS = 30_000;
// Prerender.io bot HTML cache — kept inside the post-publish purge budget so
// bot HTML can never be more stale than human HTML. Full zone purge on every
// publish (see .github/workflows/post-deploy-purge.yml) clears caches.default
// too, so the effective ceiling between publishes is 60s fresh + 300s SWR.
const PRERENDER_CACHE_TTL = 60;
const PRERENDER_SWR_TTL = 300;
const LOOP_HEADER = "x-prerender-loop";

// Pliki/ścieżki, dla których nigdy nie wołamy prerendera
const STATIC_EXT = /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|xml|txt|json|wasm|zip|webmanifest)(\?|$)/i;
const BYPASS_PATH_PREFIXES = ["/api/", "/_build/", "/assets/", "/static/", "/__health", "/_serverFn/", "/_server/", "/.well-known/", "/cdn-cgi/", "/_img"];

// Static content pages: server-rendered HTML is complete without JS, so
// Prerender.io adds latency + a 5xx failure mode for no SEO benefit.
// Googlebot fetches these directly from the origin (SSR) instead.
const PRERENDER_BYPASS_PATHS = new Set<string>([
  "/contact",
  "/about",
  "/privacy-policy",
  "/shipping-policy",
  "/refund-policy",
  "/terms-and-conditions",
  "/cookies",
  "/cookie-policy",
  "/lab-reports",
  "/quality-control",
  "/research",
  "/resources",
]);

function isPrerenderBypassPath(pathname: string): boolean {
  // Normalize trailing slash so /contact and /contact/ both match.
  const p = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  return PRERENDER_BYPASS_PATHS.has(p);
}

const PRERENDER_BOTS = [
  "googlebot", "google-inspectiontool", "apis-google", "storebot-google",
  "google-extended", "googleother", "googleshopping",
  "bingbot", "bingpreview", "bingproduct", "yahoo! slurp", "duckduckbot",
  "facebookexternalhit", "meta-externalagent", "linkedinbot", "twitterbot",
  "pinterestbot", "whatsapp", "telegrambot", "discordbot", "slackbot",
  "redditbot", "snapchat",
  "gptbot", "chatgpt-user", "perplexitybot", "claudebot",
  "applebot", "applebot-extended", "amazonbot", "youbot",
  "oai-searchbot", "ccbot", "imagesiftbot", "bytespider",
  "pricerunner", "kelkoobot", "idealobot",
  "ahrefsbot", "semrushbot", "dotbot", "screaming frog",
  "dataforseobot", "serpstatbot", "siteauditbot", "blexbot", "seokicks",
  "archive.org_bot", "internetarchive",
];

// NOTE: do NOT block generic HTTP clients (curl/wget/httpclient/python-requests)
// — Prerender.io's verifier and uptime checks use such UAs and getting 403
// breaks integration verification. Keep this list to actual scraper bots.
const BLOCKED_BOTS = [
  "baiduspider", "360spider", "sogou", "sogouspider",
  // YandexBot/YandexImages removed 2026-06-02 — legitimate search engine,
  // allow it through to Prerender.io for indexing.
  "petalbot", "aspiegelbot",
  "scrapy",
  "headlesschrome", "phantomjs", "selenium", "puppeteer",
  "mj12bot",
];

const RX_BLOCKED = new RegExp(BLOCKED_BOTS.join("|"), "i");
const RX_PRERENDER = new RegExp(PRERENDER_BOTS.join("|"), "i");

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host",
  "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "cf-worker",
  "x-forwarded-for", "x-forwarded-proto", "x-real-ip", "content-length",
]);

function normalizePrerenderUrl(url: URL): string {
  const u = new URL(url.toString());
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);
  return u.toString();
}

async function fetchPrerender(target: string, request: Request, token: string): Promise<Response> {
  const fwd = new Headers();
  for (const [k, v] of request.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) fwd.set(k, v);
  }
  fwd.set("x-prerender-token", token);
  fwd.set("user-agent", request.headers.get("user-agent") || "");
  fwd.set("accept-encoding", "gzip");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PRERENDER_TIMEOUT_MS);
  try {
    return await fetch(target, { method: "GET", headers: fwd, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decoratePrerender(resp: Response, fromCache: boolean, method: string, nonce: string, hostname?: string): Response {
  const headers = new Headers(resp.headers);
  headers.set("x-prerendered", "true");
  headers.set("x-prerender-cache", fromCache ? "HIT" : "MISS");
  // Strip any upstream X-Robots-Tag (prerender.io can inject `noarchive`),
  // then leave the header unset so Google can fully index + cache.
  headers.delete("x-robots-tag");
  headers.delete("x-deployment-id");
  headers.delete("x-powered-by");
  headers.set("vary", "user-agent");

  // Apply full security headers to prerendered HTML — bots/crawlers must
  // receive the same CSP/HSTS/X-Frame-Options as real users.
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  headers.set("content-security-policy", buildCsp(nonce, hostname));

  const body = method === "HEAD" ? null : resp.body;
  return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
}

// Strip infrastructure / deployment metadata headers that leak internal
// build info to clients. Removed from every response (HTML, XML, JSON,
// assets, redirects) before it reaches the edge.
const INTERNAL_HEADER_DENYLIST = [
  "x-deployment-id",
  "x-powered-by",
  "x-vercel-id",
  "x-render-origin-server",
  // Strip origin server signature — no stack fingerprinting.
  "server",
  "via",
];

const STRICT_NO_STORE_HEADERS: Record<string, string> = {
  "cache-control": "no-store, private, no-cache, must-revalidate, max-age=0, s-maxage=0",
  "cdn-cache-control": "no-store",
  "cloudflare-cdn-cache-control": "no-store",
  "surrogate-control": "no-store",
  pragma: "no-cache",
  expires: "0",
};

function isNeverCacheRoute(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/admin-unlock" ||
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/__/auth/") ||
    pathname === "/__/auth"
  );
}

function applyStrictNoStoreHeaders(response: Response, pathname: string): Response {
  if (!isNeverCacheRoute(pathname)) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(STRICT_NO_STORE_HEADERS)) headers.set(k, v);
  headers.delete("age");
  headers.delete("etag");
  headers.delete("last-modified");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function stripInternalHeaders(response: Response): Response {
  let touched = false;
  const headers = new Headers(response.headers);
  for (const name of INTERNAL_HEADER_DENYLIST) {
    if (headers.has(name)) {
      headers.delete(name);
      touched = true;
    }
  }
  if (!touched) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applyCacheRecoveryHeaders(response: Response, url: URL): Response {
  const swOff = url.searchParams.get("sw") === "off";
  const isServiceWorker = url.pathname === "/sw.js" || url.pathname === "/service-worker.js";
  if (!swOff && !isServiceWorker) return response;

  const headers = new Headers(response.headers);

  // Hard no-store across browser AND every CDN tier. Cloudflare honors
  // `cache-control: no-store`, but if any prior rule set an Edge TTL we
  // override with the explicit CDN-tier headers below. `Surrogate-Control`
  // covers Fastly/Varnish-style proxies in front of CF (defense in depth).
  headers.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
  headers.set("cdn-cache-control", "no-store");
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("surrogate-control", "no-store");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");

  // Strip validators so browsers/CDNs can't serve a 304 from a stale copy.
  headers.delete("etag");
  headers.delete("last-modified");
  headers.delete("age");

  // Prevent any intermediary from collapsing variants of this response.
  headers.set("vary", "*");

  if (isServiceWorker) {
    headers.set("content-type", "text/javascript; charset=utf-8");
    headers.set("service-worker-allowed", "/");
    // Service-Worker-Allowed + explicit no-store ensures a returning browser
    // ALWAYS revalidates the worker bytes on the next navigation, even if the
    // previous registration is partially broken or stuck activating.
  }
  // Do not use Clear-Site-Data here: it is origin-wide and would wipe
  // unrelated browser storage/caches. The client recovery script performs a
  // scoped cleanup of only PH Labs app-shell registrations and cache buckets.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isBuildAssetPath(pathname: string): boolean {
  return /^\/(assets|_build)\/[^?#]+\.(js|mjs|css)$/i.test(pathname);
}

function missingBuildAssetRecoveryResponse(pathname: string): Response | null {
  if (!isBuildAssetPath(pathname)) return null;
  const isScript = /\.(js|mjs)$/i.test(pathname);
  const headers = new Headers({
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
    "cdn-cache-control": "no-store",
    "cloudflare-cdn-cache-control": "no-store",
    "clear-site-data": '"cache"',
    "surrogate-control": "no-store",
    "pragma": "no-cache",
    "expires": "0",
    "x-robots-tag": "noindex, nofollow",
    "vary": "*",
    "x-phl-via": "missing-build-asset-recovery",
  });
  if (!isScript) {
    headers.set("content-type", "text/css; charset=utf-8");
    return new Response("/* missing stale PH Labs build stylesheet — safe empty fallback */\n", { status: 200, headers });
  }
  headers.set("content-type", "text/javascript; charset=utf-8");
  return new Response(
    `(() => {
  try {
    console.warn('[PHL] Missing stale build asset. Automatic refresh disabled to prevent loops.');
    const clearKeys = ['__phl_reload_window','__phl_hard_reload_in_flight','__phl_route_auto_recovery_done','__phl_reloaded_at','__phl_stale_asset_reload_at','phl_reload_count','__phl_stale_asset_reload_count','__phl_hydration_error_seen','__phl_chunk_recovery','__phl_chunk_reported','__phl_missing_asset_auto_reset_at','__phl_missing_asset_auto_reset_count'];
    const clear = async () => {
      for (const key of clearKeys) {
        try { sessionStorage.removeItem(key); } catch {}
        try { localStorage.removeItem(key); } catch {}
      }
      try {
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.filter((name) => /^(phlabs-|workbox-|precache-|runtime-)/i.test(name)).map((name) => caches.delete(name)));
        }
      } catch {}
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
        }
      } catch {}
    };
    const openFresh = async () => {
      await clear();
      location.href = '/?sw=off';
    };
    const render = () => {
      document.documentElement.setAttribute('lang', 'en-GB');
      if (!document.body || document.getElementById('phl-stale-reset-screen')) return;
      document.body.innerHTML = '<div id="phl-stale-reset-screen" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060f1e;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px"><div style="max-width:460px;text-align:center"><h1 style="font-size:22px;margin:0 0 10px;font-weight:800">PH Labs update ready</h1><p style="margin:0 0 22px;color:#9fb0c8;font-size:15px;line-height:1.55">Your browser has an old page file. Automatic refreshing has been stopped.</p><button id="phl-stale-reset" style="appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:800;padding:14px 18px;cursor:pointer;font-size:16px">Open fresh store</button></div></div>';
      document.getElementById('phl-stale-reset')?.addEventListener('click', () => { void openFresh(); });
      void clear();
    };
    if (document.body) render(); else addEventListener('DOMContentLoaded', render, { once: true });
  } catch (error) {
    console.error('[PHL] stale asset recovery failed', error);
  }
})();
`,
    { status: 200, headers },
  );
}

// Dynamic non-HTML assets that MUST NOT be cached at the Cloudflare edge.
// The browser may hold a short copy (5 min) but every hit must revalidate
// with the origin so a re-uploaded file (e.g. an updated protocol PDF or a
// regenerated sitemap) is picked up on the next request without a manual
// Cloudflare purge. Applies regardless of file extension — the whole
// /downloads/* namespace is treated as user-editable content, not static
// build output. Hashed build assets live under /assets/ or /_build/ and are
// unaffected (they stay `immutable`, 1 year).
const DYNAMIC_ASSET_PREFIXES = ["/downloads/"];
const DYNAMIC_ASSET_EXACT = new Set<string>([
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-products.xml",
  "/sitemap-articles.xml",
  "/sitemap-index.xml",
]);
function isDynamicAssetPath(pathname: string): boolean {
  if (DYNAMIC_ASSET_EXACT.has(pathname)) return true;
  if (/^\/sitemap[-a-z0-9]*\.xml$/i.test(pathname)) return true;
  for (const p of DYNAMIC_ASSET_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}
function applyDynamicAssetCacheHeaders(response: Response, url: URL): Response {
  if (!isDynamicAssetPath(url.pathname)) return response;
  const headers = new Headers(response.headers);
  // Browser: 5 min soft cache, must-revalidate on every use.
  // CDN (Cloudflare + any upstream surrogate): no-store, so the edge never
  // pins a stale copy after content is re-uploaded.
  headers.set("cache-control", "public, max-age=300, must-revalidate");
  headers.set("cdn-cache-control", "no-store");
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("surrogate-control", "no-store");
  headers.delete("pragma");
  headers.delete("expires");
  headers.delete("age");
  headers.set("x-phl-cache-policy", "dynamic-asset");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// HTML routes that must NEVER be edge-cached (sensitive / dynamic per user).
// Anything not matching these gets the admin-controlled TTL (default Off/0).
// SAFETY: TTL is short (Off/24h/7d/14d/30d) so the window for stale-HTML-vs-new-chunks
// after a publish is bounded. sw.js + service-worker.js are still hard no-store
// via applyCacheRecoveryHeaders. Hashed JS/CSS assets are immutable.
const NO_CACHE_HTML_PREFIXES = [
  "/admin",
  "/auth",
  "/cart",
  "/checkout",
  "/payment",
  "/account",
  "/login",
  "/register",
  "/api/",
  "/vip",
  "/__/",
  "/_health",
  "/__health",
];

function isCacheableHtmlPath(pathname: string): boolean {
  for (const p of NO_CACHE_HTML_PREFIXES) {
    if (p.endsWith("/")) {
      if (pathname.startsWith(p)) return false;
    } else if (pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "-")) {
      return false;
    }
  }
  return true;
}

// Mirrors the phlabs-prerender Worker's HTML_CACHE_ALLOW_* lists. The
// Worker hashes every inline <script> in the origin HTML at cache MISS and
// rewrites the CSP header with 'sha256-...' + 'strict-dynamic', so a single
// shared body is safe in caches.default. Must stay in lock-step with
// cloudflare/phlabs-prerender.mjs.
const CACHEABLE_ROUTE_EXACT = new Set<string>([
  "/", "/products", "/compound", "/sitemap.xml", "/robots.txt",
]);
const CACHEABLE_ROUTE_PREFIXES = [
  "/products/", "/compound/", "/landing/", "/research/", "/blog/", "/resources/",
];
function isCacheableRoute(pathname: string): boolean {
  if (!isCacheableHtmlPath(pathname)) return false;
  if (CACHEABLE_ROUTE_EXACT.has(pathname)) return true;
  for (const p of CACHEABLE_ROUTE_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

// Public roots that should be edge-cacheable with a SHORT unified policy.
// SWR window is intentionally tiny (60s) so a fresh publish is never served
// stale HTML for more than ~2 minutes, even without a manual Cloudflare
// purge. Long SWR windows here were the root cause of "PH Labs is
// refreshing" overlays after every deploy — stale HTML referencing hashed
// JS chunks that no longer existed on origin.
const PUBLIC_EDGE_CACHEABLE = new Set<string>(["/", "/products", "/compound", "/research"]);
function isPublicEdgeCacheable(pathname: string): boolean {
  return PUBLIC_EDGE_CACHEABLE.has(pathname);
}


function applySecurityHeaders(response: Response, nonce: string, hostname?: string, pathname?: string, _htmlTtl: number = 0): Response {
  const stripped = stripInternalHeaders(response);
  const contentType = stripped.headers.get("content-type") ?? "";
  // Only decorate HTML — leaving JSON/XML/asset responses untouched avoids
  // breaking sitemap, JSON-LD endpoints, and prerender.io content sniffing.
  if (!contentType.includes("text/html")) return stripped;

  const htmlHeaders = new Headers(stripped.headers);
  const publicCacheable = pathname ? isPublicEdgeCacheable(pathname) : false;

  if (publicCacheable && stripped.status === 200) {
    // HTML shells: never cached at the edge — user repeatedly hit stale
    // HTML after publish requiring a manual Cloudflare purge. The stale
    // shell pointed at evicted hashed JS/CSS chunks → blank page until
    // purge. Hashed assets stay `immutable` 1yr, so origin cost is fine.
    // Browsers still get `must-revalidate, max-age=0` so a hard reload
    // always fetches the latest shell.
    htmlHeaders.set("cache-control", "public, max-age=0, must-revalidate");
    htmlHeaders.set("cdn-cache-control", "no-store");
    htmlHeaders.set("cloudflare-cdn-cache-control", "no-store");
    htmlHeaders.set("surrogate-control", "no-store");
    htmlHeaders.set("cache-tag", "page-html");
    htmlHeaders.delete("pragma");
    htmlHeaders.delete("expires");
  } else {

    // All other routes (auth/checkout/admin/api/dynamic) — never cache.
    htmlHeaders.set("cache-control", "private, no-store, no-cache, must-revalidate, max-age=0");
    htmlHeaders.set("cdn-cache-control", "no-store");
    htmlHeaders.set("cloudflare-cdn-cache-control", "no-store");
    htmlHeaders.set("surrogate-control", "no-store");
    htmlHeaders.set("pragma", "no-cache");
    htmlHeaders.set("expires", "0");
  }

  htmlHeaders.delete("age");

  const htmlResponse = new Response(stripped.body, {
    status: stripped.status,
    statusText: stripped.statusText,
    headers: htmlHeaders,
  });

  // HTMLRewriter: only append build-id meta. Per-request nonce injection
  // removed so HTML bodies are identical across requests and edge-cacheable.
  type RwElement = {
    setAttribute: (k: string, v: string) => void;
    append: (html: string, opts?: { html: boolean }) => void;
  };
  type Rewriter = {
    on: (selector: string, handlers: { element: (el: RwElement) => void }) => Rewriter;
    transform: (r: Response) => Response;
  };
  const RewriterCtor = (globalThis as { HTMLRewriter?: new () => Rewriter }).HTMLRewriter;

  let rewritten = htmlResponse;
  const buildId = (typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev') as string;
  const strict = useStrictCsp(hostname);
  // Hash-at-cache-miss CSP: origin emits a real per-request nonce in both
  // the CSP header and every <script>/<style> nonce attribute. The
  // downstream phlabs-prerender Worker discards this nonce, SHA-256 hashes
  // every inline <script> at cache MISS, and rewrites the CSP header with
  // 'sha256-...' + 'strict-dynamic'. This lets a single HTML body serve
  // from edge cache while CSP enforcement stays byte-exact. When the
  // Worker is absent (local dev / direct-to-origin) the nonce still works
  // for a single request — no placeholder leak, no fail-open.
  const nonceAttrValue = nonce;
  if (RewriterCtor) {
    const rewriter: Rewriter = new RewriterCtor();
    let r = rewriter.on("head", {
      element(el) {
        el.append(`<meta name="build-id" content="${buildId}">`, { html: true });
        el.append(`<meta name="build-version" content="${buildId}">`, { html: true });
        el.append(`<meta name="release" content="${buildId}">`, { html: true });
      },
    });
    if (strict) {
      // Stamp nonce on every <script> and <style> element so TanStack
      // Start's inline bootstrap payload, our inline boot guards, and
      // external module preloads all satisfy the nonce-based CSP.
      // NONCE_PROPAGATOR (in __root.tsx) mirrors the nonce onto every
      // runtime-created element, and 'strict-dynamic' authorizes their
      // dependent loads without 'unsafe-inline'.
      r = r.on("script", {
        element(el) { el.setAttribute("nonce", nonceAttrValue); },
      }).on("style", {
        element(el) { el.setAttribute("nonce", nonceAttrValue); },
      });
    }
    rewritten = r.transform(htmlResponse);
  }

  const headers = new Headers(rewritten.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  headers.set("content-security-policy", buildCsp(nonceAttrValue, hostname));
  headers.set("x-build-id", buildId);
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });

}

function brandedErrorResponse(nonce: string, hostname?: string): Response {
  return applySecurityHeaders(
    new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
    nonce,
    hostname,
  );
}

const COA_STORAGE_HOST = "firebasestorage.googleapis.com";
const COA_ALLOWED_BUCKETS = new Set([
  "prohealthpeptides-a0808.firebasestorage.app",
  "prohealthpeptides-a0808.appspot.com",
]);

const IMAGE_PROXY_ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "lh3.googleusercontent.com",
]);
const IMAGE_PROXY_ALLOWED_BUCKETS = new Set([
  "prohealthpeptides-a0808.firebasestorage.app",
  "prohealthpeptides-a0808.appspot.com",
]);

function getAllowedImageSource(raw: string | null): URL | null {
  if (!raw || raw.length > 3000) return null;
  let source: URL;
  try {
    source = new URL(raw);
  } catch {
    return null;
  }
  if (source.protocol !== "https:" || !IMAGE_PROXY_ALLOWED_HOSTS.has(source.hostname.toLowerCase())) return null;

  if (source.hostname.toLowerCase() === "firebasestorage.googleapis.com") {
    const parts = source.pathname.split("/");
    if (parts[1] !== "v0" || parts[2] !== "b" || parts[4] !== "o") return null;
    const bucket = decodeURIComponent(parts[3] || "");
    if (!IMAGE_PROXY_ALLOWED_BUCKETS.has(bucket)) return null;
    const objectName = decodeURIComponent(parts.slice(5).join("/"));
    if (
      objectName.split("/").some((part) => part === "" || part === "..") ||
      !/^(products|banners|articles|public|newsletter)\//i.test(objectName) ||
      !/\.(avif|gif|jpe?g|png|webp|svg)$/i.test(objectName)
    ) {
      return null;
    }
    source.searchParams.set("alt", "media");
  }

  return source;
}

function imageProxyError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function imageProxyHeaders(upstream: Response): Headers {
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") || "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*",
  });
  for (const name of ["accept-ranges", "content-range", "content-length", "last-modified", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function handleImageProxy(request: Request, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store" },
    });
  }
  const source = getAllowedImageSource(url.searchParams.get("u"));
  if (!source) return imageProxyError("Invalid image URL", 400);

  const upstreamHeaders = new Headers({ accept: request.headers.get("accept") || "image/avif,image/webp,image/*,*/*" });
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);

  let upstream: Response;
  try {
    upstream = await fetch(source.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return imageProxyError("Image unavailable", 502);
  }
  if (!upstream.ok && upstream.status !== 206) {
    return imageProxyError("Image unavailable", upstream.status === 404 ? 404 : 502);
  }
  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) return imageProxyError("Not an image", 415);

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: imageProxyHeaders(upstream),
  });
}

function sanitizeCoaFilename(value: string | null): string {
  const cleaned = (value || "certificate-of-analysis.pdf")
    .replace(/[\r\n\x00]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 120);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "certificate-of-analysis"}.pdf`;
}

function getAllowedCoaSource(raw: string | null): URL | null {
  if (!raw || raw.length > 2500) return null;
  let source: URL;
  try {
    source = new URL(raw);
  } catch {
    return null;
  }
  if (source.protocol !== "https:" || source.hostname.toLowerCase() !== COA_STORAGE_HOST) return null;

  const parts = source.pathname.split("/");
  if (parts[1] !== "v0" || parts[2] !== "b" || parts[4] !== "o") return null;
  const bucket = decodeURIComponent(parts[3] || "");
  if (!COA_ALLOWED_BUCKETS.has(bucket)) return null;

  const objectName = decodeURIComponent(parts.slice(5).join("/"));
  const objectParts = objectName.split("/");
  if (
    objectParts.some((part) => part === "" || part === "..") ||
    !objectName.startsWith("products/") ||
    !objectName.includes("/coa/") ||
    !objectName.toLowerCase().endsWith(".pdf")
  ) {
    return null;
  }

  source.searchParams.set("alt", "media");
  return source;
}

function coaPdfError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function coaPdfHeaders(upstream: Response, filename: string, download: boolean): Headers {
  const headers = new Headers({
    "content-type": "application/pdf",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "pragma": "no-cache",
    "expires": "0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  });
  for (const name of ["accept-ranges", "content-range", "content-length", "last-modified", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function handleCoaPdfProxy(request: Request, url: URL): Promise<Response> {
  const source = getAllowedCoaSource(url.searchParams.get("url"));
  if (!source) return coaPdfError("Invalid certificate URL", 400);

  const upstreamHeaders = new Headers({ accept: "application/pdf" });
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);

  let upstream: Response;
  try {
    upstream = await fetch(source.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return coaPdfError("Certificate temporarily unavailable", 502);
  }

  if (!upstream.ok && upstream.status !== 206) {
    return coaPdfError("Certificate unavailable", upstream.status === 404 ? 404 : 502);
  }

  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("application/pdf") && !contentType.includes("application/octet-stream")) {
    return coaPdfError("Certificate is not a PDF", 415);
  }

  const filename = sanitizeCoaFilename(url.searchParams.get("filename"));
  const download = url.searchParams.get("download") === "1";
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: coaPdfHeaders(upstream, filename, download),
  });
}


function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  nonce: string,
  hostname?: string,
  request?: Request,
  ctx?: { waitUntil?: (p: Promise<unknown>) => void },
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  const captured = consumeLastCapturedError();
  const err = captured ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(err);
  if (request) {
    notifySsrError({
      error: err,
      url: new URL(request.url),
      method: request.method,
      ctx,
      kind: captured ? "renderToReadableStream" : "h3-swallowed",
    });
  }
  return brandedErrorResponse(nonce, hostname);
}


export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerCtx): Promise<Response> {
    const start = Date.now();
    const nonce = generateNonce();
    const url = new URL(request.url);

    // Trigger post-publish invalidation on first request per isolate carrying
    // a new BUILD_ID (fires once, uses ctx.waitUntil so CF completes purge).
    maybeTriggerPostPublish(request, ctx);

    const ip = extractClientIp(request);
    const ray = request.headers.get("cf-ray");
    const country = request.headers.get("cf-ipcountry");
    const ua = truncate(request.headers.get("user-agent"));
    const referer = truncate(request.headers.get("referer"));
    const baseFields = {
      method: request.method,
      path: url.pathname,
      query: url.search || undefined,
      ip,
      country,
      ua,
      referer,
      cfRay: ray,
    };

    try {
      // 0. Health probe — /_health (public) and /__health (legacy/internal).
      // Returns JSON with version + timestamp, never cached, never prerendered.
      if (url.pathname === "/_health" || url.pathname === "/__health") {
        const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
        const body = JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          version: "1.0.0",
          buildId,
        });
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate",
            "x-robots-tag": "noindex, nofollow",
            "x-build-id": buildId,
          },
        });
      }

      // 0.1. Same-origin image proxy for Firebase/Google-hosted storefront
      // images. This keeps `/_img?...` working in the sandbox and on the
      // custom domain even when the edge image-resize Worker is bypassed.
      if (url.pathname === "/_img" || url.pathname === "/_img/") {
        const response = await handleImageProxy(request, url);
        if (request.method === "HEAD") {
          return new Response(null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
        return response;
      }

      // 0.5. Hard reset endpoint — deterministic browser-level wipe used by
      // the stale-asset recovery screen ("PH Labs is refreshing"). Returns
      // `Clear-Site-Data: "cache", "storage", "executionContexts"` which
      // unregisters service workers, clears Cache Storage, and evicts the HTTP
      // cache for this origin. We deliberately do NOT clear cookies (auth
      // session survives). The response is manual-only: no meta refresh and no
      // JS redirect, so stale browsers cannot get trapped in a refresh loop.
      if (url.pathname === "/api/public/hardreset") {
        const nextParam = url.searchParams.get("next") || "/";
        const safeNext = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@/?%#]*$/.test(nextParam) && !nextParam.startsWith("//")
          ? nextParam
          : "/";
        const nextEsc = safeNext.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
        const body = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PH Labs — update ready</title><style>html,body{margin:0;background:#060f1e;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}div{max-width:420px;text-align:center}h1{font-size:20px;margin:0 0 10px;font-weight:800}p{margin:0 0 18px;color:#9fb0c8;font-size:14px;line-height:1.5}a{display:inline-block;background:#10b981;color:#03140d;font-weight:800;padding:12px 18px;border-radius:8px;text-decoration:none}</style></head><body><main><div><h1>PH Labs update ready</h1><p>Your browser cache was cleared. Automatic refreshing has been stopped.</p><a href="${nextEsc}">Open fresh store</a></div></main></body></html>`;
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "clear-site-data": '"cache", "storage", "executionContexts"',
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            "cdn-cache-control": "no-store",
            "cloudflare-cdn-cache-control": "no-store",
            "surrogate-control": "no-store",
            "pragma": "no-cache",
            "expires": "0",
            "x-robots-tag": "noindex, nofollow",
            "referrer-policy": "no-referrer",
            "x-phl-via": "hardreset",
          },
        });
      }

      // 0a. COA PDF proxy — load Firebase Storage PDFs from the same origin so
      // Android Chrome does not block the embedded certificate viewer.
      if (url.pathname === "/api/public/coa-pdf") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { allow: "GET, HEAD", "cache-control": "no-store" },
          });
        }
        const response = await handleCoaPdfProxy(request, url);
        if (request.method === "HEAD") {
          return new Response(null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
        return response;
      }

      // 0b. Firebase Auth proxy — custom auth domain phlabs.co.uk
      // musi obsługiwać /__/auth/* i /__/firebase/* przez origin
      // Firebase (prohealthpeptides-a0808.firebaseapp.com).
      if (url.pathname.startsWith("/__/auth/") || url.pathname.startsWith("/__/firebase/")) {
        try {
          const fbUrl = new URL(url.pathname + url.search, "https://prohealthpeptides-a0808.firebaseapp.com");
          const fbHeaders = new Headers();
          const accept = request.headers.get("accept");
          const acceptLanguage = request.headers.get("accept-language");
          const userAgent = request.headers.get("user-agent");
          const contentType = request.headers.get("content-type");
          if (accept) fbHeaders.set("accept", accept);
          if (acceptLanguage) fbHeaders.set("accept-language", acceptLanguage);
          if (userAgent) fbHeaders.set("user-agent", userAgent);
          if (contentType) fbHeaders.set("content-type", contentType);
          // Force identity so we can buffer + re-serve without content-encoding
          // mismatches (root cause of intermittent CF 1101 on /__/auth/iframe).
          fbHeaders.set("accept-encoding", "identity");
          const hasBody = request.method !== "GET" && request.method !== "HEAD";
          const fbReq = new Request(fbUrl.toString(), {
            method: request.method,
            headers: fbHeaders,
            body: hasBody ? request.body : null,
            redirect: "manual",
          });
          const fbResp = await fetch(fbReq);
          // Buffer the body so any streaming error happens INSIDE our try/catch
          // instead of after the response headers have been flushed (which
          // would surface as an unrecoverable Cloudflare 1101 error).
          const buf = await fbResp.arrayBuffer();
          const headers = new Headers(fbResp.headers);
          headers.delete("x-frame-options");
          headers.delete("content-encoding");
          headers.delete("content-length");
          headers.delete("transfer-encoding");
          for (const [k, v] of Object.entries(STRICT_NO_STORE_HEADERS)) headers.set(k, v);
          return new Response(buf, {
            status: fbResp.status,
            statusText: fbResp.statusText,
            headers,
          });
        } catch (err) {
          log.error({
            event: "firebase_auth_proxy.error",
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            proxyPath: url.pathname,

            ...baseFields,
          });
          return new Response("Auth proxy temporarily unavailable", {
            status: 502,
            headers: { "content-type": "text/plain; charset=utf-8", ...STRICT_NO_STORE_HEADERS },
          });
        }
      }


      // 0c. Admin second-factor gate. When ADMIN_GATE_SECRET is configured,
      // every /admin and /admin/* HTML request must carry an `admin_gate`
      // cookie matching the secret. Runs BEFORE the SPA shell is served, so
      // a stolen Firebase ID token alone cannot reach the admin UI. The
      // cookie is provisioned via GET /admin-unlock?token=... (constant-time
      // compared). Disabled when the secret is unset (no behaviour change).
      const adminGateSecret = env?.ADMIN_GATE_SECRET;
      if (adminGateSecret) {
        const ctEq = (a: string, b: string): boolean => {
          const ea = new TextEncoder().encode(a);
          const eb = new TextEncoder().encode(b);
          let diff = ea.length ^ eb.length;
          const len = Math.max(ea.length, eb.length);
          for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
          return diff === 0;
        };
        if (url.pathname === "/admin-unlock") {
          // GET renders a small form so the secret is typed into a POST body,
          // never the URL (which would land in CF logs, browser history, Referer).
          if (request.method === "GET") {
            return new Response(
              "<!doctype html><html><head><title>Admin unlock</title><meta name=\"robots\" content=\"noindex\"><meta name=\"referrer\" content=\"no-referrer\"></head><body style=\"font-family:system-ui;padding:32px;background:#020617;color:#fff\"><h1>Admin unlock</h1><form method=\"POST\" action=\"/admin-unlock\" autocomplete=\"off\"><label for=\"token\">Token</label><br><input id=\"token\" name=\"token\" type=\"password\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" style=\"min-width:320px;padding:8px;margin:8px 0;background:#0f172a;color:#fff;border:1px solid #334155;border-radius:6px\"><br><button type=\"submit\" style=\"padding:8px 16px;background:#10b981;color:#020617;border:0;border-radius:6px;font-weight:600;cursor:pointer\">Unlock</button></form></body></html>",
              {
                status: 200,
                headers: {
                  "content-type": "text/html; charset=utf-8",
                  ...STRICT_NO_STORE_HEADERS,
                  "x-robots-tag": "noindex, nofollow",
                  "referrer-policy": "no-referrer",
                },
              },
            );
          }
          if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405, headers: { ...STRICT_NO_STORE_HEADERS, allow: "GET, POST" } });
          }
          // Rate-limit: 3 attempts per IP per hour to prevent brute-forcing ADMIN_GATE_SECRET.
          const ip = request.headers.get("cf-connecting-ip")
            ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? "unknown";
          const now = Date.now();
          const WINDOW_MS = 60 * 60 * 1000;
          const MAX_ATTEMPTS = 3;
          const bucket = adminUnlockAttempts.get(ip);
          if (bucket && now - bucket.start < WINDOW_MS) {
            if (bucket.count >= MAX_ATTEMPTS) {
              log.warn({ event: "admin_unlock.rate_limited", ...baseFields, ip });
              return new Response("Too many attempts. Try again later.", {
                status: 429,
                headers: { ...STRICT_NO_STORE_HEADERS, "retry-after": String(Math.ceil((WINDOW_MS - (now - bucket.start)) / 1000)) },
              });
            }
            bucket.count += 1;
          } else {
            adminUnlockAttempts.set(ip, { count: 1, start: now });
          }
          if (adminUnlockAttempts.size > 1000) {
            for (const [k, v] of adminUnlockAttempts) {
              if (now - v.start > WINDOW_MS) adminUnlockAttempts.delete(k);
            }
          }
          // Read token from POST body (form-encoded). Never accept it from the query string.
          let token = "";
          try {
            const ct = request.headers.get("content-type") ?? "";
            if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
              const form = await request.formData();
              const v = form.get("token");
              token = typeof v === "string" ? v : "";
            } else {
              // Fallback: raw body parsed as urlencoded.
              const body = await request.text();
              token = new URLSearchParams(body).get("token") ?? "";
            }
          } catch {
            token = "";
          }
          if (!token || !ctEq(token, adminGateSecret)) {
            return new Response("Forbidden", { status: 403, headers: { ...STRICT_NO_STORE_HEADERS, "referrer-policy": "no-referrer" } });
          }
          adminUnlockAttempts.delete(ip);
          return new Response(null, {
            status: 303,
            headers: {
              location: "/admin",
              "set-cookie": `admin_gate=${encodeURIComponent(adminGateSecret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,
              ...STRICT_NO_STORE_HEADERS,
              "referrer-policy": "no-referrer",
            },
          });
        }


        const isAdminPath = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
        if (isAdminPath) {
          const cookieHeader = request.headers.get("cookie") ?? "";
          const match = /(?:^|;\s*)admin_gate=([^;]+)/.exec(cookieHeader);
          const supplied = match ? decodeURIComponent(match[1]) : "";
          if (!ctEq(supplied, adminGateSecret)) {
            log.warn({ event: "admin_gate.blocked", ...baseFields });
            return new Response(
              "<!doctype html><html><head><title>Admin gate</title><meta name=\"robots\" content=\"noindex\"><meta name=\"referrer\" content=\"no-referrer\"></head><body style=\"font-family:system-ui;padding:32px;background:#020617;color:#fff\"><h1>Additional authorisation required</h1><p>Visit <a href=\"/admin-unlock\" style=\"color:#10b981\">/admin-unlock</a> and submit the secret to enable admin access from this device.</p></body></html>",
              {
                status: 401,
                headers: {
                  "content-type": "text/html; charset=utf-8",
                  ...STRICT_NO_STORE_HEADERS,
                  "x-robots-tag": "noindex, nofollow",
                },
              },
            );
          }
        }
      }

      // 1. Canonical host redirect (legacy brand domains → phlabs.co.uk).
      // phlabs.co.uk is intentionally served directly until the hosting-level
      // www → apex redirect is removed; otherwise production loops.
      const reqHost = url.hostname.toLowerCase();
      if (REDIRECT_HOSTS.has(reqHost)) {
        const dest = new URL(url.toString());
        dest.hostname = CANONICAL_HOST;
        dest.protocol = "https:";
        dest.port = "";
        log.info({ event: "worker.redirect", status: 301, reason: "canonical-host", to: dest.toString(), ...baseFields });
        return applyStrictNoStoreHeaders(Response.redirect(dest.toString(), 301), url.pathname);
      }
      // www of a legacy host → its own apex (NOT canonical phlabs.co.uk).
      const wwwApex = WWW_TO_APEX_HOSTS.get(reqHost);
      if (wwwApex) {
        const dest = new URL(url.toString());
        dest.hostname = wwwApex;
        dest.protocol = "https:";
        dest.port = "";
        log.info({ event: "worker.redirect", status: 301, reason: "legacy-www-apex", to: dest.toString(), ...baseFields });
        return applyStrictNoStoreHeaders(Response.redirect(dest.toString(), 301), url.pathname);
      }

      // 1a-pre. Stale hashed-asset guard. If a request for /assets/* or
      // /_build/* reaches the Worker, the static-asset binding already
      // missed (the hashed file isn't in this deployment). Returning the
      // SPA HTML shell with 200 here would be cached as `immutable` by
      // browsers and surfaced as a MIME-type error:
      //   "Loading module from … was blocked because of a disallowed
      //   MIME type ('text/html')."
      // Always answer with a real 404 + no-store so the browser refetches
      // the current index.html on next nav and picks up fresh hashes.
      if (
        (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/_build/")) &&
        /\.[a-z0-9]+$/i.test(url.pathname)
      ) {
        log.info({ event: "worker.asset.404", status: 404, ...baseFields });
        return new Response("Not Found", {
          status: 404,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            "cdn-cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
          },
        });
      }


      // 1a. Sandbox/mobile recovery: /index is not a real PH Labs route.
      // Redirect it to the home page before the SPA/catch-all can render a
      // blank/blocked preview shell.
      if (url.pathname === "/index") {
        const dest = new URL(url.toString());
        dest.pathname = "/";
        log.info({ event: "worker.redirect", status: 301, reason: "index-alias", to: dest.pathname, ...baseFields });
        return Response.redirect(dest.toString(), 301);
      }

      // 1a-bis. Calculator lives on phlabs.app — 301 legacy /calculator hits
      // so Bing/Google can clear the 404 entry from their index.
      if (url.pathname === "/calculator" || url.pathname.startsWith("/calculator/")) {
        log.info({ event: "worker.redirect", status: 301, reason: "calculator-app", ...baseFields });
        return Response.redirect("https://phlabs.app/", 301);
      }

      // 1b. Trailing-slash normalization → 301 to non-trailing-slash form.
      // Keep "/" itself; skip API/asset paths and anything with a file extension.
      if (
        url.pathname.length > 1 &&
        url.pathname.endsWith("/") &&
        !url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/lovable/") &&
        !/\.[a-z0-9]+$/i.test(url.pathname)
      ) {
        const dest = new URL(url.toString());
        dest.pathname = url.pathname.replace(/\/+$/, "");
        log.info({ event: "worker.redirect", status: 301, reason: "trailing-slash", to: dest.pathname, ...baseFields });
        return applyStrictNoStoreHeaders(Response.redirect(dest.toString(), 301), url.pathname);
      }



      // 2. 301 redirect legacy (Wegic) URLs before SSR runs.
      const legacy = resolveLegacyRedirect(url.pathname);
      if (legacy && legacy !== url.pathname) {
        const dest = new URL(legacy, url);
        dest.search = url.search;
        log.info({ event: "worker.redirect", status: 301, to: dest.pathname, ...baseFields });
        return Response.redirect(dest.toString(), 301);
      }

      // 2b. 410 Gone for dead Wegic template URLs so Google removes them
      // from the crawl queue instead of reporting "Discovered – currently
      // not indexed" forever.
      if (isGoneLegacyPath(url.pathname)) {
        log.info({ event: "worker.gone", status: 410, ...baseFields });
        return new Response(
          "<!doctype html><html><head><meta name=\"robots\" content=\"noindex\"><meta name=\"prerender-status-code\" content=\"410\"><title>410 Gone</title></head><body><h1>410 Gone</h1><p>This page no longer exists.</p></body></html>",
          {
            status: 410,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "x-robots-tag": "noindex, nofollow",
              "cache-control": "public, max-age=86400",
            },
          },
        );
      }


      // 3. Bot management
      const rawUa = request.headers.get("user-agent") || "";
      const method = request.method.toUpperCase();

      // 3a. Block scrapers / malicious UAs
      // CRITICAL: whitelist Prerender.io's own renderer — it uses HeadlessChrome
      // to fetch our origin, and would otherwise hit BLOCKED list and 403.
      const isPrerenderRenderer = /Prerender \(\+https:\/\/github\.com\/prerender\/prerender\)/i.test(rawUa);
      if (!isPrerenderRenderer && RX_BLOCKED.test(rawUa) && !request.headers.get(LOOP_HEADER)) {
        log.info({ event: "worker.bot.blocked", status: 403, ...baseFields });
        return new Response("Access Denied", {
          status: 403,
          headers: { "content-type": "text/plain", "x-robots-tag": "noindex, nofollow" },
        });
      }

      // 3b. Prerender.io for SEO/social/AI bots on GET/HEAD HTML routes
      const path = url.pathname;
      const isHtmlMethod = method === "GET" || method === "HEAD";
      const bypassPath = BYPASS_PATH_PREFIXES.some((p) => path.startsWith(p));
      const isStatic = STATIC_EXT.test(path);
      const isStaticContentPage = isPrerenderBypassPath(path);
      const isPrerenderBot = RX_PRERENDER.test(rawUa);
      const isLoop = request.headers.has(LOOP_HEADER);
      const token = env?.PRERENDER_TOKEN;

      if (token && isHtmlMethod && isPrerenderBot && !bypassPath && !isStatic && !isStaticContentPage && !isLoop) {
        const normalized = normalizePrerenderUrl(url);
        const target = `${PRERENDER_ORIGIN}/${normalized}`;
        const cache = (caches as unknown as { default: Cache }).default;
        // Cache under the public PH Labs URL, not the upstream Prerender.io URL.
        // This makes selective Cloudflare purges for https://phlabs.co.uk/*
        // invalidate bot HTML too; the old upstream-keyed entries are no longer read.
        const cacheKey = new Request(normalized, { method: "GET", headers: { accept: "text/html" } });

        const cached = await cache.match(cacheKey);
        if (cached) {
          if (env.PRERENDER_LOG === "1") log.info({ event: "worker.prerender.hit", ...baseFields });
          const ms = Date.now() - start;
          log.info({ event: "worker.request", status: cached.status, ms, prerender: "HIT", ...baseFields });
          return decoratePrerender(cached, true, method, nonce, url.hostname);
        }

        try {
          const fresh = await fetchPrerender(target, request, token);
          if (fresh && fresh.status < 500) {
            if (fresh.status < 400) {
              const headers = new Headers(fresh.headers);
              headers.set(
                "cache-control",
                `public, max-age=${PRERENDER_CACHE_TTL}, s-maxage=${PRERENDER_CACHE_TTL}, stale-while-revalidate=${PRERENDER_SWR_TTL}`,
              );
              headers.delete("set-cookie");
              const cacheable = new Response(fresh.body, {
                status: fresh.status,
                statusText: fresh.statusText,
                headers,
              });
              ctx?.waitUntil?.(cache.put(cacheKey, cacheable.clone()));
              const ms = Date.now() - start;
              log.info({ event: "worker.request", status: cacheable.status, ms, prerender: "MISS", ...baseFields });
              return decoratePrerender(cacheable, false, method, nonce, url.hostname);
            }
            const ms = Date.now() - start;
            log.info({ event: "worker.request", status: fresh.status, ms, prerender: "PASS", ...baseFields });
            return decoratePrerender(fresh, false, method, nonce, url.hostname);
          }
          log.warn({ event: "worker.prerender.fallback", status: fresh?.status, ...baseFields });
        } catch (err) {
          log.warn({
            event: "worker.prerender.error",
            error: err instanceof Error ? err.message : String(err),
            ...baseFields,
          });
        }
        // Awaria/5xx → fallback do SSR przez loop-marker, żeby nie powtarzać prerendera.
        const fallbackHeaders = new Headers(request.headers);
        fallbackHeaders.set(LOOP_HEADER, "1");
        const fallbackReq = new Request(request.url, {
          method: request.method,
          headers: fallbackHeaders,
          body: request.body,
        });
        return await this.fetch(fallbackReq, env, ctx);
      }

      // 4. Normal SSR path
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const htmlTtl = await getHtmlTtlSeconds().catch(() => 0);
      let normalized = applySecurityHeaders(await normalizeCatastrophicSsrResponse(response, nonce, url.hostname, request, ctx), nonce, url.hostname, url.pathname, htmlTtl);

      // Fix asset content-types that the static handler mis-detects.
      // `.webmanifest` is served as application/octet-stream by default, which
      // some browsers reject — must be application/manifest+json for PWA install.
      if (url.pathname.endsWith(".webmanifest")) {
        const h = new Headers(normalized.headers);
        h.set("content-type", "application/manifest+json; charset=utf-8");
        normalized = new Response(normalized.body, {
          status: normalized.status,
          statusText: normalized.statusText,
          headers: h,
        });
      }


      // 4b. SSR-signalled 404 only. The SPA splat route emits
      //   <meta name="prerender-status-code" content="404">
      // for genuinely-unknown paths. We ONLY downgrade an SSR 200 HTML
      // response to a real HTTP 404 (with x-robots-tag: noindex) when
      // that sentinel is present in the body. Previously we forced 404
      // for any 200 HTML whose first path segment wasn't in KNOWN_ROOTS
      // — that was fragile: every newly-added dedicated route had to be
      // added to the allow-list or its valid 200 page silently became
      // a 404. Trusting the SSR sentinel keeps the decision next to
      // the component that owns it.
      const ct = normalized.headers.get("content-type") ?? "";
      const isHtml200 =
        normalized.status === 200 &&
        ct.includes("text/html") &&
        !BYPASS_PATH_PREFIXES.some((p) => url.pathname.startsWith(p)) &&
        !STATIC_EXT.test(url.pathname);
      if (isHtml200) {
        const peek = await normalized.clone().text();
        // Trust the SSR sentinel unconditionally — the route component
        // that emitted the meta owns the 404 decision (including deep
        // paths under known roots like /products/foo/bar).
        const sentinel404 =
          /<meta[^>]+name=["']prerender-status-code["'][^>]+content=["']404["']/i.test(
            peek,
          );
        if (sentinel404) {
          const h = new Headers(normalized.headers);
          h.set("x-robots-tag", "noindex, follow");
          h.set(
            "cache-control",
            "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
          );
          h.set("cdn-cache-control", "no-store");
          h.set("cloudflare-cdn-cache-control", "no-store");
          h.set("surrogate-control", "no-store");
          h.set("pragma", "no-cache");
          h.set("expires", "0");
          h.delete("age");
          normalized = new Response(peek, {
            status: 404,
            statusText: "Not Found",
            headers: h,
          });
        }
      }

      normalized = applyStrictNoStoreHeaders(applyCacheRecoveryHeaders(normalized, url), url.pathname);
      normalized = applyDynamicAssetCacheHeaders(normalized, url);

      if (normalized.status === 404) {
        const recovery = missingBuildAssetRecoveryResponse(url.pathname);
        if (recovery) normalized = recovery;
      }

      // Hard noindex for non-canonical hosts (e.g. *.lovable.app,
      // *.lovableproject.com) so Google/Bing never index the preview or
      // published-preview subdomain as duplicate content of phlabs.co.uk.
      if (reqHost !== CANONICAL_HOST && (reqHost.endsWith(".lovable.app") || reqHost.endsWith(".lovableproject.com"))) {
        const h = new Headers(normalized.headers);
        h.set("x-robots-tag", "noindex, nofollow");
        normalized = new Response(normalized.body, { status: normalized.status, statusText: normalized.statusText, headers: h });
      }

      const ms = Date.now() - start;
      log.info({
        event: "worker.request",
        status: normalized.status,
        ms,
        ...baseFields,
      });
      return normalized;
    } catch (error) {
      const ms = Date.now() - start;
      log.error({
        event: "worker.request.error",
        status: 500,
        ms,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...baseFields,
      });
      console.error(error);
      notifySsrError({ error, url, method: request.method, ctx, kind: "worker-catch" });
      // Even on a 500, /sw.js and ?sw=off MUST never be cached — otherwise a
      // single bad deploy can get pinned at the edge or in browsers for hours.
      return applyCacheRecoveryHeaders(brandedErrorResponse(nonce, url.hostname), url);
    }
  },
};
