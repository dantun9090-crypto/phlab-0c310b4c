// cloudflare/phlabs-prerender.mjs
// Hash-at-cache-miss, serve-raw-on-HIT. ALL HTML routes use this path.
// No normal-proxy fallback. No nonce. No HTMLRewriter. No KV.
// TTFB: ~50-80ms on cache HIT for all traffic.

// ═══════════════════════════════════════════════════════════════════════════════
// ORIGIN & ROUTING
// ═══════════════════════════════════════════════════════════════════════════════
const ORIGIN = "https://phlabs-prod.web.app";
const PROXY_HOST = "phlabs.co.uk";

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
  html: 86400,      // 24h for HTML
  static: 2592000,  // 30 days for assets
};

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
  // Match inline <script> tags (no src attribute)
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER — ALL HTML routes use hash-CSP path
// ═══════════════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const startTime = Date.now();

    // ── 1. Proxy routes (images, fonts, API, assets) pass through ───────────
    if (isProxyRoute(path)) {
      const originUrl = new URL(path + url.search, ORIGIN);
      const response = await fetch(originUrl, {
        method: request.method,
        headers: request.headers,
      });

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

    // ── 2. ALL HTML routes: hash-CSP path (no normal-proxy fallback) ─────────
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cache = caches.default;

    let cached = await cache.match(cacheKey);
    let cacheStatus = "HIT";
    let originFetchMs = 0;
    let hashComputeMs = 0;

    if (!cached) {
      cacheStatus = "MISS";
      const originStart = Date.now();

      // Fetch raw HTML from origin
      const originUrl = new URL(path + url.search, ORIGIN);
      const originRes = await fetch(originUrl, {
        method: request.method,
        headers: {
          ...Object.fromEntries(request.headers),
          "X-Forwarded-Host": PROXY_HOST,
        },
      });

      originFetchMs = Date.now() - originStart;

      if (!originRes.ok && originRes.status !== 404) {
        return new Response("Origin error: " + originRes.status, { status: 502 });
      }

      const body = await originRes.text();

      // Safety: abort if origin still emits __CSP_NONCE__ (migration incomplete)
      if (body.includes("__CSP_NONCE__")) {
        console.error("[PHL-CRIT] Origin HTML still contains __CSP_NONCE__ — CSP migration incomplete");
        return new Response("CSP nonce migration incomplete — fix src/server.ts first", { status: 500 });
      }

      // Compute SHA-256 hashes from inline scripts in this HTML
      const hashStart = Date.now();
      const hashes = await extractScriptHashes(body);
      hashComputeMs = Date.now() - hashStart;

      // Build response headers with hash-based CSP
      const headers = new Headers();
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Content-Security-Policy", await buildCspHeader(hashes));
      headers.set("Cache-Control", "public, max-age=" + CACHE_TTL.html + ", s-maxage=" + CACHE_TTL.html + ", stale-while-revalidate=86400");
      headers.set("X-Frame-Options", "DENY");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()");

      cached = new Response(body, {
        status: originRes.status,
        statusText: originRes.statusText,
        headers,
      });

      // Store in Cloudflare cache (body + headers atomically)
      ctx.waitUntil(cache.put(cacheKey, cached.clone()));
    }

    // ── 3. Serve from cache (HIT or just-stored) ────────────────────────────
    const response = new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: cached.headers,
    });

    const totalMs = Date.now() - startTime;
    response.headers.set("X-PHL-Via", "hash-csp;cache=" + cacheStatus + ";origin=" + originFetchMs + "ms;hash=" + hashComputeMs + "ms;total=" + totalMs + "ms");
    response.headers.set("X-PHL-Cache", cacheStatus + ";ttl=" + CACHE_TTL.html);
    response.headers.set("CF-Cache-Status", cacheStatus);

    return response;
  },
};
