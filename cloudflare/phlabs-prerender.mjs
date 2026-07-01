var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// phlabs-prerender-patched.mjs
var CANONICAL_HOST = "phlabs.co.uk";
var REDIRECT_HOSTS = /* @__PURE__ */ new Set([
  "www.phlabs.co.uk",
  // Legacy brand hosts (replaced by https://phlabs.co.uk):
  ["pro", "health", "peptides.co.uk"].join("-").replace(/-/g, ""),
  "www." + ["pro", "health", "peptides.co.uk"].join("-").replace(/-/g, "")
]);
var WEBHOOK_PREFIXES = [
  "/api/truelayer/",
  "/api/fena/",
  "/api/public/hooks/",
  "/webhook/"
];
var FIREBASE_AUTH_PREFIXES = ["/__/auth/", "/__/firebase/"];
var XML_FEED_PATHS = /* @__PURE__ */ new Set(["/sitemap.xml", "/google-merchant-feed.xml"]);
var EMERGENCY_PRERENDER_FALLBACK_EXACT = /* @__PURE__ */ new Set([
  "/", "/products", "/research", "/compound", "/contact", "/about",
  "/resources", "/quality-control", "/lab-reports", "/shipping-policy",
  "/refund-policy", "/terms-and-conditions", "/privacy-policy", "/cookies"
]);
var EMERGENCY_PRERENDER_FALLBACK_PREFIXES = [
  "/products/", "/research/", "/resources/", "/landing/", "/compare/"
];
var APP_SHELL_FALLBACK_EXACT = /* @__PURE__ */ new Set([
  "/cart", "/checkout", "/payment", "/register", "/login", "/account", "/vip", "/admin"
]);
var EMERGENCY_SITEMAP_PATHS = [
  "/", "/products", "/quality-control", "/resources", "/about", "/contact",
  "/shipping-policy", "/refund-policy", "/terms-and-conditions", "/privacy-policy", "/cookies",
  "/research", "/research/retatrutide-uk", "/research/bpc-157-uk", "/compound",
  "/peptide-calculator", "/landing/phlabs", "/lab-reports", "/storage-guide",
  "/products/category/neurological", "/products/category/tissue-repair", "/products/category/bpc-157",
  "/products/category/retatrutide", "/products/category/tirzepatide", "/products/category/tb-500",
  "/products/category/ghk-cu", "/products/category/bacteriostatic-water"
];
function emergencySitemapResponse() {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const urls = EMERGENCY_SITEMAP_PATHS.map((path) => `  <url>\n    <loc>https://${CANONICAL_HOST}${path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${path === "/" || path === "/products" ? "weekly" : "monthly"}</changefreq>\n  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "cdn-cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "cloudflare-cdn-cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-phl-via": "emergency-sitemap-fallback"
    }
  });
}
__name(emergencySitemapResponse, "emergencySitemapResponse");
function isEmergencyPrerenderFallbackPath(pathname) {
  if (EMERGENCY_PRERENDER_FALLBACK_EXACT.has(pathname)) return true;
  return EMERGENCY_PRERENDER_FALLBACK_PREFIXES.some((p) => pathname.startsWith(p));
}
__name(isEmergencyPrerenderFallbackPath, "isEmergencyPrerenderFallbackPath");
function appShellFallbackHtml(pathname) {
  const safePath = pathname.replace(/[<>&"']/g, "");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PH Labs UK is reconnecting</title><style>html,body{margin:0;min-height:100%;background:#060f1e;color:#f8fafc;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}body{display:grid;place-items:center;padding:24px}.card{max-width:520px;background:#0f172a;border:1px solid #243145;border-radius:16px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35)}h1{font-size:24px;line-height:1.2;margin:0 0 12px}p{margin:0 0 14px;color:#cbd5e1}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}a,button{appearance:none;border:0;border-radius:10px;padding:13px 16px;font-weight:800;font-size:16px;text-decoration:none;cursor:pointer}.primary{background:#10b981;color:#03140d}.secondary{background:#1e293b;color:#e2e8f0}.small{font-size:13px;color:#94a3b8;margin-top:18px}</style></head><body><main class="card"><h1>PH Labs is reconnecting</h1><p>This secure page is temporarily unavailable while our live app server reconnects.</p><p>Public product and research pages are online. Checkout, login and admin require the origin app to be republished.</p><div class="actions"><button class="primary" onclick="location.reload()">Try again</button><a class="secondary" href="/products">Open products</a><a class="secondary" href="mailto:info@phlabs.co.uk">Contact us</a></div><p class="small">Route: ${safePath} · Edge recovery active</p></main></body></html>`;
}
__name(appShellFallbackHtml, "appShellFallbackHtml");
function appShellFallbackResponse(url) {
  const h = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
    "cdn-cache-control": "no-store",
    "cloudflare-cdn-cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
    "x-phl-via": "emergency-app-shell-fallback"
  });
  return applySecurityHeaders(new Response(appShellFallbackHtml(url.pathname), { status: 200, headers: h }), url);
}
__name(appShellFallbackResponse, "appShellFallbackResponse");
function isBuildAssetPath(pathname) {
  return /^\/(assets|_build)\/[^?#]+\.(js|mjs|css)$/i.test(pathname);
}
__name(isBuildAssetPath, "isBuildAssetPath");
function missingBuildAssetRecoveryResponse(pathname) {
  if (!isBuildAssetPath(pathname)) return null;
  const isScript = /\.(js|mjs)$/i.test(pathname);
  const h = new Headers({
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
    "cdn-cache-control": "no-store",
    "cloudflare-cdn-cache-control": "no-store",
    "surrogate-control": "no-store",
    "pragma": "no-cache",
    "expires": "0",
    "x-robots-tag": "noindex, nofollow",
    "vary": "*",
    "x-phl-via": "missing-build-asset-recovery"
  });
  if (!isScript) {
    h.set("content-type", "text/css; charset=utf-8");
    return new Response("/* stale PH Labs build stylesheet — safe empty fallback */\n", { status: 200, headers: h });
  }
  h.set("content-type", "text/javascript; charset=utf-8");
  return new Response(`(() => {
  try {
    console.warn('[PHL] Missing stale build asset. Auto-recovering once.');
    const FLAG = '__phl_missing_asset_auto_recovered_at';
    const clearKeys = ['__phl_reload_window','__phl_hard_reload_in_flight','__phl_route_auto_recovery_done','__phl_reloaded_at','__phl_stale_asset_reload_at','phl_reload_count','__phl_stale_asset_reload_count','__phl_hydration_error_seen'];
    const cleanup = async () => {
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
          await Promise.all(regs.map((reg) => reg.unregister()))
        }
      } catch {}
    };
    const go = async () => {
      await cleanup();
      const url = new URL(location.href);
      url.searchParams.set('sw', 'off');
      url.searchParams.set('_r', String(Date.now()));
      location.replace(url.toString());
    };
    const now = Date.now();
    const last = Number(sessionStorage.getItem(FLAG) || '0');
    if (!last || now - last > 30000) {
      sessionStorage.setItem(FLAG, String(now));
      setTimeout(() => { void go(); }, 50);
      return;
    }
    const render = () => {
      document.documentElement.setAttribute('lang', 'en-GB');
      document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060f1e;color:#f0f6ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px"><div style="max-width:460px;text-align:center"><h1 style="font-size:22px;margin:0 0 10px;font-weight:800">PH Labs is refreshing</h1><p style="margin:0 0 22px;color:#9fb0c8;font-size:15px;line-height:1.55">The site is loading the newest version. If this message stays here, tap once to reopen.</p><button id="phl-stale-reset" style="appearance:none;border:0;border-radius:8px;background:#10b981;color:#03140d;font-weight:800;padding:14px 18px;cursor:pointer;font-size:16px">Open PH Labs</button></div></div>';
      document.getElementById('phl-stale-reset')?.addEventListener('click', () => { void go(); });
    };
    if (document.body) render(); else addEventListener('DOMContentLoaded', render, { once: true });
  } catch (error) {
    console.error('[PHL] stale asset recovery failed', error);
  }
})();
`, { status: 200, headers: h });
}
__name(missingBuildAssetRecoveryResponse, "missingBuildAssetRecoveryResponse");
var BOT_UA_RX = new RegExp(
  [
    "googlebot",
    "google-inspectiontool",
    "adsbot-google",
    "google-merchant",
    "storebot-google",
    "googleother",
    "bingbot",
    "bingpreview",
    "msnbot",
    "slurp",
    "duckduckbot",
    "baiduspider",
    "yandexbot",
    "yandeximages",
    "facebookexternalhit",
    "meta-externalagent",
    "twitterbot",
    "linkedinbot",
    "pinterestbot",
    "whatsapp",
    "telegrambot",
    "discordbot",
    "slackbot",
    "prerender",
    "lighthouse",
    "headlesschrome",
    // generic catch-alls — last so specific matches log usefully
    "\\bbot\\b",
    "crawler",
    "spider",
    "\\bpreview\\b"
  ].join("|"),
  "i"
);
var HOSTILE_BOT_UA_RX = new RegExp(
  [
    // OpenAI
    "gptbot",
    "chatgpt-user",
    "oai-searchbot",
    // Anthropic
    "claudebot",
    "claude-web",
    "anthropic-ai",
    // Google AI training (separate from Googlebot search)
    "google-extended",
    // Perplexity
    "perplexitybot",
    "perplexity-user",
    // Common Crawl (feeds most LLM training sets)
    "ccbot",
    // ByteDance / TikTok
    "bytespider",
    // Amazon AI
    "amazonbot",
    // Apple AI training (separate from Applebot search)
    "applebot-extended",
    // Meta AI
    "meta-externalagent",
    "facebookbot",
    // Scrapers / data resellers
    "diffbot",
    "omgilibot",
    "omgili",
    "timpibot",
    "imagesiftbot",
    "cohere-ai",
    "cohere-training-data-crawler",
    "ai2bot",
    "ai2bot-dolma",
    "mistralai-user",
    "youbot",
    "petalbot"
    // NOTE: SEO crawlers (SemrushBot, AhrefsBot, MJ12bot, DotBot, BLEXBot,
    // DataForSeoBot, SerpstatBot, LinguaBot, SeznamBot) are intentionally
    // NOT blocked — they power Semrush/Ahrefs/Lovable SEO dashboards that
    // we rely on. Blocking them = empty SEO data for this project.
  ].join("|"),
  "i"
);
var STATIC_EXT_RX = /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|xml|txt|json|wasm|zip|webmanifest)(\?|$)/i;
var PRERENDER_BYPASS_PREFIXES = [
  "/_serverFn/",
  "/_server/",
  "/api/",
  "/.well-known/",
  "/cdn-cgi/",
  "/_img",
  // Firebase Auth helper iframe + reserved Firebase Hosting paths.
  // These are RPC/iframe endpoints (gapi-loaded), not crawlable HTML.
  // Headless Chrome times out trying to render them → 504 in Prerender.io.
  "/__/"
];
var PRERENDER_BYPASS_EXACT = /* @__PURE__ */ new Set([
  "/site.webmanifest",
  "/manifest.webmanifest",
  "/manifest.json",
  "/apple-app-site-association",
  "/sw.js",
  "/service-worker.js"
]);
var HOP_BY_HOP = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host"
]);
var STRIP_RESPONSE_HEADERS = ["x-powered-by", "server", "x-deployment-id", "x-render-origin-server"];
var SECURITY_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  // X-Frame-Options + X-XSS-Protection removed (deprecated). Framing is
  // controlled by CSP `frame-ancestors 'none'` set by the origin (src/server.ts).
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()"
};
var PRERENDER_ORIGIN = "https://service.prerender.io";
var PRERENDER_TIMEOUT_MS = 45e3;
var PRERENDER_CACHE_TTL = 3600;
var PRERENDER_SWR_TTL = 86400;
var LOOP_HEADER = "x-prerender-loop";
var PRERENDER_RENDERER_RX = /Prerender \(\+https:\/\/github\.com\/prerender\/prerender\)/i;
var NONCE_PLACEHOLDER = "__CSP_NONCE__";
var NONCE_PLACEHOLDER_RX = /__CSP_NONCE__/g;
function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "");
}
__name(generateNonce, "generateNonce");
function rewriteCspNonce(response) {
  // Nonce removed from origin CSP/HTML. Pass-through; kept as a no-op so
  // callers don't need to change. Safe even if a stale origin still emits
  // `__CSP_NONCE__` — those requests will fail CSP rather than leak a placeholder.
  return response;
}

