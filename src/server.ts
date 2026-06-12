import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isGoneLegacyPath, resolveLegacyRedirect } from "./lib/legacy-redirects";
import { isKnownFirstSegment } from "./lib/known-roots";
import { extractClientIp, log, truncate } from "./lib/worker-log";


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
   * Cookie is provisioned via GET /admin-unlock?token=<secret>.
   */
  ADMIN_GATE_SECRET?: string;
};

type WorkerCtx = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

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
// Hosts that should 301 to the canonical host (legacy brand domains).
// Lovable preview/published hosts (*.lovable.app, *.lovableproject.com) are
// intentionally excluded so previews keep working. phlabs.co.uk apex is NOT
// in this list — it is served directly to avoid hosting-layer loops.
const REDIRECT_HOSTS = new Set<string>([
  // www.phlabs.co.uk → phlabs.co.uk (apex is canonical)
  "www.phlabs.co.uk",
  // check-domains-allow-next-line: legacy host, musi tu zostać żeby zadziałał 301 do phlabs.co.uk
  "prohealthpeptides.co.uk",
  // check-domains-allow-next-line: legacy host, musi tu zostać żeby zadziałał 301 do phlabs.co.uk
  "www.prohealthpeptides.co.uk",
]);


// Content-Security-Policy — script-src is nonce + 'strict-dynamic' only on
// the production host. In CSP3 browsers, 'strict-dynamic' makes host
// allowlists in script-src be IGNORED — listing them produces Firefox
// console warnings without adding any protection. Trust flows from the
// nonce on the initial scripts to anything they dynamically load. Host
// allowlists remain on img-src / connect-src / frame-src / style-src
// where they still apply.
const CSP_TEMPLATE = [
  "default-src 'self'",
  "script-src 'nonce-__NONCE__' 'strict-dynamic'",
  "script-src-elem 'nonce-__NONCE__' 'strict-dynamic'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://www.gstatic.com",
  "media-src 'self' https: data:",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebasestorage.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://www.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://service.prerender.io https://api.prerender.io https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://www.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://www.recaptcha.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/public/csp-report",
  "report-to csp-endpoint",
].join("; ");

// Permissive CSP for Lovable preview / staging hosts. The Lovable preview
// wrapper injects extra inline bootstrap scripts and external assets
// (cdn.gpteng.co/lovable.js, /__l5e/events.js) AFTER our worker returns —
// HTMLRewriter can't nonce them, and 'strict-dynamic' ignores host
// allowlists. Without this, the preview boots into a blank page because
// the Lovable bootstrap inline script is blocked. Production (phlabs.co.uk)
// keeps the strict nonce + strict-dynamic policy above.
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
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  // Note: X-Frame-Options + X-XSS-Protection removed (deprecated).
  // Framing is controlled by CSP `frame-ancestors 'none'` (see CSP_TEMPLATE).
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self)",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  // Reporting API v1 — modern browsers POST violations here as application/reports+json.
  "reporting-endpoints": 'csp-endpoint="/api/public/csp-report"',
};


function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  // btoa is available in workerd / Web standard runtime.
  return btoa(s);
}

function isLovableHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovable.dev") ||
    h === "lovable.dev"
  );
}

function buildCsp(nonce: string, hostname?: string): string {
  if (hostname && isLovableHost(hostname)) {
    return CSP_TEMPLATE_PREVIEW;
  }
  // Replace ALL occurrences of __NONCE__ (script-src + script-src-elem).
  return CSP_TEMPLATE.split("__NONCE__").join(nonce);
}


// ==================== Bot management + Prerender.io ====================
const PRERENDER_ORIGIN = "https://service.prerender.io";
// Bumped from 15s → 30s: Googlebot was getting 5xx on /contact and other
// static pages when Prerender.io's cold render exceeded the old budget.
// 30s matches Prerender.io's own default and Googlebot's tolerance.
const PRERENDER_TIMEOUT_MS = 30_000;
const PRERENDER_CACHE_TTL = 3600;
const PRERENDER_SWR_TTL = 86_400;
const LOOP_HEADER = "x-prerender-loop";

