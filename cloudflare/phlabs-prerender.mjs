// cloudflare/phlabs-prerender.mjs
// Hash-at-cache-miss, serve-raw-on-HIT. ALL HTML routes use this path.
// Bot/prerender branch: UA sniff -> Prerender.io -> hash-CSP -> cache separately.
// TTFB: ~50-80ms cache HIT (browser), ~75ms (prerender).
//
// Deploy version: 2026-07-16.01 — browser prerender re-injects origin
// shell boot (entry <script>, modulepreloads, watchdog); CSP adds 'self'.

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
  html: 0,           // browser HTML is always fetched with cache bypass
  prerender: 60,     // 60s for prerendered HTML (keep bot cache fresh after deploys)
  static: 31536000,  // 1 year for hashed immutable assets — required by
                     // e2e/cache-headers-regression.spec.ts (max-age >= 31536000)
};

const HTML_NO_STORE_CACHE_CONTROL = "no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0";
const DOWNLOAD_NO_STORE_CACHE_CONTROL = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0";
const IMMUTABLE_BUILD_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const HASHED_STATIC_ASSET_RE = /(?:^|\/)[^/?#]+(?:[-._][a-f0-9]{8,}|-[A-Za-z0-9_-]{8,})\.(?:js|mjs|css|woff2?|ttf|otf)$/i;

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE HTML CACHE (caches.default)
// ─────────────────────────────────────────────────────────────────────────────
// Repeat visits to public HTML routes get served from Cloudflare's shared
// Cache API in ~50-150ms instead of 0.6-2.3s origin TTFB, WITHOUT changing
// the wire contract (browsers and CDN tier still see no-store; CSP nonce +
// strict-dynamic is replayed verbatim as a consistent pair).
//
// Freshness after deploy: the scoped post-deploy purge evicts "/" and
// "/products" explicitly; all other entries expire within HTML_EDGE_TTL_S
// anyway; the client-side build-killer script is the final safety net.
// ═══════════════════════════════════════════════════════════════════════════════
const HTML_EDGE_TTL_S = 300; // 5 min entry TTL for cached HTML shells
const WARM_SKIP_PREFIXES = [
  "/admin", "/auth", "/login", "/logout", "/account",
  "/cart", "/checkout", "/payment", "/register", "/api/", "/downloads/",
];

function warmCacheEligible(path) {
  if (!path) return false;
  for (const prefix of WARM_SKIP_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix)) return false;
  }
  return true;
}

