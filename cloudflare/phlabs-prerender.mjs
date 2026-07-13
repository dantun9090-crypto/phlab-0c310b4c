// cloudflare/phlabs-prerender.mjs
// Hash-at-cache-miss, serve-raw-on-HIT. ALL HTML routes use this path.
// Bot/prerender branch: UA sniff -> Prerender.io -> hash-CSP -> cache separately.
// TTFB: ~50-80ms cache HIT (browser), ~75ms (prerender).
//
// Deploy version: 2026-07-13.01 — disable browser HTML edge cache completely;
// cached home shells were masking fresh publishes.

// ═══════════════════════════════════════════════════════════════════════════════
// ORIGIN & ROUTING
// ═══════════════════════════════════════════════════════════════════════════════
const ORIGIN = "https://phlabs-prod.web.app";
const PROXY_HOST = "phlabs.co.uk";
const PRERENDER_SERVICE = "https://service.prerender.io";

const PROXY_ROUTES = [
  "/_img",
  "/_fonts/",
  "/fonts/",
  "/_api/",
  "/api/",
  "/assets/",
  "/_build/",
  "/downloads/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

const CACHE_TTL = {
  prerender: 60,     // 60s for prerendered HTML (keep bot cache fresh after deploys)
  static: 31536000,  // 1 year for hashed immutable assets — required by
                     // e2e/cache-headers-regression.spec.ts (max-age >= 31536000)
};

const HTML_NO_STORE_CACHE_CONTROL = "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0";
const DOWNLOAD_NO_STORE_CACHE_CONTROL = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0";
const IMMUTABLE_BUILD_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const HASHED_STATIC_ASSET_RE = /(?:^|\/)[^/?#]+(?:[-._][a-f0-9]{8,}|-[A-Za-z0-9_-]{8,})\.(?:js|mjs|css|woff2?|ttf|otf)$/i;

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER-INTERNAL HTML WARM CACHE (Task 1.1)
// ─────────────────────────────────────────────────────────────────────────────
// Per-isolate in-memory cache for sanitized browser HTML shells. Serves TTFB
// ~5–30ms on hit while keeping the CDN/browser contract at no-store — the
// CDN never sees the cached bytes, only this Worker isolate does. Hits are
// bounded by isolate lifetime (typically minutes) and WARM_TTL_MS.
//
// SAFETY: Only cache successful (2xx) text/html responses on GET. Never cache
// authenticated / sensitive paths — those are excluded by prefix below.
// ═══════════════════════════════════════════════════════════════════════════════
const WARM_TTL_MS = 0;
const WARM_MAX_ENTRIES = 64;
const WARM_SKIP_PREFIXES = [
  "/admin", "/auth", "/login", "/logout", "/account",
  "/cart", "/checkout", "/payment", "/register", "/api/", "/downloads/",
];
/** @type {Map<string, { body: ArrayBuffer, contentType: string, expiresAt: number }>} */
const htmlWarmCache = new Map();

function warmCacheKey(url) {
  // Key on pathname only — HTML shells are identical across query strings for
  // our routes, and query-string variance would blow the cache with tracking
  // params (utm_*, gclid, fbclid). Skip if the path is sensitive.
  return url.pathname;
}

function warmCacheGet(key) {
  const hit = htmlWarmCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    htmlWarmCache.delete(key);
    return null;
  }
  return hit;
}

function warmCacheSet(key, body, contentType) {
  if (htmlWarmCache.size >= WARM_MAX_ENTRIES) {
    // Simple FIFO eviction — delete oldest.
    const firstKey = htmlWarmCache.keys().next().value;
    if (firstKey !== undefined) htmlWarmCache.delete(firstKey);
  }
  htmlWarmCache.set(key, { body, contentType, expiresAt: Date.now() + WARM_TTL_MS });
}

function warmCacheEligible(_path) {
  // Disabled while publishing/debugging: any Worker-isolate warm HTML cache can
  // mask a fresh deployment for the next visitor on that isolate.
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
const CRAWLER_UAS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /embedly/i,
  /quora link preview/i,
  /showyoubot/i,
  /outbrain/i,
  /pinterest/i,
  /slackbot/i,
  /vkshare/i,
  /w3c_validator/i,
  /redditbot/i,
  /applebot/i,
  /whatsapp/i,
  /flipboard/i,
  /tumblr/i,
  /bitlybot/i,
  /skypeuripreview/i,
  /nuzzel/i,
  /discordbot/i,
  /google page speed/i,
  /qwantify/i,
  /pinterestbot/i,
  /msnbot/i,
  /adidxbot/i,
  /blekkobot/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /rogerbot/i,
  /screaming frog/i,
  /sitebulb/i,
  /deepcrawl/i,
  /bot/i,
  /crawler/i,
];

function isCrawler(request) {
  const ua = request.headers.get("User-Agent") || "";
  return CRAWLER_UAS.some((regex) => regex.test(ua));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSP DIRECTIVES — Mirrors production src/server.ts strict CSP.
// ═══════════════════════════════════════════════════════════════════════════════
const CSP_BASE = `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com; style-src-attr 'unsafe-inline'; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://ssl.google-analytics.com https://www.google.com https://www.google.co.uk https://www.google.se https://www.gstatic.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://*.google.com https://*.google.se https://bat.bing.net https://bat.bing.com https://*.bing.com https://s.clarity.ms https://*.clarity.ms; media-src 'self' https: data:; connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebasestorage.googleapis.com https://*.firebaseapp.com https://*.googleapis.com https://*.supabase.co https://www.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://region1.analytics.google.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.merchant-center-analytics.goog https://service.prerender.io https://api.prerender.io https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net https://royal-mail-order.dantun9090.workers.dev https://www.googleadservices.com https://googleads.g.doubleclick.net https://apis.google.com https://bat.bing.net https://bat.bing.com https://*.bing.com https://*.taboola.com https://s.clarity.ms https://*.clarity.ms https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://o4511662760525824.ingest.de.sentry.io https://*.wallid.io https://*.wallid.com; frame-src 'self' blob: https://firebasestorage.googleapis.com https://*.firebaseapp.com https://www.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://www.recaptcha.net https://*.wallid.io https://*.wallid.com https://*.stripe.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; report-uri /api/public/csp-report; report-to csp-endpoint`;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function isProxyRoute(path) {
  return PROXY_ROUTES.some((r) => path.startsWith(r));
}

async function sha256b64(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  return "'sha256-" + hashBase64 + "'";
}

async function buildCspHeader(hashes) {
  const hashList = hashes.join(" ");
  const scriptSrc = "script-src " + hashList + " 'strict-dynamic' 'unsafe-eval'";
  const scriptSrcElem = "script-src-elem " + hashList + " 'strict-dynamic'";
  return CSP_BASE + "; " + scriptSrc + "; " + scriptSrcElem;
}

function stripHostingInjectedScriptsFromHtml(html) {
  return html
    .replace(/<script\b[^>]*\bsrc=["']https:\/\/plausible\.io\/js\/[^"']+["'][^>]*><\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=["']\/~flock\.js["'][^>]*><\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=["']\/__l5e\/events\.js["'][^>]*><\/script>/gi, "")
    .replace(
      "var blocked=/^/(?:admin|auth|login|account|cart|checkout|payment|register)(?:/|$)/i.test(location.pathname||'');",
      "var blocked=new RegExp('^/(?:admin|auth|login|account|cart|checkout|payment|register)(?:/|$)','i').test(location.pathname||'');",
    );
}

function simplifyStrictDynamicCsp(headers) {
  const csp = headers.get("Content-Security-Policy") || headers.get("content-security-policy") || "";
  if (!csp || !csp.includes("strict-dynamic")) return;
  const nonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
  if (!nonce) return;
  const scriptSrc = "script-src 'nonce-" + nonce + "' 'strict-dynamic' 'unsafe-eval'";
  const scriptSrcElem = "script-src-elem 'nonce-" + nonce + "' 'strict-dynamic'";
  const directives = csp
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.toLowerCase().startsWith("script-src ") && !part.toLowerCase().startsWith("script-src-elem "));
  directives.splice(1, 0, scriptSrc, scriptSrcElem);
  headers.set("Content-Security-Policy", directives.join("; "));
}

function normalizeAssetContentType(path, headers) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) headers.set("Content-Type", "text/css; charset=utf-8");
  else if (lower.endsWith(".js") || lower.endsWith(".mjs")) headers.set("Content-Type", "text/javascript; charset=utf-8");
  else if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) headers.set("Content-Type", "application/json; charset=utf-8");
  else if (lower.endsWith(".svg")) headers.set("Content-Type", "image/svg+xml; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
}

function isImmutableStaticAssetPath(path) {
  if (
    path.startsWith("/downloads/") ||
    path.startsWith("/api/") ||
    path.startsWith("/_api/") ||
    path.startsWith("/hooks/") ||
    path === "/robots.txt" ||
    /^\/sitemap[-a-z0-9]*\.xml$/i.test(path) ||
    !HASHED_STATIC_ASSET_RE.test(path)
  ) {
    return false;
  }
  return path.startsWith("/assets/") || path.startsWith("/_build/") || path.startsWith("/fonts/") || path.startsWith("/_fonts/");
}

function hasPositiveHtmlCacheAge(headers) {
  const combined = [
    headers.get("Cache-Control") || headers.get("cache-control") || "",
    headers.get("CDN-Cache-Control") || headers.get("cdn-cache-control") || "",
    headers.get("Cloudflare-CDN-Cache-Control") || headers.get("cloudflare-cdn-cache-control") || "",
    headers.get("Surrogate-Control") || headers.get("surrogate-control") || "",
  ].join(",").toLowerCase();
  return /(?:^|,)\s*(?:s-maxage|max-age)\s*=\s*[1-9]\d*/.test(combined) || /(?:^|,)\s*stale-while-revalidate(?:\s*=|\b)/.test(combined);
}

function applyBrowserHtmlNoCache(headers, path) {
  if (path && hasPositiveHtmlCacheAge(headers)) {
    console.log("[PHL Worker] Stripped cache headers on HTML for " + path);
  }
  headers.set("Cache-Control", HTML_NO_STORE_CACHE_CONTROL);
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  headers.set("Surrogate-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.delete("Age");
  headers.set("Vary", "Cookie, Authorization");
}

function withBrowserHtmlNoCache(response, path) {
  const headers = new Headers(response.headers);
  applyBrowserHtmlNoCache(headers, path);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function buildBrowserResponse(response, path) {
  const type = response.headers.get("Content-Type") || "";
  const headers = new Headers(response.headers);
  simplifyStrictDynamicCsp(headers);
  if (!type.includes("text/html")) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const body = stripHostingInjectedScriptsFromHtml(await response.text());
  headers.delete("Content-Length");
  headers.delete("content-length");
  headers.delete("Content-Encoding");
  headers.delete("content-encoding");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  // HTML shells must be uncacheable on both browser and CDN. The previous `/`
  // exception forced `s-maxage=14400` + SWR and caused stale homepage HTML to
  // hide fresh publishes; keep every human HTML route strict no-store.
  applyBrowserHtmlNoCache(headers, path);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function extractScriptHashes(html) {
  const hashes = [];
  const regex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const body = match[1].trim();
    if (body.length > 0) {
      hashes.push(await sha256b64(body));
    }
  }
  return hashes;
}

async function buildHashCspResponse(body, status, statusText) {
  const hashes = await extractScriptHashes(body);
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Security-Policy", await buildCspHeader(hashes));
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()");
  applyBrowserHtmlNoCache(headers);
  return new Response(body, { status, statusText, headers });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const startTime = Date.now();
    const isBot = isCrawler(request);

    // ── 0. Legacy /cache-reset URL — the in-page popup now clears caches
    //    inline via window.__phlHardReloadClean, so /cache-reset is only
    //    ever hit by returning users on stale HTML. Bounce them back to
    //    the requested `next=` target (default `/`) with a cache-bust
    //    marker so the follow-up request skips any lingering edge cache.
    if (path === "/cache-reset") {
      const rawNext = url.searchParams.get("next") || "/";
      const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
      const sep = safeNext.includes("?") ? "&" : "?";
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${safeNext}${sep}__cf=1`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Server-Timing": `cache-reset;dur=${Date.now() - startTime}`,
        },
      });
    }

    if (isProxyRoute(path)) {
      // Build assets are content-addressed and may legitimately disappear when
      // the hosting platform evicts an older deployment. Never let Cloudflare
      // store a 404 for /assets/*.js|css as immutable, otherwise stale HTML can
      // poison the edge with `Not Found` bodies that browsers keep executing.
      const assetRequest = path.startsWith("/assets/") || path.startsWith("/_build/") || path.startsWith("/fonts/") || path.startsWith("/_fonts/");
      const downloadRequest = path.startsWith("/downloads/");
      let response = await fetch(
        request,
        assetRequest
          ? { cf: { cacheTtlByStatus: { "200-299": CACHE_TTL.static, "404": 0, "410": 0, "500-599": 0 } } }
          : downloadRequest
            ? { cf: { cacheTtl: 0, cacheTtlByStatus: { "200-299": 0, "300-399": 0, "400-499": 0, "500-599": 0 } } }
            : undefined,
      );
      if (downloadRequest && response.status === 404) {
        const fallbackUrl = new URL(request.url);
        fallbackUrl.pathname = "/" + path.split("/").pop();
        fallbackUrl.search = url.search;
        response = await fetch(new Request(fallbackUrl.toString(), request), {
          cf: { cacheTtl: 0, cacheTtlByStatus: { "200-299": 0, "300-399": 0, "400-499": 0, "500-599": 0 } },
        });
      }
      const cloned = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      if (path.startsWith("/downloads/")) {
        cloned.headers.set("Cache-Control", DOWNLOAD_NO_STORE_CACHE_CONTROL);
        cloned.headers.set("CDN-Cache-Control", "no-store");
        cloned.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
        cloned.headers.set("Surrogate-Control", "no-store");
        cloned.headers.set("Pragma", "no-cache");
        cloned.headers.set("Expires", "0");
        cloned.headers.delete("Age");
        cloned.headers.delete("ETag");
        cloned.headers.delete("Last-Modified");
        normalizeAssetContentType(path, cloned.headers);
      } else if (path === "/robots.txt") {
        cloned.headers.set("Content-Type", "text/plain; charset=utf-8");
        cloned.headers.set("Cache-Control", "public, max-age=300, must-revalidate");
        cloned.headers.set("CDN-Cache-Control", "no-store");
        cloned.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
        cloned.headers.set("Surrogate-Control", "no-store");
        cloned.headers.delete("X-Robots-Tag");
        cloned.headers.delete("x-robots-tag");
        cloned.headers.delete("Age");
        cloned.headers.set("X-Content-Type-Options", "nosniff");
      } else if (assetRequest && cloned.status >= 400) {
        cloned.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        cloned.headers.set("CDN-Cache-Control", "no-store");
        cloned.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
        cloned.headers.set("X-Robots-Tag", "noindex, nofollow");
        cloned.headers.set("X-PHL-Via", "asset-miss-no-store");
        normalizeAssetContentType(path, cloned.headers);
      } else if (isImmutableStaticAssetPath(path)) {
        cloned.headers.set("Cache-Control", IMMUTABLE_BUILD_ASSET_CACHE_CONTROL);
        cloned.headers.delete("CDN-Cache-Control");
        cloned.headers.delete("Cloudflare-CDN-Cache-Control");
        cloned.headers.delete("Surrogate-Control");
        cloned.headers.delete("Pragma");
        cloned.headers.delete("Expires");
        cloned.headers.delete("Age");
        normalizeAssetContentType(path, cloned.headers);
      }
      return cloned;
    }

    // Non-GET/HEAD: pass through unchanged, no caching, no CSP rewrite
    if (request.method !== "GET" && request.method !== "HEAD") {
      return fetch(request);
    }

    // ── 2. BOT branch: Prerender.io -> hash-CSP -> cache separately ─────────
    if (isBot) {
      const cacheKey = new Request(url.toString() + "?__prerender=1", { method: "GET" });
      const cache = caches.default;
      let cached = await cache.match(cacheKey);
      let cacheStatus = "HIT";
      let prerenderFetchMs = 0;
      let hashComputeMs = 0;

      if (!cached) {
        cacheStatus = "MISS";
        const prerenderStart = Date.now();
        const prerenderUrl = PRERENDER_SERVICE + "/" + encodeURIComponent(url.toString());
        const prerenderRes = await fetch(prerenderUrl, {
          headers: {
            "X-Prerender-Token": env.PRERENDER_TOKEN || "",
            "User-Agent": request.headers.get("User-Agent") || "",
          },
        });
        prerenderFetchMs = Date.now() - prerenderStart;

        if (!prerenderRes.ok) {
          console.warn("[PHL-WARN] Prerender.io returned " + prerenderRes.status + " — falling back to origin");
          const originRes = await fetch(request);
          const body = stripHostingInjectedScriptsFromHtml(await originRes.text());
          const hashStart = Date.now();
          const response = await buildHashCspResponse(body, originRes.status, originRes.statusText);
          hashComputeMs = Date.now() - hashStart;
          const cacheHeaders = new Headers(response.headers);
          cacheHeaders.set("Cache-Control", "public, max-age=" + CACHE_TTL.prerender + ", s-maxage=" + CACHE_TTL.prerender);
          cacheHeaders.set("X-PHL-Via", "hash-csp;bot=1;prerender=FAIL;cache=" + cacheStatus + ";origin=" + prerenderFetchMs + "ms;hash=" + hashComputeMs + "ms;total=" + (Date.now() - startTime) + "ms");
          const timingFail = `cf-cache;desc="${cacheStatus}", origin;dur=${prerenderFetchMs}, csp-hash;dur=${hashComputeMs}, worker;dur=${Date.now() - startTime}`;
          cacheHeaders.set("Server-Timing", timingFail);
          ctx.waitUntil(cache.put(cacheKey, new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers: cacheHeaders })));
          response.headers.set("X-PHL-Via", cacheHeaders.get("X-PHL-Via"));
          response.headers.set("Server-Timing", timingFail);
          applyBrowserHtmlNoCache(response.headers, path);
          return response;
        }

        const body = stripHostingInjectedScriptsFromHtml(await prerenderRes.text());

        if (body.includes("__CSP_NONCE__")) {
          console.error("[PHL-CRIT] Prerendered HTML contains __CSP_NONCE__");
          return new Response("Prerender CSP nonce leak", { status: 500 });
        }

        const hashStart = Date.now();
        const response = await buildHashCspResponse(body, prerenderRes.status, prerenderRes.statusText);
        hashComputeMs = Date.now() - hashStart;
        const cacheHeaders = new Headers(response.headers);
        cacheHeaders.set("Cache-Control", "public, max-age=" + CACHE_TTL.prerender + ", s-maxage=" + CACHE_TTL.prerender);
        cacheHeaders.set("X-Prerendered", "true");
        cacheHeaders.set("X-PHL-Via", "hash-csp;bot=1;prerender=OK;cache=" + cacheStatus + ";origin=" + prerenderFetchMs + "ms;hash=" + hashComputeMs + "ms;total=" + (Date.now() - startTime) + "ms");
        const timing = `cf-cache;desc="${cacheStatus}", origin;dur=${prerenderFetchMs}, csp-hash;dur=${hashComputeMs}, worker;dur=${Date.now() - startTime}`;
        cacheHeaders.set("Server-Timing", timing);
        response.headers.set("X-Prerendered", "true");
        response.headers.set("X-PHL-Via", cacheHeaders.get("X-PHL-Via"));
        response.headers.set("Server-Timing", timing);
        applyBrowserHtmlNoCache(response.headers, path);
        ctx.waitUntil(cache.put(cacheKey, new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers: cacheHeaders })));
        return response;
      }

      const response = new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      });
      response.headers.set("X-PHL-Via", "hash-csp;bot=1;prerender=OK;cache=" + cacheStatus + ";origin=0ms;hash=0ms;total=" + (Date.now() - startTime) + "ms");
      response.headers.set("CF-Cache-Status", cacheStatus);
      response.headers.set("Server-Timing", `cf-cache;desc="${cacheStatus}", origin;dur=0, csp-hash;dur=0, worker;dur=${Date.now() - startTime}`);
      return withBrowserHtmlNoCache(response, path);
    }

    // ── 3. BROWSER branch: pass-through (origin serves SSR + nonce CSP) ─────
    // Note: origin at phlab.lovable.app 302-redirects back to phlabs.co.uk on
    // direct fetches, so we cannot cache/rewrite here without a loop. Browsers
    // keep using origin's per-request nonce CSP; hash-CSP applies to bots only.
    //
    // Worker-internal warm cache is disabled while publish freshness is the
    // priority; stale isolate memory must not mask a fresh deploy.
    const wKey = warmCacheKey(url);
    const wEligible = warmCacheEligible(path);
    if (wEligible) {
      const warm = warmCacheGet(wKey);
      if (warm) {
        console.log("[PHL Worker] htmlWarmCache hit for " + path);
        const headers = new Headers();
        headers.set("Content-Type", warm.contentType);
        headers.set("X-Content-Type-Options", "nosniff");
        applyBrowserHtmlNoCache(headers);
        const total = Date.now() - startTime;
        headers.set("X-PHL-Via", "warm-hit;bot=0;total=" + total + "ms");
        headers.set("Server-Timing", `warm-cache;desc="HIT", origin;dur=0, worker;dur=${total}`);
        return new Response(warm.body, { status: 200, headers });
      }
      console.log("[PHL Worker] htmlWarmCache miss for " + path);
    }

    const originStart = Date.now();
    // Bypass CF cache on every human HTML subrequest, including `/`. A cached
    // homepage shell can keep the SSR fallback on screen after a publish even
    // when this Worker stamps no-store on the outer response.
    const originRes = await fetch(request, { cf: { cacheTtl: 0, cacheEverything: false } });
    const originMs = Date.now() - originStart;
    const passRes = await buildBrowserResponse(originRes, path);
    const out = new Response(passRes.body, {
      status: passRes.status,
      statusText: passRes.statusText,
      headers: passRes.headers,
    });
    out.headers.set("X-PHL-Via", "passthrough;bot=0;warm=" + (wEligible ? "miss" : "skip") + ";origin=" + originMs + "ms;total=" + (Date.now() - startTime) + "ms");
    out.headers.set("Server-Timing", `warm-cache;desc="${wEligible ? "MISS" : "SKIP"}", origin;dur=${originMs}, worker;dur=${Date.now() - startTime}`);
    // Strip inherited cf-cache-status on human HTML shells: the subrequest is
    // forced no-cache and the outer response is no-store, so HIT/STALE here is
    // misleading and can mask a stale shell problem.
    out.headers.delete("cf-cache-status");
    // Mirror origin build id into cf-cache-build-id so the post-deploy health
    // check can confirm this Worker is on-path and its build tag reached the
    // browser through Cloudflare's cache layer.
    const bid = out.headers.get("x-build-id") || out.headers.get("x-phl-build-id") || "";
    if (bid && !out.headers.get("cf-cache-build-id")) {
      out.headers.set("cf-cache-build-id", bid);
    }
    // /downloads/* is user-editable content (PDFs, catalogue). The origin's
    // static asset binding serves these with default headers and no
    // cdn-cache-control, which fails the dynamic-asset contract in
    // e2e/cache-headers-regression.spec.ts. Force CDN no-store + short
    // browser cache so a re-uploaded PDF is picked up on next request.
    if (path.startsWith("/downloads/") && out.status === 200) {
      out.headers.set("Cache-Control", DOWNLOAD_NO_STORE_CACHE_CONTROL);
      out.headers.set("CDN-Cache-Control", "no-store");
      out.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
      out.headers.set("Surrogate-Control", "no-store");
      out.headers.set("Pragma", "no-cache");
      out.headers.set("Expires", "0");
      out.headers.delete("Age");
      out.headers.delete("ETag");
      out.headers.delete("Last-Modified");
    }

    // Populate the warm cache on successful HTML pass-through. We tee the
    // body: one stream to the browser, one buffered into isolate memory.
    const ctype = out.headers.get("Content-Type") || "";
    if (wEligible && out.status === 200 && ctype.includes("text/html") && out.body) {
      const [a, b] = out.body.tee();
      ctx.waitUntil((async () => {
        try {
          const buf = await new Response(b).arrayBuffer();
          warmCacheSet(wKey, buf, ctype);
        } catch (e) {
          console.warn("[PHL Worker] warm cache populate failed: " + (e && e.message));
        }
      })());
      return new Response(a, { status: out.status, statusText: out.statusText, headers: out.headers });
    }
    return out;
  },
};