// Pliki/ścieżki, dla których nigdy nie wołamy prerendera
const STATIC_EXT = /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|xml|txt|json|wasm|zip)(\?|$)/i;
const BYPASS_PATH_PREFIXES = ["/api/", "/_build/", "/assets/", "/static/", "/__health"];

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
];
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

// HTML routes that must NEVER be edge-cached (sensitive / dynamic per user).
// Anything not matching these gets a short 60s CF edge cache so returning
// users see ~50ms TTFB instead of 500-800ms origin renders.
// SAFETY: TTL is short (60s) so the window for stale-HTML-vs-new-chunks after
// a publish is bounded. sw.js + service-worker.js are still hard no-store
// via applyCacheRecoveryHeaders. Hashed JS/CSS assets are immutable.
const NO_CACHE_HTML_PREFIXES = [
  "/admin",
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

function applySecurityHeaders(response: Response, nonce: string, hostname?: string, pathname?: string): Response {
  const stripped = stripInternalHeaders(response);
  const contentType = stripped.headers.get("content-type") ?? "";
  // Only decorate HTML — leaving JSON/XML/asset responses untouched avoids
  // breaking sitemap, JSON-LD endpoints, and prerender.io content sniffing.
  if (!contentType.includes("text/html")) return stripped;

  const htmlHeaders = new Headers(stripped.headers);
  const cacheable = pathname ? isCacheableHtmlPath(pathname) : false;
  if (cacheable && stripped.status === 200) {
    // Browsers must always revalidate (max-age=0) so a publish is visible
    // immediately on next nav. CF edge holds the response for 60s + can serve
    // stale up to 24h while revalidating. After a publish, purge CF cache
    // or wait <=60s for fresh HTML to propagate.
    htmlHeaders.set("cache-control", "public, max-age=0, must-revalidate");
    htmlHeaders.set("cdn-cache-control", "public, max-age=60, stale-while-revalidate=86400");
    htmlHeaders.set("cloudflare-cdn-cache-control", "public, max-age=60, stale-while-revalidate=86400");
    htmlHeaders.delete("surrogate-control");
    htmlHeaders.delete("pragma");
    htmlHeaders.delete("expires");
  } else {
    // Sensitive routes — never cache.
    htmlHeaders.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
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

  // Inject the per-request nonce into every <script> element via workerd's
  // built-in HTMLRewriter.
  type Rewriter = {
    on: (selector: string, handlers: { element: (el: { setAttribute: (k: string, v: string) => void }) => void }) => Rewriter;
    transform: (r: Response) => Response;
  };
  const RewriterCtor = (globalThis as { HTMLRewriter?: new () => Rewriter }).HTMLRewriter;

  let rewritten = htmlResponse;
  if (RewriterCtor) {
    const rewriter: Rewriter = new RewriterCtor();
    rewritten = rewriter
      .on("script", {
        element(el) {
          el.setAttribute("nonce", nonce);
        },
      })
      .transform(htmlResponse);
  }

  const headers = new Headers(rewritten.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  headers.set("content-security-policy", buildCsp(nonce, hostname));
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
async function normalizeCatastrophicSsrResponse(response: Response, nonce: string, hostname?: string): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse(nonce, hostname);
}


export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerCtx): Promise<Response> {
    const start = Date.now();
    const nonce = generateNonce();
    const url = new URL(request.url);

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
        const body = JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          version: "1.0.0",
        });
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate",
            "x-robots-tag": "noindex, nofollow",
          },
        });
      }

      // 0b. Firebase Auth proxy — custom auth domain phlabs.co.uk
      // musi obsługiwać /__/auth/* i /__/firebase/* przez origin
      // Firebase (prohealthpeptides-a0808.firebaseapp.com).
      if (url.pathname.startsWith("/__/auth/") || url.pathname.startsWith("/__/firebase/")) {
        const fbUrl = new URL(url.pathname + url.search, "https://prohealthpeptides-a0808.firebaseapp.com");
        const fbReq = new Request(fbUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
          redirect: "manual",
        });
        const fbResp = await fetch(fbReq);
        const headers = new Headers(fbResp.headers);
        headers.delete("x-frame-options");
        headers.set("cache-control", "no-cache, no-store, must-revalidate");
        headers.set("pragma", "no-cache");
        headers.set("expires", "0");
        return new Response(fbResp.body, {
          status: fbResp.status,
          statusText: fbResp.statusText,
          headers,
        });
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
          // Rate-limit: 3 attempts per IP per hour to prevent brute-forcing ADMIN_GATE_SECRET.
          const ip = request.headers.get("cf-connecting-ip")
            ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? "unknown";
          const now = Date.now();
          const WINDOW_MS = 60 * 60 * 1000;
          const MAX_ATTEMPTS = 3;
          // Module-level map persists per Worker isolate.
          const bucket = adminUnlockAttempts.get(ip);
          if (bucket && now - bucket.start < WINDOW_MS) {
            if (bucket.count >= MAX_ATTEMPTS) {
              log.warn({ event: "admin_unlock.rate_limited", ip, ...baseFields });
              return new Response("Too many attempts. Try again later.", {
                status: 429,
                headers: { "cache-control": "no-store", "retry-after": String(Math.ceil((WINDOW_MS - (now - bucket.start)) / 1000)) },
              });
            }
            bucket.count += 1;
          } else {
            adminUnlockAttempts.set(ip, { count: 1, start: now });
          }
          // Opportunistic cleanup to bound memory.
          if (adminUnlockAttempts.size > 1000) {
            for (const [k, v] of adminUnlockAttempts) {
              if (now - v.start > WINDOW_MS) adminUnlockAttempts.delete(k);
            }
          }
          const token = url.searchParams.get("token") ?? "";
          if (!ctEq(token, adminGateSecret)) {
            return new Response("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
          }
          // Success — reset bucket for this IP.
          adminUnlockAttempts.delete(ip);
          return new Response(null, {
            status: 302,
            headers: {
              location: "/admin",
              "set-cookie": `admin_gate=${encodeURIComponent(adminGateSecret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,
              "cache-control": "no-store",
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
              "<!doctype html><html><head><title>Admin gate</title><meta name=\"robots\" content=\"noindex\"></head><body style=\"font-family:system-ui;padding:32px;background:#020617;color:#fff\"><h1>Additional authorisation required</h1><p>Visit <code>/admin-unlock?token=YOUR_SECRET</code> to enable admin access from this device.</p></body></html>",
              {
                status: 401,
                headers: {
                  "content-type": "text/html; charset=utf-8",
                  "cache-control": "no-store",
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
        return Response.redirect(dest.toString(), 301);
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
        return Response.redirect(dest.toString(), 301);
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
      let normalized = applySecurityHeaders(await normalizeCatastrophicSsrResponse(response, nonce, url.hostname), nonce, url.hostname, url.pathname);

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


      // 4b. Unknown top-level path → real HTTP 404 + noindex header so Google
      // doesn't index junk URLs (meta name=robots is overridden by the HTTP
      // header otherwise).
      const ct = normalized.headers.get("content-type") ?? "";
      if (
        normalized.status === 200 &&
        ct.includes("text/html") &&
        !BYPASS_PATH_PREFIXES.some((p) => url.pathname.startsWith(p)) &&
        !STATIC_EXT.test(url.pathname) &&
        !isKnownFirstSegment(url.pathname)
      ) {
        const h = new Headers(normalized.headers);
        h.set("x-robots-tag", "noindex, follow");
        h.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
        h.set("cdn-cache-control", "no-store");
        h.set("cloudflare-cdn-cache-control", "no-store");
        h.set("surrogate-control", "no-store");
        h.set("pragma", "no-cache");
        h.set("expires", "0");
        h.delete("age");
        normalized = new Response(normalized.body, {
          status: 404,
          statusText: "Not Found",
          headers: h,
        });
      }

      normalized = applyCacheRecoveryHeaders(normalized, url);

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
      // Even on a 500, /sw.js and ?sw=off MUST never be cached — otherwise a
      // single bad deploy can get pinned at the edge or in browsers for hours.
      return applyCacheRecoveryHeaders(brandedErrorResponse(nonce, url.hostname), url);
    }
  },
};
