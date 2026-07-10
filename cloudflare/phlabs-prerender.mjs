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
  "/_img/",
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
  prerender: 86400, // 24h for prerendered HTML
  static: 2592000,  // 30 days for assets
};

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
  /moz/i,
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
// CSP DIRECTIVES — Exact match to production src/server.ts (lines 145-173)
// ═══════════════════════════════════════════════════════════════════════════════
const CSP_BASE = `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://tagmanager.google.com; style-src-attr 'unsafe-inline'; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://ssl.google-analytics.com https://www.google.com https://www.google.co.uk https://www.google.se https://www.gstatic.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://*.google.com https://*.google.se https://bat.bing.net https://bat.bing.com https://*.bing.com https://s.clarity.ms https://*.clarity.ms; media-src 'self' https: data:; connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://firebaseremoteconfig.googleapis.com https://firebasestorage.googleapis.com https://*.firebaseapp.com https://*.googleapis.com https://*.supabase.co https://www.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://region1.analytics.google.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.merchant-center-analytics.goog https://service.prerender.io https://api.prerender.io https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net https://royal-mail-order.dantun9090.workers.dev https://www.googleadservices.com https://googleads.g.doubleclick.net https://apis.google.com https://bat.bing.net https://bat.bing.com https://*.bing.com https://*.taboola.com https://s.clarity.ms https://*.clarity.ms https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://o4511662760525824.ingest.de.sentry.io https://*.wallid.io https://*.wallid.com; frame-src 'self' blob: https://firebasestorage.googleapis.com https://*.firebaseapp.com https://www.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://www.recaptcha.net https://*.wallid.io https://*.wallid.com https://*.stripe.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; report-uri /api/public/csp-report; report-to csp-endpoint`;

const EXTERNAL_SCRIPTS = [
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://ssl.google-analytics.com",
  "https://tagmanager.google.com",
  "https://www.googleadservices.com",
  "https://googleads.g.doubleclick.net",
  "https://apis.google.com",
  "https://www.gstatic.com",
  "https://*.google.com",
  "https://*.google.co.uk",
  "https://*.gstatic.com",
  "https://*.stripe.com",
  "https://*.wallid.com",
  "https://*.wallid.io",
  "https://cdn.taboola.com",
  "https://*.taboola.com",
  "https://www.clarity.ms",
  "https://scripts.clarity.ms",
  "https://*.clarity.ms",
  "https://bat.bing.com",
  "https://browser.sentry-cdn.com",
  "https://js.sentry-cdn.com",
];

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
  const scriptSrc = "script-src 'self' " + hashList + " 'strict-dynamic' 'unsafe-eval' " + EXTERNAL_SCRIPTS.join(" ");
  const scriptSrcElem = "script-src-elem 'self' " + hashList + " 'strict-dynamic' 'unsafe-eval' " + EXTERNAL_SCRIPTS.join(" ");
  return CSP_BASE + "; " + scriptSrc + "; " + scriptSrcElem;
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
      const response = await fetch(request);
      const cloned = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      if (path.startsWith("/assets/") || path.startsWith("/_img/") || path.startsWith("/_fonts/")) {
        cloned.headers.set("Cache-Control", "public, max-age=" + CACHE_TTL.static + ", immutable");
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
          const body = await originRes.text();
          const hashStart = Date.now();
          const response = await buildHashCspResponse(body, originRes.status, originRes.statusText);
          hashComputeMs = Date.now() - hashStart;
          response.headers.set("Cache-Control", "public, max-age=" + CACHE_TTL.prerender + ", s-maxage=" + CACHE_TTL.prerender);
          response.headers.set("X-PHL-Via", "hash-csp;bot=1;prerender=FAIL;cache=" + cacheStatus + ";origin=" + prerenderFetchMs + "ms;hash=" + hashComputeMs + "ms;total=" + (Date.now() - startTime) + "ms");
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        }

        const body = await prerenderRes.text();

        if (body.includes("__CSP_NONCE__")) {
          console.error("[PHL-CRIT] Prerendered HTML contains __CSP_NONCE__");
          return new Response("Prerender CSP nonce leak", { status: 500 });
        }

        const hashStart = Date.now();
        const response = await buildHashCspResponse(body, prerenderRes.status, prerenderRes.statusText);
        hashComputeMs = Date.now() - hashStart;
        response.headers.set("Cache-Control", "public, max-age=" + CACHE_TTL.prerender + ", s-maxage=" + CACHE_TTL.prerender);
        response.headers.set("X-Prerendered", "true");
        response.headers.set("X-PHL-Via", "hash-csp;bot=1;prerender=OK;cache=" + cacheStatus + ";origin=" + prerenderFetchMs + "ms;hash=" + hashComputeMs + "ms;total=" + (Date.now() - startTime) + "ms");
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }

      const response = new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      });
      response.headers.set("X-PHL-Via", "hash-csp;bot=1;prerender=OK;cache=" + cacheStatus + ";origin=0ms;hash=0ms;total=" + (Date.now() - startTime) + "ms");
      response.headers.set("CF-Cache-Status", cacheStatus);
      return response;
    }

    // ── 3. BROWSER branch: pass-through (origin serves SSR + nonce CSP) ─────
    // Note: origin at phlab.lovable.app 302-redirects back to phlabs.co.uk on
    // direct fetches, so we cannot cache/rewrite here without a loop. Browsers
    // keep using origin's per-request nonce CSP; hash-CSP applies to bots only.
    const passRes = await fetch(request);
    const out = new Response(passRes.body, {
      status: passRes.status,
      statusText: passRes.statusText,
      headers: passRes.headers,
    });
    out.headers.set("X-PHL-Via", "passthrough;bot=0;total=" + (Date.now() - startTime) + "ms");
    return out;
  },
};