__name(rewriteCspNonce, "rewriteCspNonce");
function isFirebaseAuthHelperPath(url) {
  return FIREBASE_AUTH_PREFIXES.some((p) => url.pathname.startsWith(p));
}
__name(isFirebaseAuthHelperPath, "isFirebaseAuthHelperPath");
function applySecurityHeaders(res, url) {
  const h = new Headers(res.headers);
  for (const k of STRIP_RESPONSE_HEADERS) h.delete(k);
  h.delete("x-frame-options");
  h.delete("x-xss-protection");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!h.has(k)) h.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
__name(applySecurityHeaders, "applySecurityHeaders");
async function repairInlineBootScripts(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const html = await response.text();
  let fixed = html;
  fixed = fixed.replace(
    "var isLegacy=function(registration){ return //service-worker.js(?:$|[?#])/i.test(scriptUrl(registration)); };",
    "var isLegacy=function(registration){ return new RegExp('\\\\/service-worker\\\\.js(?:$|[?#])','i').test(scriptUrl(registration)); };"
  );
  fixed = fixed.replace(
    "var isAppWorker=function(registration){ return //(?:sw|service-worker).js(?:$|[?#])/i.test(scriptUrl(registration)); };",
    "var isAppWorker=function(registration){ return new RegExp('\\\\/(?:sw|service-worker)\\\\.js(?:$|[?#])','i').test(scriptUrl(registration)); };"
  );
  // ---- Build-id ↔ asset-hash correlation headers ----------------------
  // Extract the meta build-id and the first /assets/*.js filename so
  // cache-HIT responses can be correlated against the deployed asset
  // manifest. Mismatch after purge = stale HTML pointing at gone bundle.
  const buildIdMatch = fixed.match(/<meta[^>]+name=["']build-id["'][^>]+content=["']([^"']+)["']/i);
  const entryMatch = fixed.match(/<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["']/i);
  const bootBad = /return\s+\/\/service-worker/.test(fixed) || /return\s+\/\/\(\?:sw\|service-worker\)/.test(fixed);
  const h = new Headers(response.headers);
  if (buildIdMatch) h.set("x-phl-build-id", buildIdMatch[1].slice(0, 64));
  if (entryMatch) {
    const asset = (entryMatch[1].split("/").pop() || "").slice(0, 80);
    const hash = (asset.match(/-([A-Za-z0-9_]{6,})\.js$/) || [, ""])[1] || "";
    if (hash) h.set("x-phl-asset-hash", hash.slice(0, 32));
    if (asset) h.set("x-phl-entry", asset);
  }
  if (bootBad) h.set("x-phl-boot-bad", "1");
  if (fixed === html && !buildIdMatch && !entryMatch && !bootBad) return response;
  h.delete("content-length");
  if (fixed !== html) h.set("x-phl-html-hotfix", "inline-sw-regex");
  return new Response(fixed, { status: response.status, statusText: response.statusText, headers: h });
}
__name(repairInlineBootScripts, "repairInlineBootScripts");
function noCache(headers) {
  headers.set("cache-control", "no-cache, no-store, must-revalidate");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
}
__name(noCache, "noCache");
function jsonResponse(body, status = 200) {
  const h = new Headers({ "content-type": "application/json; charset=utf-8" });
  noCache(h);
  return applySecurityHeaders(new Response(JSON.stringify(body), { status, headers: h }));
}
__name(jsonResponse, "jsonResponse");
function brandedErrorHtml() {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Temporary Error | PH Labs UK</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><style>html,body{margin:0;padding:0;background:#020617;color:#f1f5f9;font:16px/1.6 -apple-system,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:1.5rem}main{max-width:32rem;background:#0f172a;border:1px solid #1e293b;border-radius:.75rem;padding:2.5rem 2rem;text-align:center}h1{margin:0 0 .75rem;font-size:1.5rem;color:#fff}p{margin:0 0 1rem;color:#cbd5e1}a{color:#10b981}</style></head><body><main><h1>Temporary Error</h1><p>Our laboratory systems are updating. Please retry in 30 seconds.</p><p>Contact: <a href="mailto:info@phlabs.co.uk">info@phlabs.co.uk</a></p></main></body></html>`;
}
__name(brandedErrorHtml, "brandedErrorHtml");
function brandedErrorResponse(status = 503, retryAfter = 30) {
  const h = new Headers({ "content-type": "text/html; charset=utf-8" });
  noCache(h);
  if (retryAfter) h.set("retry-after", String(retryAfter));
  return applySecurityHeaders(new Response(brandedErrorHtml(), { status, headers: h }));
}
__name(brandedErrorResponse, "brandedErrorResponse");
function fwdHeaders(req) {
  const out = new Headers();
  for (const [k, v] of req.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v);
  }
  return out;
}
__name(fwdHeaders, "fwdHeaders");
function isServiceWorkerPath(url) {
  return url.pathname === "/sw.js" || url.pathname === "/service-worker.js";
}
__name(isServiceWorkerPath, "isServiceWorkerPath");
function applyNoStoreHeaders(response) {
  const h = new Headers(response.headers);
  h.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0");
  h.set("cdn-cache-control", "no-store");
  h.set("cloudflare-cdn-cache-control", "no-store");
  h.set("surrogate-control", "no-store");
  h.set("pragma", "no-cache");
  h.set("expires", "0");
  h.delete("etag");
  h.delete("last-modified");
  h.delete("age");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}
__name(applyNoStoreHeaders, "applyNoStoreHeaders");
// Explicit blocklist — these paths must NEVER hit caches.default. Personalised /
// auth / checkout / admin / RPC surfaces.
var HTML_CACHE_BLOCK_PREFIXES = [
  "/admin", "/account", "/cart", "/checkout", "/payment", "/login",
  "/register", "/api", "/search", "/vip-store", "/webhook", "/auth",
  "/vip", "/__/auth", "/__/firebase", "/_serverFn", "/_server"
];
// Explicit allowlist — exact paths or prefixes safe for anonymous edge cache.
var HTML_CACHE_ALLOW_EXACT = new Set([
  "/", "/products", "/compound", "/sitemap.xml", "/robots.txt"
]);
var HTML_CACHE_ALLOW_PREFIXES = [
  "/products/", "/compound/", "/landing/", "/research/", "/blog/", "/resources/"
];
// Cookie names that indicate an authenticated/session-bearing request.
var AUTH_COOKIE_RX = /(?:^|;\s*)(?:__session|php_auth|firebaseToken|sb-[a-z0-9-]+-auth-token|connect\.sid)=/i;
function evaluateHtmlCacheable(request, url, htmlTtl) {
  if (htmlTtl <= 0) return { ok: false, reason: "ttl-0" };
  if (request.method !== "GET") return { ok: false, reason: "method" };
  if (isServiceWorkerPath(url)) return { ok: false, reason: "sw" };
  // Blocklist first (cheapest, highest precedence after method).
  for (const p of HTML_CACHE_BLOCK_PREFIXES) {
    if (url.pathname === p || url.pathname.startsWith(p + "/") || url.pathname.startsWith(p)) {
      // Use startsWith match consistent with prior behaviour.
      if (url.pathname.startsWith(p)) return { ok: false, reason: "block:" + p };
    }
  }
  // Explicit cache-buster.
  if (url.searchParams.get("nocache") === "1") return { ok: false, reason: "nocache" };
  // Auth-bearing query tokens.
  if (url.searchParams.has("tok") || url.searchParams.has("token")) {
    return { ok: false, reason: "qs-token" };
  }
  // Authorization header.
  if (request.headers.get("authorization")) return { ok: false, reason: "auth-hdr" };
  // Session/auth cookies (do NOT block on __cf_bm / cf_clearance / _ga / utm).
  const cookie = request.headers.get("cookie") || "";
  if (cookie && AUTH_COOKIE_RX.test(cookie)) return { ok: false, reason: "auth-cookie" };
  // Allowlist gate.
  if (HTML_CACHE_ALLOW_EXACT.has(url.pathname)) return { ok: true, reason: "allow-exact" };
  for (const p of HTML_CACHE_ALLOW_PREFIXES) {
    if (url.pathname.startsWith(p)) return { ok: true, reason: "allow:" + p };
  }
  return { ok: false, reason: "not-allowlisted" };
}
__name(evaluateHtmlCacheable, "evaluateHtmlCacheable");
// Build a normalised cache key — strip tracking params so /products?utm_*=…
// shares the cache entry with /products. Preserves whitelisted query keys.
var TRACKING_PARAM_RX = /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|msclkid$|mc_(?:eid|cid)$|_hsenc$|_hsmi$|igshid$|ref$|ref_src$|yclid$|hsCtaTracking$|trk$)/i;
function buildCacheKey(url) {
  const cleanUrl = new URL(url.toString());
  const drop = [];
  for (const k of cleanUrl.searchParams.keys()) {
    if (TRACKING_PARAM_RX.test(k)) drop.push(k);
  }
  for (const k of drop) cleanUrl.searchParams.delete(k);
  // Sort remaining params for canonical key.
  const entries = [...cleanUrl.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  cleanUrl.search = "";
  for (const [k, v] of entries) cleanUrl.searchParams.append(k, v);
  return new Request(cleanUrl.toString(), { method: "GET" });
}
__name(buildCacheKey, "buildCacheKey");
function proxyToOrigin(request, _origin, cacheOpts) {
  const init = { redirect: "manual" };
  if (cacheOpts) {
    init.cf = cacheOpts;
    const sanitized = new Headers(request.headers);
    sanitized.delete("cookie");
    sanitized.delete("authorization");
    return fetch(request.url, { method: request.method, headers: sanitized, redirect: "manual", cf: cacheOpts });
  }
  return fetch(request, init);
}
__name(proxyToOrigin, "proxyToOrigin");
async function fetchPrerender(request, token) {
  const url = new URL(request.url);
  const target = `${PRERENDER_ORIGIN}/${url.toString()}`;
  const headers = fwdHeaders(request);
  headers.set("x-prerender-token", token);
  headers.set("user-agent", request.headers.get("user-agent") || "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PRERENDER_TIMEOUT_MS);
  try {
    return await fetch(target, { method: "GET", headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
__name(fetchPrerender, "fetchPrerender");
async function fetchEmergencyPrerenderFallback(request, token, url) {
  if (!token || !["GET", "HEAD"].includes(request.method) || !isEmergencyPrerenderFallbackPath(url.pathname)) return null;
  try {
    const preRequest = request.method === "HEAD" ? new Request(request.url, { method: "GET", headers: request.headers }) : request;
    const pre = await fetchPrerender(preRequest, token);
    if (!pre || pre.status >= 500 || pre.status === 429) return null;
    const h = new Headers(pre.headers);
    h.set("x-prerendered", "true");
    h.set("x-prerender-cache", "EMERGENCY");
    h.set("x-phl-via", "emergency-prerender-fallback");
    h.set("cache-control", "public, max-age=60, s-maxage=60, stale-while-revalidate=3600");
    h.set("cdn-cache-control", "public, max-age=60, stale-while-revalidate=3600");
    h.set("cloudflare-cdn-cache-control", "public, max-age=60, stale-while-revalidate=3600");
    h.delete("set-cookie");
    h.delete("x-robots-tag");
    // Origin is currently broken and prerender snapshots may reference stale
    // /assets/index-*.js. If a browser loads that missing JS it can enter the
    // cache-recovery reload path repeatedly. Keep public content online as a
    // read-only emergency snapshot and prevent stale boot scripts from running.
    const body = request.method === "HEAD" ? null : pre.body;
    return applySecurityHeaders(stripAllScripts(new Response(body, { status: pre.status, statusText: pre.statusText, headers: h })), url);
  } catch (_) {
    return null;
  }
}
__name(fetchEmergencyPrerenderFallback, "fetchEmergencyPrerenderFallback");
async function serveStaleOrError(request) {
  try {
    const cache = caches.default;
    const stale = await cache.match(request);
    if (stale) {
      const h = new Headers(stale.headers);
      h.set("x-served-from", "stale");
      return applySecurityHeaders(new Response(stale.body, { status: stale.status, headers: h }));
    }
  } catch (_) {
  }
  return brandedErrorResponse(503, 30);
}
__name(serveStaleOrError, "serveStaleOrError");
var StripLovableScripts = class {
  static {
    __name(this, "StripLovableScripts");
  }
  element(el) {
    const src = el.getAttribute("src") || "";
    if (src.startsWith("/~flock") || src.startsWith("/__l5e/")) {
      el.remove();
    }
  }
};
var StripAllScripts = class {
  static {
    __name(this, "StripAllScripts");
  }
  element(el) {
    el.remove();
  }
};
function stripLovableInjectedScripts(response) {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return response;
  return new HTMLRewriter().on("script[src]", new StripLovableScripts()).transform(response);
}
__name(stripLovableInjectedScripts, "stripLovableInjectedScripts");
function stripAllScripts(response) {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return response;
  return new HTMLRewriter().on("script", new StripAllScripts()).transform(response);
}
__name(stripAllScripts, "stripAllScripts");
var _ttlCache = { value: 60, expiresAt: 0 };
var TTL_CACHE_MS = 6e4;
var TTL_DEFAULT = 60;
var TTL_MIN = 60;
// Allow 0 from KV as an explicit "disable" signal, but coerce to TTL_MIN below
// so cold hits still populate caches.default. Other allowed values warm cache
// for longer when configured.
var TTL_ALLOWED = /* @__PURE__ */ new Set([0, 30, 60, 300, 900]);
async function getHtmlTtlSeconds() {
  const now = Date.now();
  if (_ttlCache.expiresAt > now) return _ttlCache.value;
  let value = TTL_DEFAULT;
  try {
    const r = await fetch(`https://${CANONICAL_HOST}/api/public/cache-config`, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: true },
      signal: AbortSignal.timeout(2e3)
    });
    if (r.ok) {
      const j = await r.json();
      if (typeof j.htmlTtlSeconds === "number" && TTL_ALLOWED.has(j.htmlTtlSeconds)) {
        value = j.htmlTtlSeconds;
      }
    }
  } catch {
  }
  // Final guard: KV may return 0/NaN/undefined — never let cacheTtl drop to 0.
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) value = TTL_MIN;
  else if (n < TTL_MIN) value = TTL_MIN;
  else value = n;
  _ttlCache = { value, expiresAt: now + TTL_CACHE_MS };
  return value;
}
__name(getHtmlTtlSeconds, "getHtmlTtlSeconds");
var phlabs_prerender_patched_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const origin = null;
    if (url.pathname === "/api/pageview") {
      const allowOrigin = "https://" + CANONICAL_HOST;
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": allowOrigin,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "Content-Type",
            "access-control-max-age": "86400",
            "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
            "cdn-cache-control": "no-store",
            "cloudflare-cdn-cache-control": "no-store"
          }
        });
      }
      return new Response("OK", {
        status: 200,
        headers: {
          "access-control-allow-origin": allowOrigin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "Content-Type",
          "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "cdn-cache-control": "no-store",
          "cloudflare-cdn-cache-control": "no-store",
          "pragma": "no-cache",
          "expires": "0",
          "content-type": "text/plain; charset=utf-8",
          "x-phl-via": "beacon"
        }
      });
    }
    if (url.pathname === "/_img" || url.pathname === "/_img/") {
      const target = url.searchParams.get("u");
      if (!target) return new Response("missing u", { status: 400 });
      let src;
      try {
        src = new URL(target);
      } catch (_) {
        return new Response("bad url", { status: 400 });
      }
      const ALLOWED_IMG_HOSTS = /* @__PURE__ */ new Set([
        "firebasestorage.googleapis.com",
        "storage.googleapis.com",
        "lh3.googleusercontent.com"
      ]);
      if (!ALLOWED_IMG_HOSTS.has(src.hostname)) {
        return new Response("forbidden host", { status: 403 });
      }
      const w = Math.max(16, Math.min(2400, parseInt(url.searchParams.get("w") || "0", 10) || 0));
      const q = Math.max(30, Math.min(95, parseInt(url.searchParams.get("q") || "80", 10)));
      const fParam = (url.searchParams.get("f") || "auto").toLowerCase();
      const format = ["auto", "avif", "webp", "json", "jpeg", "png"].includes(fParam) ? fParam : "auto";
      const imageOpts = { quality: q, format };
      if (w) imageOpts.width = w;
      const fit = url.searchParams.get("fit");
      if (fit && ["cover", "contain", "scale-down", "crop", "pad"].includes(fit)) imageOpts.fit = fit;
      try {
        const upstream = await fetch(src.toString(), {
          cf: { image: imageOpts, cacheEverything: true, cacheTtl: 86400 },
          headers: { accept: request.headers.get("accept") || "image/avif,image/webp,*/*" }
        });
        const h = new Headers(upstream.headers);
        h.set("cache-control", "public, max-age=31536000, immutable");
        h.set("x-phl-via", "img-resize");
        h.delete("set-cookie");
        return applySecurityHeaders(new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: h }), url);
      } catch (_) {
        try {
          const raw = await fetch(src.toString());
          return new Response(raw.body, { status: raw.status, headers: raw.headers });
        } catch (__) {
          return new Response("upstream error", { status: 502 });
        }
      }
    }
    if (REDIRECT_HOSTS.has(host) || url.protocol === "http:" && host === CANONICAL_HOST) {
      const dest = new URL(url.toString());
      dest.protocol = "https:";
      dest.hostname = CANONICAL_HOST;
      dest.port = "";
      return Response.redirect(dest.toString(), 301);
    }
    if (url.pathname === "/index") {
      const dest = new URL(url.toString());
      dest.pathname = "/";
      return Response.redirect(dest.toString(), 301);
    }
    if (url.pathname === "/calculator" || url.pathname.startsWith("/calculator/")) {
      return Response.redirect("https://phlabs.app/", 301);
    }
    if (url.pathname === "/_health" || url.pathname === "/__health") {
      return jsonResponse({
        status: "ok",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        version: "1.0.0"
      });
    }
    if (request.method === "OPTIONS") {
      try {
        const res = await proxyToOrigin(request, origin);
        return applySecurityHeaders(res);
      } catch (_) {
        return brandedErrorResponse(502, 30);
      }
    }
    if (WEBHOOK_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      try {
        const res = await proxyToOrigin(request, origin);
        const h = new Headers(res.headers);
        noCache(h);
        return applySecurityHeaders(new Response(res.body, { status: res.status, statusText: res.statusText, headers: h }));
      } catch (_) {
        return brandedErrorResponse(502, 30);
      }
    }
    const ua = request.headers.get("user-agent") || "";
    const uaLower = ua.toLowerCase();
    const isGooglebot = uaLower.includes("googlebot") || uaLower.includes("google-inspectiontool") || uaLower.includes("adsbot-google") || uaLower.includes("storebot-google");
    if (HOSTILE_BOT_UA_RX.test(ua)) {
      return new Response("Forbidden: automated scraping not permitted.\n", {
        status: 403,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-phl-block": "hostile-bot",
          "x-robots-tag": "noindex, nofollow"
        }
      });
    }
    const isBot = isGooglebot || BOT_UA_RX.test(ua);
    const isGet = request.method === "GET";
    const isStatic = STATIC_EXT_RX.test(url.pathname) || PRERENDER_BYPASS_EXACT.has(url.pathname) || PRERENDER_BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p));
    const token = env && env.PRERENDER_TOKEN;
    const isLoop = request.headers.has(LOOP_HEADER);
    if (isBot && isGet && !isStatic) {
      const branch = token && !isLoop && !PRERENDER_RENDERER_RX.test(ua) ? "prerender" : "normal-proxy";
      console.log(JSON.stringify({
        tag: "phlabs-prerender",
        branch,
        path: url.pathname,
        tokenPresent: Boolean(token),
        uaSample: ua.slice(0, 80),
        isGooglebot
      }));
    }
    if (isBot && isGet && !isStatic && token && !isLoop && !PRERENDER_RENDERER_RX.test(ua)) {
      let preStatus = "skipped";
      let preErr = "";
      try {
        const pre = await fetchPrerender(request, token);
        preStatus = pre ? String(pre.status) : "null";
        if (pre && pre.status < 500 && pre.status !== 429) {
          const h = new Headers(pre.headers);
          h.set("x-prerendered", "true");
          h.set("x-prerender-cache", "MISS");
          h.set("x-phl-via", "prerender");
          h.delete("x-robots-tag");
          h.set("cache-control", `public, max-age=${PRERENDER_CACHE_TTL}, s-maxage=${PRERENDER_CACHE_TTL}, stale-while-revalidate=${PRERENDER_SWR_TTL}`);
          h.delete("set-cookie");
          const out = applySecurityHeaders(new Response(pre.body, { status: pre.status, statusText: pre.statusText, headers: h }), url);
          return out;
        }
      } catch (e) {
        preErr = e && (e.name || e.message) ? String(e.name || e.message).slice(0, 60) : "err";
      }
      const reReq = new Request(request, { headers: new Headers(request.headers) });
      reReq.headers.set(LOOP_HEADER, "1");
      try {
        const res = await proxyToOrigin(reReq, origin);
        const h = new Headers(res.headers);
        h.set("x-phl-via", `origin-bot-fallback;pre=${preStatus};err=${preErr}`);
        return applySecurityHeaders(new Response(res.body, { status: res.status, statusText: res.statusText, headers: h }));
      } catch (_) {
        return serveStaleOrError(request);
      }
    }
    const normalProxyVia = `normal-proxy;bot=${isBot ? 1 : 0};tok=${token ? 1 : 0};loop=${isLoop ? 1 : 0};gb=${isGooglebot ? 1 : 0}`;
    const isXmlFeed = XML_FEED_PATHS.has(url.pathname);
    const htmlTtl = await getHtmlTtlSeconds();
    const cacheEval = isXmlFeed
      ? { ok: false, reason: "xml-feed" }
      : evaluateHtmlCacheable(request, url, htmlTtl);
    const htmlCacheable = cacheEval.ok;
    const cacheSkipReason = cacheEval.reason;
    const cacheOpts = htmlCacheable ? {
      cacheEverything: true,
      cacheTtl: htmlTtl,
      cacheTtlByStatus: { "200-299": htmlTtl, "301-302": 600, "404": 30, "500-599": 0 }
    } : void 0;
    let cacheKey = null;
    if (htmlCacheable) {
      cacheKey = buildCacheKey(url);
      try {
        const hit = await caches.default.match(cacheKey);
        if (hit) {
          const h = new Headers(hit.headers);
          h.set("cache-control", "public, max-age=0, must-revalidate");
          h.set("cdn-cache-control", `public, max-age=${htmlTtl}, stale-while-revalidate=86400`);
          h.set("cloudflare-cdn-cache-control", `public, max-age=${htmlTtl}, stale-while-revalidate=86400`);
          h.set("x-phl-via", `${normalProxyVia};cached=1`);
          h.set("cf-cache-status", "HIT");
          h.set("x-phl-cache", "HIT");
          h.delete("age");
          const cachedOut = new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
          return rewriteCspNonce(await repairInlineBootScripts(applySecurityHeaders(stripLovableInjectedScripts(cachedOut), url)));
        }
      } catch (_) {
      }
    }

    try {
      const res = await proxyToOrigin(request, origin, cacheOpts);
      if (isServiceWorkerPath(url)) {
        const h2 = new Headers(res.headers);
        h2.set("content-type", "text/javascript; charset=utf-8");
        h2.set("service-worker-allowed", "/");
        return applySecurityHeaders(applyNoStoreHeaders(new Response(res.body, { status: res.status, statusText: res.statusText, headers: h2 })), url);
      }
      if (res.status === 0 || res.status === 521 || res.status === 522 || res.status === 523) {
        const emergency = await fetchEmergencyPrerenderFallback(request, token, url);
        if (emergency) return emergency;
        if (request.method === "GET" && url.pathname === "/sitemap.xml") return emergencySitemapResponse();
        if (request.method === "GET" && APP_SHELL_FALLBACK_EXACT.has(url.pathname)) return appShellFallbackResponse(url);
        return brandedErrorResponse(503, 30);
      }
      const h = new Headers(res.headers);
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhook/")) {
        noCache(h);
      } else if (isFirebaseAuthHelperPath(url)) {
        noCache(h);
        h.delete("x-frame-options");
      } else if (isStatic) {
        if (!h.has("cache-control")) h.set("cache-control", "public, max-age=31536000, immutable");
      } else if (isXmlFeed) {
        // XML feeds (sitemap, merchant feed) — short edge TTL instead of bypass
        h.set("cache-control", "public, max-age=0, must-revalidate");
        h.set("cdn-cache-control", "public, max-age=300, stale-while-revalidate=3600");
        h.set("cloudflare-cdn-cache-control", "public, max-age=300, stale-while-revalidate=3600");
        h.set("content-type", "application/xml; charset=utf-8");

      } else if ((h.get("content-type") || "").includes("text/html")) {
        if (htmlTtl > 0) {
          h.set("cache-control", "public, max-age=0, must-revalidate");
          h.set("cdn-cache-control", `public, max-age=${htmlTtl}, stale-while-revalidate=86400`);
          h.set("cloudflare-cdn-cache-control", `public, max-age=${htmlTtl}, stale-while-revalidate=86400`);
        } else {
          h.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
          h.set("cdn-cache-control", "no-store");
          h.set("cloudflare-cdn-cache-control", "no-store");
        }
      }
      const assetRecovery = res.status === 404 ? missingBuildAssetRecoveryResponse(url.pathname) : null;
      if (assetRecovery) return assetRecovery;
      if (res.status >= 500) {
        noCache(h);
        const emergency = await fetchEmergencyPrerenderFallback(request, token, url);
        if (emergency) return emergency;
        if (request.method === "GET" && url.pathname === "/sitemap.xml") return emergencySitemapResponse();
        if (request.method === "GET" && APP_SHELL_FALLBACK_EXACT.has(url.pathname)) return appShellFallbackResponse(url);
        return await serveStaleOrError(request);
      }
      const innerCf = res.headers.get("cf-cache-status");
      if (innerCf) h.set("cf-cache-status", innerCf);
      h.set("x-phl-via", `${normalProxyVia};inner=${innerCf || "n/a"}`);
      const isHtml = (h.get("content-type") || "").includes("text/html");
      const cspForCache = h.get("content-security-policy") || "";
      if (htmlCacheable && cacheKey && res.status === 200 && isHtml) {
        try {
          const strippedForCache = stripLovableInjectedScripts(
            new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
          );
          const buf = await strippedForCache.arrayBuffer();
          const cacheHeaders = new Headers();
          cacheHeaders.set("content-type", h.get("content-type") || "text/html; charset=utf-8");
          if (cspForCache) cacheHeaders.set("content-security-policy", cspForCache);
          const reportingEndpoints = h.get("reporting-endpoints");
          if (reportingEndpoints) cacheHeaders.set("reporting-endpoints", reportingEndpoints);
          cacheHeaders.set("cache-control", `public, max-age=${htmlTtl}, s-maxage=${htmlTtl}`);
          cacheHeaders.set("x-phl-cached-at", (/* @__PURE__ */ new Date()).toISOString());
          let putErr = "ok";
          const putPromise = caches.default.put(
            cacheKey,
            new Response(buf, { status: 200, headers: cacheHeaders })
          ).catch((e) => {
            putErr = (e && e.message || "err").slice(0, 40);
          });
          ctx.waitUntil(putPromise);
          h.set("x-phl-cache", `miss;put=${putErr}`);
          const liveOut = new Response(buf, { status: res.status, statusText: res.statusText, headers: h });
          return rewriteCspNonce(await repairInlineBootScripts(applySecurityHeaders(liveOut, url)));
        } catch (e) {
          h.set("x-phl-cache", "buf-err:" + (e && e.message || "x").slice(0, 30));
        }
      } else if (htmlCacheable) {
        h.set("x-phl-cache", `skip;status=${res.status};html=${isHtml ? 1 : 0}`);
      } else {
        h.set("x-phl-cache", `skip;reason=${cacheSkipReason}`);
      }

      const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
      return rewriteCspNonce(await repairInlineBootScripts(applySecurityHeaders(stripLovableInjectedScripts(out), url)));
    } catch (_) {
      return await serveStaleOrError(request);
    }
  }
};
export {
  phlabs_prerender_patched_default as default
};
//# sourceMappingURL=phlabs-prerender-patched.js.map