function edgeHtmlCacheKey(url) {
  // Ignore query string — utm/gclid/fbclid must not fragment the cache.
  return new Request(url.origin + url.pathname, { method: "GET" });
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

// Browser prerender CSP: adds 'self' so the /assets entry <script src> is
// allowed (older browsers use 'self'; strict-dynamic covers its imports;
// inline hashes cover watchdog/build-killer). Inline hash tokens include
// their own single-quotes.
async function buildCspHeaderBrowserSelf(hashes) {
  const hashList = hashes.join(" ");
  const scriptSrc = "script-src 'self' " + hashList + " 'strict-dynamic' 'unsafe-eval'";
  const scriptSrcElem = "script-src-elem 'self' " + hashList + " 'strict-dynamic'";
  return CSP_BASE + "; " + scriptSrc + "; " + scriptSrcElem;
}

// Extract the executable boot payload from the LIVE origin shell so we can
// re-inject it into the prerender.io snapshot (which strips executable
// scripts, leaving only application/ld+json). Returns:
//   - entry: the <script type="module" src="/assets/index-<hash>.js"> tag
//   - preloads: <link rel="modulepreload"> for index + vendor-react ONLY
//   - inlineScripts: every inline (no-src) <script> block verbatim — that's
//     the watchdog + build-killer origin emits in the shell head/body.
function extractOriginShellBoot(originHtml) {
  const inlineScripts = [];
  const inlineRe = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi;
  let m;
  while ((m = inlineRe.exec(originHtml)) !== null) {
    // Skip application/ld+json and application/json (data blobs, not code).
    if (/type=["'](?:application\/ld\+json|application\/json|importmap)["']/i.test(m[0])) continue;
    inlineScripts.push(m[0]);
  }
  const entryMatch = originHtml.match(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/assets\/index-[^"']+["'][^>]*><\/script>/i,
  );
  const entry = entryMatch ? entryMatch[0] : "";
  const preloads = [];
  const preloadRe = /<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi;
  let pm;
  while ((pm = preloadRe.exec(originHtml)) !== null) {
    const tag = pm[0];
    if (/\bhref=["']\/assets\/(?:index|vendor-react)-[^"']+["']/i.test(tag)) {
      preloads.push(tag);
    }
  }
  return { entry, preloads, inlineScripts };
}

function injectOriginShellBoot(prerenderHtml, boot) {
  if (!boot) return prerenderHtml;
  const injection = boot.preloads.join("") + boot.inlineScripts.join("") + boot.entry;
  if (!injection) return prerenderHtml;
  if (/<\/head>/i.test(prerenderHtml)) {
    return prerenderHtml.replace(/<\/head>/i, injection + "</head>");
  }
  if (/<body\b[^>]*>/i.test(prerenderHtml)) {
    return prerenderHtml.replace(/<body\b[^>]*>/i, (m) => m + injection);
  }
  return prerenderHtml + injection;
}

function edgeHtmlCacheKeyWithBuild(url, buildId) {
  const bidPart = buildId ? "?__bid=" + encodeURIComponent(buildId) : "";
  return new Request(url.origin + url.pathname + bidPart, { method: "GET" });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT SANITY GUARD (post-incident 2026-07-17)
// A >=10KB size check alone cannot detect a wrong-content snapshot cached
// mid-deploy. Before ANY cache.put of prerender HTML require ALL:
//   1. body >= 10KB
//   2. <div id="root"> has non-trivial inner content (>= 200 chars markup)
//   3. body contains the SAME /assets/index-<hash>.js filename as the origin
//      shell fetched in the same request (build alignment)
//   4. body does NOT contain the watchdog-only marker "Taking longer than usual"
// Fail => serve origin passthrough, cache nothing.
// ─────────────────────────────────────────────────────────────────────────────
function extractIndexAssetPath(html) {
  if (!html) return "";
  const m = html.match(/\/assets\/index-[A-Za-z0-9_.-]+\.js/);
  return m ? m[0] : "";
}

function rootHasNonTrivialContent(html) {
  if (!html) return false;
  const openRe = /<div\b[^>]*\bid=["']root["'][^>]*>/i;
  const openMatch = html.match(openRe);
  if (!openMatch) return false;
  const startIdx = openMatch.index + openMatch[0].length;
  const slice = html.slice(startIdx, startIdx + 8192);
  const firstClose = slice.search(/<\/div>/i);
  const inner = firstClose >= 0 ? slice.slice(0, firstClose) : slice;
  if (inner.trim().length < 200) return false;
  if (!/<[a-zA-Z][^>]*>/.test(inner)) return false;
  return true;
}

function isSaneRenderedHtml(html, originEntryPath) {
  if (!html) return { ok: false, reason: "empty" };
  if (html.length < 10000) return { ok: false, reason: "too_small:" + html.length };
  if (!rootHasNonTrivialContent(html)) return { ok: false, reason: "empty_root" };
  if (html.includes("Taking longer than usual")) {
    return { ok: false, reason: "watchdog_marker" };
  }
  if (originEntryPath) {
    const bodyEntry = extractIndexAssetPath(html);
    if (!bodyEntry) return { ok: false, reason: "no_entry_script" };
    if (bodyEntry !== originEntryPath) {
      return { ok: false, reason: "entry_mismatch:" + bodyEntry + "!=" + originEntryPath };
    }
  }
  return { ok: true };
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

// Inject <link rel="preload" as="image" fetchpriority="high"> for the first
// <img src="/_img?..."> in the prerendered body so the browser can start
// downloading the LCP candidate before React hydrates. No-op when no such
// image is found, or when a matching preload link is already present.
function injectHeroImagePreload(html) {
  if (!html) return html;
  const imgMatch = html.match(/<img\b[^>]*\bsrc=(["'])(\/_img[^"']+)\1[^>]*>/i);
  if (!imgMatch) return html;
  const heroUrl = imgMatch[2];
  const heroUrlEsc = heroUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  if (html.includes('rel="preload"') && html.includes(heroUrl)) {
    // Already preloaded — leave head untouched.
    return html;
  }
  const preloadTag =
    '<link rel="preload" as="image" href="' +
    heroUrlEsc +
    '" fetchpriority="high">';
  const headMatch = html.match(/<head\b[^>]*>/i);
  if (!headMatch) return html;
  const insertAt = headMatch.index + headMatch[0].length;
  return html.slice(0, insertAt) + preloadTag + html.slice(insertAt);
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

// Browser variant: adds 'self' to script-src{,-elem} so the /assets entry
// module <script src> is executable; hashes cover the inline watchdog +
// build-killer; strict-dynamic covers dynamically imported chunks.
async function buildHashCspResponseBrowserSelf(body, status, statusText) {
  const hashes = await extractScriptHashes(body);
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Security-Policy", await buildCspHeaderBrowserSelf(hashes));
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
      // /_img is a content-addressed image proxy (u/w/f/q params fully
      // identify the output). CF's default behaviour on this route stamps
      // a __cf_bm Bot Management cookie → cf-cache-status: DYNAMIC, so
      // every cold page view re-fetches the same bytes from Firebase.
      // Force cacheEverything with a 24h TTL and strip Set-Cookie so the
      // response is safely shareable across users.
      if (path === "/_img" || path === "/_img/") {
        const imgRes = await fetch(request, {
          cf: { cacheTtl: 86400, cacheEverything: true },
        });
        const imgHeaders = new Headers(imgRes.headers);
        imgHeaders.delete("set-cookie");
        imgHeaders.delete("Set-Cookie");
        return new Response(imgRes.body, {
          status: imgRes.status,
          statusText: imgRes.statusText,
          headers: imgHeaders,
        });
      }
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

    // ── 1b. PRERENDER RENDERER passthrough — break the self-staling loop
    if (url.searchParams.has("__prt")) {
      const clean = new URL(request.url);
      clean.searchParams.delete("__prt");
      return fetch(new Request(clean.toString(), request), {
        cf: { cacheTtl: 0, cacheEverything: false },
      });
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
        const prerenderTarget = url.origin + url.pathname + (url.search ? url.search + "&" : "?") + "__prt=1";
        const prerenderUrl = PRERENDER_SERVICE + "/" + encodeURIComponent(prerenderTarget);
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

        const body = injectHeroImagePreload(stripHostingInjectedScriptsFromHtml(await prerenderRes.text()));

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

    // ── 2b. FEED branch: short edge cache for Google Merchant feeds ────────
    // These render live on origin (~3s) and Google fetches them on a schedule.
    // Serve from Cloudflare's colo cache with 15 min TTL + 1h SWR so botfetch
    // is cheap on HIT. Post-deploy scoped purge evicts these URLs explicitly.
    if (/^\/google-merchant-feed(-free)?\.xml$/.test(path)) {
      const feedStart = Date.now();
      const feedRes = await fetch(request, {
        cf: { cacheTtl: 900, cacheEverything: true },
      });
      const feedMs = Date.now() - feedStart;
      const headers = new Headers(feedRes.headers);
      // Do NOT force no-store: origin still emits no-store on the route, but
      // we override so the browser + CDN treat it as short-cacheable.
      headers.set("Cache-Control", "public, max-age=300, must-revalidate");
      headers.set("CDN-Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
      headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
      headers.delete("Surrogate-Control");
      headers.delete("Pragma");
      headers.delete("Expires");
      headers.set("X-PHL-Via", "feed-edge;origin=" + feedMs + "ms;total=" + (Date.now() - startTime) + "ms");
      return new Response(feedRes.body, {
        status: feedRes.status,
        statusText: feedRes.statusText,
        headers,
      });
    }

    // ── 3. BROWSER branch: Cache API-backed HTML edge cache ──────────────────
    // Post-incident (2026-07-17) rules:
    //   • HIT path must NEVER await origin first. Serve the cached bytes,
    //     then (via ctx.waitUntil) fetch origin build-id and evict if it
    //     differs from the build-id stored on the cached entry.
    //   • Origin fetch only runs on true MISS.
    //   • On MISS the prerendered body must pass isSaneRenderedHtml()
    //     (size, non-empty root, matching /assets/index-*.js, no watchdog
    //     marker) before ANY cache.put. Fail => origin passthrough, no cache.
    //   • x-phl-swr-refill header (future SWR PR) forces a MISS and prevents
    //     recursive refill loops.
    //
    // Non-eligible browser paths (admin, auth, cart, checkout, /api/…) fall
    // through to the origin+per-request-nonce pass-through path below.
    const cache = caches.default;
    let wEligible = warmCacheEligible(path);
    const swrRefill = request.headers.get("x-phl-swr-refill") === "1";
    if (wEligible && !swrRefill) {
      const cacheKey = edgeHtmlCacheKey(url);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const buf = await cached.arrayBuffer();
        if (buf.byteLength < 10000) {
          // Suspiciously small — evict, fall through to MISS path.
          ctx.waitUntil(cache.delete(cacheKey));
        } else {
          const headers = new Headers(cached.headers);
          applyBrowserHtmlNoCache(headers, path);
          headers.delete("cf-cache-status");
          const cachedBid =
            headers.get("x-phl-build-id") || headers.get("x-build-id") || "";
          const total = Date.now() - startTime;
          headers.set("X-PHL-Via", "edge-html-hit;bot=0;prerender=1;total=" + total + "ms");
          headers.set("Server-Timing", `edge-html;desc="HIT", origin;dur=0, worker;dur=${total}`);
          if (cachedBid) {
            headers.set("x-build-id", cachedBid);
            headers.set("cf-cache-build-id", cachedBid);
          }
          // Background build-id validation: never blocks the customer.
          ctx.waitUntil((async () => {
            try {
              const probe = await fetch(new Request(url.toString(), {
                method: "GET",
                headers: { "User-Agent": "phlabs-worker/build-id-check" },
              }), { cf: { cacheTtl: 0, cacheEverything: false } });
              if (!probe || !probe.ok) return;
              const liveBid =
                probe.headers.get("x-build-id") ||
                probe.headers.get("x-phl-build-id") || "";
              if (liveBid && cachedBid && liveBid !== cachedBid) {
                await cache.delete(cacheKey);
              }
            } catch { /* best-effort */ }
          })());
          return new Response(buf, {
            status: cached.status,
            statusText: cached.statusText,
            headers,
          });
        }
      }

      // MISS: fetch origin shell + prerender in parallel.
      const originStart = Date.now();
      const originShellPromise = fetch(new Request(url.toString(), {
        method: "GET",
        headers: {
          "User-Agent": request.headers.get("User-Agent") || "",
          "Accept": "text/html,application/xhtml+xml",
        },
      }), { cf: { cacheTtl: 0, cacheEverything: false } }).catch((e) => {
        console.warn("[PHL-WARN] origin shell fetch threw: " + (e && e.message));
        return null;
      });

      const prerenderStart = Date.now();
      const prerenderTarget = url.origin + url.pathname + (url.search ? url.search + "&" : "?") + "__prt=1";
      const prerenderUrl = PRERENDER_SERVICE + "/" + encodeURIComponent(prerenderTarget);
      const prerenderPromise = fetch(prerenderUrl, {
        headers: {
          "X-Prerender-Token": env.PRERENDER_TOKEN || "",
          "User-Agent": request.headers.get("User-Agent") || "",
        },
      }).catch((e) => {
        console.warn("[PHL-WARN] Prerender.io fetch threw: " + (e && e.message));
        return null;
      });

      const [originShellRes, prerenderRes] = await Promise.all([
        originShellPromise, prerenderPromise,
      ]);
      const originShellMs = Date.now() - originStart;
      const prerenderMs = Date.now() - prerenderStart;
      const buildId = (originShellRes && (
        originShellRes.headers.get("x-build-id") ||
        originShellRes.headers.get("x-phl-build-id")
      )) || "";

      // Extract origin boot payload + entry filename for the sanity guard.
      let boot = null;
      let originEntryPath = "";
      if (originShellRes && originShellRes.ok) {
        try {
          const originHtml = await originShellRes.clone().text();
          boot = extractOriginShellBoot(originHtml);
          originEntryPath = extractIndexAssetPath(originHtml);
        } catch (e) {
          console.warn("[PHL-WARN] origin shell parse threw: " + (e && e.message));
        }
      }

      if (prerenderRes && prerenderRes.ok && boot && boot.entry && originEntryPath) {
        const raw = await prerenderRes.text();
        const withBoot = injectOriginShellBoot(raw, boot);
        const body = injectHeroImagePreload(stripHostingInjectedScriptsFromHtml(withBoot));
        if (body.includes("__CSP_NONCE__")) {
          console.error("[PHL-CRIT] Prerendered HTML contains __CSP_NONCE__ — falling back to origin");
        } else {
          const hashStart = Date.now();
          const response = await buildHashCspResponseBrowserSelf(body, prerenderRes.status, prerenderRes.statusText);
          const hashMs = Date.now() - hashStart;
          const buf = await response.clone().arrayBuffer();

          // Sanity guard BEFORE any cache.put.
          const sanity = isSaneRenderedHtml(body, originEntryPath);
          if (!sanity.ok) {
            console.warn("[PHL-CRIT] Prerender sanity guard failed (" + sanity.reason + ") — serving origin passthrough, caching nothing");
          } else {
            const snapshotHeaders = new Headers();
            response.headers.forEach((value, name) => {
              const n = name.toLowerCase();
              if (n === "set-cookie" || n === "connection" || n === "keep-alive" ||
                  n === "transfer-encoding" || n === "cf-ray" || n === "cf-request-id" ||
                  n === "server-timing" || n === "x-phl-via" || n === "age" ||
                  n === "date" || n === "cache-control" || n === "cdn-cache-control" ||
                  n === "cloudflare-cdn-cache-control" || n === "surrogate-control" ||
                  n === "pragma" || n === "expires" || n === "content-length") return;
              snapshotHeaders.set(name, value);
            });
            snapshotHeaders.set("Cache-Control", "public, max-age=" + HTML_EDGE_TTL_S);
            if (buildId) {
              snapshotHeaders.set("x-build-id", buildId);
              snapshotHeaders.set("x-phl-build-id", buildId);
              snapshotHeaders.set("cf-cache-build-id", buildId);
            }
            ctx.waitUntil(cache.put(cacheKey, new Response(buf, {
              status: response.status,
              statusText: response.statusText,
              headers: snapshotHeaders,
            })).catch((e) => {
              console.warn("[PHL Worker] edge HTML cache populate failed: " + (e && e.message));
            }));

            const outHeaders = new Headers(response.headers);
            applyBrowserHtmlNoCache(outHeaders, path);
            if (buildId) {
              outHeaders.set("x-build-id", buildId);
              outHeaders.set("cf-cache-build-id", buildId);
            }
            const total = Date.now() - startTime;
            outHeaders.set(
              "X-PHL-Via",
              "edge-html-miss;bot=0;prerender=OK;origin=" + originShellMs +
                "ms;prerender=" + prerenderMs + "ms;hash=" + hashMs +
                "ms;total=" + total + "ms",
            );
            outHeaders.set(
              "Server-Timing",
              `edge-html;desc="MISS", origin;dur=${originShellMs}, prerender;dur=${prerenderMs}, csp-hash;dur=${hashMs}, worker;dur=${total}`,
            );
            return new Response(buf, {
              status: response.status,
              statusText: response.statusText,
              headers: outHeaders,
            });
          }
        }
      } else if (prerenderRes && !prerenderRes.ok) {
        console.warn("[PHL-WARN] Prerender.io returned " + prerenderRes.status + " for browser — falling back to origin");
      } else if (!boot || !boot.entry) {
        console.warn("[PHL-WARN] Origin shell missing entry <script> — falling back to origin passthrough");
      } else if (!originEntryPath) {
        console.warn("[PHL-WARN] Could not extract origin entry filename — falling back to origin passthrough");
      }
      // Fallback: serve the origin shell we already fetched, unchanged.
      // Never populate the prerender cache slot with a hydration-only shell.
      wEligible = false;
      if (originShellRes && originShellRes.ok) {
        const passRes = await buildBrowserResponse(originShellRes, path);
        const out = new Response(passRes.body, {
          status: passRes.status,
          statusText: passRes.statusText,
          headers: passRes.headers,
        });
        if (buildId) {
          out.headers.set("x-build-id", buildId);
          out.headers.set("cf-cache-build-id", buildId);
        }
        const total = Date.now() - startTime;
        out.headers.set("X-PHL-Via", "edge-html-miss;bot=0;fallback=origin;origin=" + originShellMs + "ms;total=" + total + "ms");
        out.headers.set("Server-Timing", `edge-html;desc="FALLBACK", origin;dur=${originShellMs}, worker;dur=${total}`);
        return out;
      }
    }





    const originStart = Date.now();
    // Bypass CF's cache on the origin subrequest — we manage HTML caching via
    // caches.default ourselves so a stray Cache Rule cannot replay a stale
    // shell pointing at deleted build chunks.
    const originRes = await fetch(request, { cf: { cacheTtl: 0, cacheEverything: false } });
    const originMs = Date.now() - originStart;
    const passRes = await buildBrowserResponse(originRes, path);
    const out = new Response(passRes.body, {
      status: passRes.status,
      statusText: passRes.statusText,
      headers: passRes.headers,
    });
    out.headers.set("X-PHL-Via", "edge-html-miss;bot=0;warm=" + (wEligible ? "miss" : "skip") + ";origin=" + originMs + "ms;total=" + (Date.now() - startTime) + "ms");
    out.headers.set("Server-Timing", `edge-html;desc="${wEligible ? "MISS" : "SKIP"}", origin;dur=${originMs}, worker;dur=${Date.now() - startTime}`);
    // Strip cf-cache-status on non-home HTML shells: we bypass CF cache on the
    // origin subrequest for these paths and force no-store, so any residual
    // cf-cache-status inherited from the subrequest is misleading and would
    // trip the html-shell regression contract.
    if (path !== "/") {
      out.headers.delete("cf-cache-status");
    }
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

    // Populate the edge HTML cache on successful HTML pass-through. Buffer
    // the body ONCE (origin sends chunked transfer-encoding, no
    // Content-Length header), then serve from the buffer AND cache from the
    // same buffer. Avoids any tee/waitUntil race that silently dropped
    // cache.put and made every request an edge-html-miss.
    // Skip if origin sent Set-Cookie (per-user response) — must never share.
    const ctype = out.headers.get("Content-Type") || "";
    const hasSetCookie = out.headers.has("set-cookie") || out.headers.has("Set-Cookie");
    if (wEligible && out.status === 200 && ctype.includes("text/html") && out.body && !hasSetCookie) {
      const buf = await out.clone().arrayBuffer();
      // STORE GUARD: measure ACTUAL body bytes (not Content-Length, which
      // is absent on chunked HTML). Real shells are 50KB+; <10KB is a
      // deploy-race artifact (0-byte origin, error page) that would replay
      // a blank homepage to every visitor until manual purge.
      // Defensive sanity: this path only runs when the prerender branch was
      // bypassed. Reject watchdog-only shells and 0-asset bodies before cache.
      const bodyText = new TextDecoder().decode(buf);
      const hasEntry = !!extractIndexAssetPath(bodyText);
      const hasWatchdog = bodyText.includes("Taking longer than usual");
      if (buf.byteLength >= 10000 && hasEntry && !hasWatchdog) {
        // Snapshot response headers so cache hits replay the exact CSP
        // (with its original per-request nonce), build id, and
        // content-type. Filter hop-by-hop / connection headers that
        // mustn't be replayed. CRITICAL: Cache API refuses no-store
        // responses — override to a private public,max-age header that
        // only the Cache API sees (the wire keeps no-store via
        // applyBrowserHtmlNoCache on every hit + miss).
        const snapshotHeaders = new Headers();
        out.headers.forEach((value, name) => {
          const n = name.toLowerCase();
          if (n === "set-cookie" || n === "connection" || n === "keep-alive" ||
              n === "transfer-encoding" || n === "cf-ray" || n === "cf-request-id" ||
              n === "server-timing" || n === "x-phl-via" || n === "age" ||
              n === "date" || n === "cache-control" || n === "cdn-cache-control" ||
              n === "cloudflare-cdn-cache-control" || n === "surrogate-control" ||
              n === "pragma" || n === "expires" || n === "content-length") return;
          snapshotHeaders.set(name, value);
        });
        snapshotHeaders.set("Cache-Control", "public, max-age=" + HTML_EDGE_TTL_S);
        const cacheKey = edgeHtmlCacheKey(url);
        const snapshot = new Response(buf, {
          status: out.status,
          statusText: out.statusText,
          headers: snapshotHeaders,
        });
        ctx.waitUntil(cache.put(cacheKey, snapshot).catch((e) => {
          console.warn("[PHL Worker] edge HTML cache populate failed: " + (e && e.message));
        }));
      }
      return new Response(buf, { status: out.status, statusText: out.statusText, headers: out.headers });
    }
    return out;
  },
};
