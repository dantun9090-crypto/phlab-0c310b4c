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


// Content-Security-Policy — script-src uses per-request nonce + 'strict-dynamic'.
// Exact-host allowlist only — no `https:` wildcard, no `*.googleapis.com`
// wildcard, no Wegic CDN. 'strict-dynamic' lets nonce'd scripts load further
// scripts transitively, so the host list is a fallback for non-CSP3 browsers.
const CSP_TEMPLATE = [
  "default-src 'self'",
  "script-src 'self' 'nonce-__NONCE__' 'strict-dynamic' https://www.googletagmanager.com https://www.google-analytics.com https://apis.google.com https://www.gstatic.com https://js.stripe.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net",
  "script-src-elem 'self' 'nonce-__NONCE__' 'strict-dynamic' https://www.googletagmanager.com https://www.google-analytics.com https://apis.google.com https://www.gstatic.com https://js.stripe.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://www.gstatic.com",
  "media-src 'self' https: data:",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebasestorage.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://www.googleapis.com https://www.google-analytics.com https://region1.google-analytics.com https://api.stripe.com https://service.prerender.io https://api.prerender.io https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net wss://*.firebaseio.com",
  "frame-src 'self' https://*.firebaseapp.com https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://www.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://www.recaptcha.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/public/csp-report",
  "report-to csp-endpoint",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self)",
  "x-xss-protection": "0",
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

function buildCsp(nonce: string): string {
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

function decoratePrerender(resp: Response, fromCache: boolean, method: string, nonce: string): Response {
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
  headers.set("content-security-policy", buildCsp(nonce));

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

function applySecurityHeaders(response: Response, nonce: string): Response {
  const stripped = stripInternalHeaders(response);
  const contentType = stripped.headers.get("content-type") ?? "";
  // Only decorate HTML — leaving JSON/XML/asset responses untouched avoids
  // breaking sitemap, JSON-LD endpoints, and prerender.io content sniffing.
  if (!contentType.includes("text/html")) return stripped;

  // Inject the per-request nonce into every <script> element via workerd's
  // built-in HTMLRewriter. This covers TanStack's <Scripts /> output, the
  // BOOT_WATCHDOG + CANONICAL_ENFORCER inline blocks in __root.tsx, and the
  // ld+json schema script (harmless — browsers ignore `nonce` on non-JS types).
  type Rewriter = {
    on: (selector: string, handlers: { element: (el: { setAttribute: (k: string, v: string) => void }) => void }) => Rewriter;
    transform: (r: Response) => Response;
  };
  const RewriterCtor = (globalThis as { HTMLRewriter?: new () => Rewriter }).HTMLRewriter;

  let rewritten = stripped;
  if (RewriterCtor) {
    const rewriter: Rewriter = new RewriterCtor();
    rewritten = rewriter
      .on("script", {
        element(el) {
          el.setAttribute("nonce", nonce);
        },
      })
      .transform(stripped);
  }



  const headers = new Headers(rewritten.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  headers.set("content-security-policy", buildCsp(nonce));
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
}

function brandedErrorResponse(nonce: string): Response {
  return applySecurityHeaders(
    new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
    nonce,
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
async function normalizeCatastrophicSsrResponse(response: Response, nonce: string): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse(nonce);
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
      // 0. Health probe — przed czymkolwiek innym
      if (url.pathname === "/__health") {
        return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
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
        // Preserve all Firebase headers; just pass the response through.
        return new Response(fbResp.body, {
          status: fbResp.status,
          statusText: fbResp.statusText,
          headers: fbResp.headers,
        });
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
        const cacheKey = new Request(target, { method: "GET", headers: { accept: "text/html" } });

        const cached = await cache.match(cacheKey);
        if (cached) {
          if (env.PRERENDER_LOG === "1") log.info({ event: "worker.prerender.hit", ...baseFields });
          const ms = Date.now() - start;
          log.info({ event: "worker.request", status: cached.status, ms, prerender: "HIT", ...baseFields });
          return decoratePrerender(cached, true, method, nonce);
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
              return decoratePrerender(cacheable, false, method, nonce);
            }
            const ms = Date.now() - start;
            log.info({ event: "worker.request", status: fresh.status, ms, prerender: "PASS", ...baseFields });
            return decoratePrerender(fresh, false, method, nonce);
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
      let normalized = applySecurityHeaders(await normalizeCatastrophicSsrResponse(response, nonce), nonce);

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
        h.set("cache-control", "public, max-age=300");
        normalized = new Response(normalized.body, {
          status: 404,
          statusText: "Not Found",
          headers: h,
        });
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
      return brandedErrorResponse(nonce);
    }
  },
};
