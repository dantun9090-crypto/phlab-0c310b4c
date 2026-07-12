// cloudflare/phlabs-prerender.mjs
// Hash-at-cache-miss, serve-raw-on-HIT. ALL HTML routes use this path.
// Bot/prerender branch: UA sniff -> Prerender.io -> hash-CSP -> cache separately.
// TTFB: ~50-80ms cache HIT (browser), ~75ms (prerender).

// ═══════════════════════════════════════════════════════════════════════════════
// ORIGIN & ROUTING
// ═══════════════════════════════════════════════════════════════════════════════
const ORIGIN = "https://phlabs-prod.web.app";
const PROXY_HOST = "phlabs.co.uk";
const PRERENDER_SERVICE = "https://service.prerender.io";

const PROXY_ROUTES = [
  "/_img",
  "/_fonts/",
  "/_api/",
  "/api/",
  "/assets/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

const CACHE_TTL = {
  html: 86400,      // 24h for browser HTML
  prerender: 60,    // 60s for prerendered HTML (keep bot cache fresh after deploys)
  static: 31536000, // 1 year for hashed immutable assets
};

const BROWSER_HTML_CACHE_CONTROL = "no-cache, no-store, must-revalidate";

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

function applyBrowserHtmlNoCache(headers) {
  headers.set("Cache-Control", BROWSER_HTML_CACHE_CONTROL);
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Vary", "Cookie, Authorization");
}

// Public HTML pages (/, /products, /compound/*, /research/*, /landing/*, ...) —
// origin marks them cacheable via `cdn-cache-control: public, ...`. We honour
// that at the edge with short s-maxage + long SWR so repeat visits get
// TTFB ~50-150ms (edge HIT) instead of ~1.8s (origin round-trip).
function applyBrowserHtmlPublicCache(headers) {
  headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=86400");
  headers.set("CDN-Cache-Control", "public, max-age=60, stale-while-revalidate=86400");
  headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=60, stale-while-revalidate=86400");
  headers.delete("Pragma");
  headers.delete("Expires");
  headers.delete("Surrogate-Control");
  const existingVary = headers.get("Vary") || "";
  if (!existingVary) {
    headers.set("Vary", "Accept-Encoding");
  } else if (!/\baccept-encoding\b/i.test(existingVary)) {
    headers.set("Vary", existingVary + ", Accept-Encoding");
  }
}

// Origin (src/server.ts) sets `cdn-cache-control: public, max-age=…` on public
// HTML routes and `no-store` on sensitive routes (auth/checkout/admin/api).
// Use that signal — no need to duplicate the route list in the Worker.
function originMarksHtmlCacheable(originHeaders) {
  const cdn = (originHeaders.get("CDN-Cache-Control") || originHeaders.get("cdn-cache-control") || "").toLowerCase();
  if (!cdn) return false;
  if (/\bno-store\b|\bno-cache\b|\bprivate\b/.test(cdn)) return false;
  return /\bpublic\b/.test(cdn) || /\bmax-age\s*=\s*[1-9]/.test(cdn);
}

function withBrowserHtmlNoCache(response) {
  const headers = new Headers(response.headers);
  applyBrowserHtmlNoCache(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function buildBrowserResponse(response) {
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
  // HTML shells MUST be uncacheable on both browser and CDN — a cached shell
  // survives a deploy and is served against evicted hashed chunks, producing
  // the "blank page after publish" regression. Contract enforced by
  // e2e/cache-headers-regression.spec.ts.
  applyBrowserHtmlNoCache(headers);
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

    // ── 1. Proxy routes pass through ────────────────────────────────────────
    if (isProxyRoute(path)) {
      // Build assets are content-addressed and may legitimately disappear when
      // the hosting platform evicts an older deployment. Never let Cloudflare
      // store a 404 for /assets/*.js|css as immutable, otherwise stale HTML can
      // poison the edge with `Not Found` bodies that browsers keep executing.
      const assetRequest = path.startsWith("/assets/") || path.startsWith("/_build/");
      const response = await fetch(request, assetRequest ? { cf: { cacheTtlByStatus: { "200-299": CACHE_TTL.static, "404": 0, "410": 0, "500-599": 0 } } } : undefined);
      const cloned = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      if (assetRequest && cloned.status >= 400) {
        cloned.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        cloned.headers.set("CDN-Cache-Control", "no-store");
        cloned.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
        cloned.headers.set("X-Robots-Tag", "noindex, nofollow");
        cloned.headers.set("X-PHL-Via", "asset-miss-no-store");
        normalizeAssetContentType(path, cloned.headers);
      } else if (path.startsWith("/assets/") || path.startsWith("/_img/") || path.startsWith("/_fonts/")) {
        cloned.headers.set("Cache-Control", "public, max-age=" + CACHE_TTL.static + ", immutable");
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
          ctx.waitUntil(cache.put(cacheKey, new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers: cacheHeaders })));
          response.headers.set("X-PHL-Via", cacheHeaders.get("X-PHL-Via"));
          applyBrowserHtmlNoCache(response.headers);
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
        response.headers.set("X-Prerendered", "true");
        response.headers.set("X-PHL-Via", cacheHeaders.get("X-PHL-Via"));
        applyBrowserHtmlNoCache(response.headers);
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
      return withBrowserHtmlNoCache(response);
    }

    // ── 3. BROWSER branch: pass-through (origin serves SSR + nonce CSP) ─────
    // Note: origin at phlab.lovable.app 302-redirects back to phlabs.co.uk on
    // direct fetches, so we cannot cache/rewrite here without a loop. Browsers
    // keep using origin's per-request nonce CSP; hash-CSP applies to bots only.
    const passRes = await buildBrowserResponse(await fetch(request));
    const out = new Response(passRes.body, {
      status: passRes.status,
      statusText: passRes.statusText,
      headers: passRes.headers,
    });
    out.headers.set("X-PHL-Via", "passthrough;bot=0;total=" + (Date.now() - startTime) + "ms");
    // Mirror origin build id into cf-cache-build-id so the post-deploy health
    // check can confirm this Worker is on-path and its build tag reached the
    // browser through Cloudflare's cache layer.
    const bid = out.headers.get("x-build-id") || out.headers.get("x-phl-build-id") || "";
    if (bid && !out.headers.get("cf-cache-build-id")) {
      out.headers.set("cf-cache-build-id", bid);
    }
    return out;
  },
};
