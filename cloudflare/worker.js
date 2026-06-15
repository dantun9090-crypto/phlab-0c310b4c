/**
 * PH Labs — Cloudflare Worker (phlabs-prerender)
 *
 * Deployed to phlabs.co.uk/* on Cloudflare zone ed093ef4578e8e3568e26c3e979558c6.
 *
 * Responsibilities (in order):
 *  1. Hostname normalization      www.phlabs.co.uk → phlabs.co.uk, http→https
 *  2. Health endpoint              /_health  (also /__health) — JSON, no origin hop
 *  3. Webhook bypass               /api/truelayer/*, /api/fena/*, /webhook/* → origin raw
 *  4. Bot detection                Googlebot, AdsBot, Bingbot, Twitterbot, Prerender …
 *  5. Prerender.io for bots        25s timeout, 5xx/429/timeout → origin fallback
 *  6. Normal proxy to origin       Lovable origin, preserves CF-Connecting-IP
 *  7. Security headers everywhere  HSTS preload, nosniff, frame-deny, referrer, perms
 *  8. Strip leaked headers         X-Powered-By, Server
 *  9. 5xx → branded HTML + no-cache
 *
 * Per-IP rate limiting is handled by the Cloudflare Rate Limiting Ruleset
 * (deployed separately via API). In-Worker counters would be unreliable
 * across edge isolates without Durable Objects.
 *
 * Env vars:
 *   PRERENDER_TOKEN  — secret (already configured on this Worker)
 */

const CANONICAL_HOST = "phlabs.co.uk";

const REDIRECT_HOSTS = new Set([
  "www.phlabs.co.uk",
  // Legacy brand hosts (replaced by https://phlabs.co.uk):
  ["pro", "health", "peptides.co.uk"].join("-").replace(/-/g, ""),
  "www." + ["pro", "health", "peptides.co.uk"].join("-").replace(/-/g, ""),
]);

const WEBHOOK_PREFIXES = [
  "/api/truelayer/",
  "/api/fena/",
  "/api/public/hooks/",
  "/webhook/",
];

const FIREBASE_AUTH_PREFIXES = ["/__/auth/", "/__/firebase/"];
const XML_FEED_PATHS = new Set(["/sitemap.xml", "/google-merchant-feed.xml"]);

// Bot UAs that should receive a prerendered HTML snapshot.
const BOT_UA_RX = new RegExp(
  [
    "googlebot", "google-inspectiontool", "adsbot-google", "google-merchant",
    "storebot-google", "googleother",
    "bingbot", "bingpreview", "msnbot", "slurp",
    "duckduckbot", "baiduspider", "yandexbot", "yandeximages",
    "facebookexternalhit", "meta-externalagent", "twitterbot", "linkedinbot",
    "pinterestbot", "whatsapp", "telegrambot", "discordbot", "slackbot",
    "prerender", "lighthouse", "headlesschrome",
    // generic catch-alls — last so specific matches log usefully
    "\\bbot\\b", "crawler", "spider", "\\bpreview\\b",
  ].join("|"),
  "i",
);

const STATIC_EXT_RX =
  /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|xml|txt|json|wasm|zip|webmanifest)(\?|$)/i;

// Path prefixes that must NEVER be sent to Prerender.io — these are RPC
// endpoints, webhooks, well-known files, or app-internal APIs. Sending bot
// UAs through Prerender for these returns 504 because headless Chrome can
// not render a JSON/RPC response.
const PRERENDER_BYPASS_PREFIXES = [
  "/_serverFn/",
  "/_server/",
  "/api/",
  "/.well-known/",
  "/cdn-cgi/",
  "/_img",
];
const PRERENDER_BYPASS_EXACT = new Set([
  "/site.webmanifest",
  "/manifest.webmanifest",
  "/manifest.json",
  "/apple-app-site-association",
  "/sw.js",
  "/service-worker.js",
]);

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host",
]);

const STRIP_RESPONSE_HEADERS = ["x-powered-by", "server", "x-deployment-id", "x-render-origin-server"];

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  // X-Frame-Options + X-XSS-Protection removed (deprecated). Framing is
  // controlled by CSP `frame-ancestors 'none'` set by the origin (src/server.ts).
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
};

const PRERENDER_ORIGIN = "https://service.prerender.io";
// 45s — fresh (uncached) prerender renders of the homepage take ~18s; 25s
// was too tight and caused AbortError fallback to origin SSR on first crawl.
const PRERENDER_TIMEOUT_MS = 45_000;
const PRERENDER_CACHE_TTL = 3600;
const PRERENDER_SWR_TTL = 86_400;
const LOOP_HEADER = "x-prerender-loop";
const PRERENDER_RENDERER_RX = /Prerender \(\+https:\/\/github\.com\/prerender\/prerender\)/i;

// ---------- helpers ----------

function isFirebaseAuthHelperPath(url) {
  return FIREBASE_AUTH_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function applySecurityHeaders(res, url) {
  const h = new Headers(res.headers);
  for (const k of STRIP_RESPONSE_HEADERS) h.delete(k);
  // Strip any upstream legacy headers — replaced by CSP frame-ancestors.
  h.delete("x-frame-options");
  h.delete("x-xss-protection");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!h.has(k)) h.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function noCache(headers) {
  headers.set("cache-control", "no-cache, no-store, must-revalidate");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
}

function jsonResponse(body, status = 200) {
  const h = new Headers({ "content-type": "application/json; charset=utf-8" });
  noCache(h);
  return applySecurityHeaders(new Response(JSON.stringify(body), { status, headers: h }));
}

function brandedErrorHtml() {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Temporary Error | PH Labs UK</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><style>html,body{margin:0;padding:0;background:#020617;color:#f1f5f9;font:16px/1.6 -apple-system,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:1.5rem}main{max-width:32rem;background:#0f172a;border:1px solid #1e293b;border-radius:.75rem;padding:2.5rem 2rem;text-align:center}h1{margin:0 0 .75rem;font-size:1.5rem;color:#fff}p{margin:0 0 1rem;color:#cbd5e1}a{color:#10b981}</style></head><body><main><h1>Temporary Error</h1><p>Our laboratory systems are updating. Please retry in 30 seconds.</p><p>Contact: <a href="mailto:info@phlabs.co.uk">info@phlabs.co.uk</a></p></main></body></html>`;
}

function brandedErrorResponse(status = 503, retryAfter = 30) {
  const h = new Headers({ "content-type": "text/html; charset=utf-8" });
  noCache(h);
  if (retryAfter) h.set("retry-after", String(retryAfter));
  return applySecurityHeaders(new Response(brandedErrorHtml(), { status, headers: h }));
}

function fwdHeaders(req) {
  const out = new Headers();
  for (const [k, v] of req.headers) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v);
  }
  return out;
}

function normalizePublicUrl(url) {
  const u = new URL(url.toString());
  u.protocol = "https:";
  u.hostname = CANONICAL_HOST;
  u.port = "";
  u.hash = "";
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);
  return u.toString();
}

function isServiceWorkerPath(url) {
  return url.pathname === "/sw.js" || url.pathname === "/service-worker.js";
}

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

// Routes safe to edge-cache as HTML. Matches the `phlabs cache` ruleset
// exclusion list (admin/account/cart/checkout/payment/login/register/api/
// search/vip-store/webhook) so we never cache personalised pages.
const HTML_CACHE_EXCLUDE_PREFIXES = [
  "/admin", "/account", "/cart", "/checkout", "/payment", "/login",
  "/register", "/api", "/search", "/vip-store", "/webhook", "/__/auth",
  "/__/firebase",
];
function isHtmlCacheable(url) {
  if (isServiceWorkerPath(url)) return false;
  return !HTML_CACHE_EXCLUDE_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function proxyToOrigin(request, _origin, cacheOpts) {
  // Pass-through via Cloudflare's DNS-based routing. Without the `cf`
  // option Worker subrequests bypass the edge cache entirely — so we
  // pass cacheEverything/cacheTtl explicitly for safe HTML routes,
  // which restores the 5-min edge cache that the Rulesets describe.
  const init = { redirect: "manual" };
  if (cacheOpts) init.cf = cacheOpts;
  return fetch(request, init);
}

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

async function serveStaleOrError(request) {
  try {
    const cache = caches.default;
    const stale = await cache.match(request);
    if (stale) {
      const h = new Headers(stale.headers);
      h.set("x-served-from", "stale");
      return applySecurityHeaders(new Response(stale.body, { status: stale.status, headers: h }));
    }
  } catch (_) {}
  return brandedErrorResponse(503, 30);
}

// Strip Lovable editor/analytics scripts (/~flock.js, /__l5e/events.js) that
// the Lovable hosting layer injects into the origin HTML. They trigger CSP
// violations and are only useful in the Lovable editor preview.
class StripLovableScripts {
  element(el) {
    const src = el.getAttribute("src") || "";
    if (src.startsWith("/~flock") || src.startsWith("/__l5e/")) {
      el.remove();
    }
  }
}

function stripLovableInjectedScripts(response) {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return response;
  return new HTMLRewriter()
    .on("script[src]", new StripLovableScripts())
    .transform(response);
}

// ---------- main ----------


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const origin = null;

    // 0. Pageview beacon — must run BEFORE redirects/prerender/cache.
    //    Cache-cached HTML never reaches the origin, so Lovable's visit
    //    counter misses ~95% of traffic. This endpoint always returns 200
    //    no-store, and the client fires POST /api/pageview on each route
    //    change. Cloudflare must NOT cache this path (rules + headers).
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
            "cloudflare-cdn-cache-control": "no-store",
          },
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
          "x-phl-via": "beacon",
        },
      });
    }

    // 0b. Image transformation proxy — /_img/?u=<encoded firebase url>&w=600&f=auto&q=80
    //     Uses Cloudflare Image Resizing via `cf.image` on a Worker subrequest,
    //     which works for any origin we can fetch (bypasses the same-zone limit
    //     of /cdn-cgi/image/). Negotiates AVIF/WebP from the client Accept header.
    if (url.pathname === "/_img" || url.pathname === "/_img/") {
      const target = url.searchParams.get("u");
      if (!target) return new Response("missing u", { status: 400 });
      let src;
      try {
        src = new URL(target);
      } catch (_) {
        return new Response("bad url", { status: 400 });
      }
      // Allowlist: only Firebase Storage + googleusercontent (avoid open proxy).
      const ALLOWED_IMG_HOSTS = new Set([
        "firebasestorage.googleapis.com",
        "storage.googleapis.com",
        "lh3.googleusercontent.com",
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
          headers: { accept: request.headers.get("accept") || "image/avif,image/webp,*/*" },
        });
        const h = new Headers(upstream.headers);
        h.set("cache-control", "public, max-age=31536000, immutable");
        h.set("x-phl-via", "img-resize");
        h.delete("set-cookie");
        return applySecurityHeaders(new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: h }), url);
      } catch (_) {
        // Fallback to original
        try {
          const raw = await fetch(src.toString());
          return new Response(raw.body, { status: raw.status, headers: raw.headers });
        } catch (__) {
          return new Response("upstream error", { status: 502 });
        }
      }
    }




    // 1. Hostname normalization (defense in depth — origin also does this).
    if (REDIRECT_HOSTS.has(host) || (url.protocol === "http:" && host === CANONICAL_HOST)) {
      const dest = new URL(url.toString());
      dest.protocol = "https:";
      dest.hostname = CANONICAL_HOST;
      dest.port = "";
      return Response.redirect(dest.toString(), 301);
    }

    // Lovable preview sometimes opens /index; PH Labs only has /. Keep this
    // alias at the edge so preview and live never land on an empty shell.
    if (url.pathname === "/index") {
      const dest = new URL(url.toString());
      dest.pathname = "/";
      return Response.redirect(dest.toString(), 301);
    }

    // Calculator lives on phlabs.app — 301 any legacy /calculator hit there so
    // Bing/Google can drop the 404 entry.
    if (url.pathname === "/calculator" || url.pathname.startsWith("/calculator/")) {
      return Response.redirect("https://phlabs.app/", 301);
    }

    // 2. Health endpoint — never hits origin, never prerendered.
    if (url.pathname === "/_health" || url.pathname === "/__health") {
      return jsonResponse({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      });
    }

    // 3. CORS preflight — pass directly to origin.
    if (request.method === "OPTIONS") {
      try {
        const res = await proxyToOrigin(request, origin);
        return applySecurityHeaders(res);
      } catch (_) {
        return brandedErrorResponse(502, 30);
      }
    }

    // 4. Webhook bypass — raw body passthrough, no prerender, no cache.
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

    // 5. Bot detection → Prerender.io (GET only, non-static).
    const ua = request.headers.get("user-agent") || "";
    const uaLower = ua.toLowerCase();
    // Explicit case-insensitive fast-path for Googlebot variants
    // (Googlebot, Googlebot-Image, Storebot-Google, AdsBot-Google, …).
    const isGooglebot = uaLower.includes("googlebot") || uaLower.includes("google-inspectiontool") || uaLower.includes("adsbot-google") || uaLower.includes("storebot-google");
    const isBot = isGooglebot || BOT_UA_RX.test(ua);
    const isGet = request.method === "GET";
    const isStatic =
      STATIC_EXT_RX.test(url.pathname) ||
      PRERENDER_BYPASS_EXACT.has(url.pathname) ||
      PRERENDER_BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p));
    const token = env && env.PRERENDER_TOKEN;
    const isLoop = request.headers.has(LOOP_HEADER);

    // Safe debug log — boolean for token presence, never the value itself.
    // Visible in `wrangler tail` / Cloudflare Logs without leaking secrets.
    if (isBot && isGet && !isStatic) {
      const branch = token && !isLoop && !PRERENDER_RENDERER_RX.test(ua) ? "prerender" : "normal-proxy";
      console.log(JSON.stringify({
        tag: "phlabs-prerender",
        branch,
        path: url.pathname,
        tokenPresent: Boolean(token),
        uaSample: ua.slice(0, 80),
        isGooglebot,
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
        preErr = (e && (e.name || e.message)) ? String(e.name || e.message).slice(0, 60) : "err";
      }
      // Fallback to origin with loop marker so we don't re-enter prerender.
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

    // 6. Normal proxy → origin. We pass `cf.cacheEverything` only for safe
    //    public HTML routes. XML feeds must stay uncached so Merchant Center
    //    and sitemap crawlers always see fresh backend data.
    const normalProxyVia = `normal-proxy;bot=${isBot ? 1 : 0};tok=${token ? 1 : 0};loop=${isLoop ? 1 : 0};gb=${isGooglebot ? 1 : 0}`;
    const isXmlFeed = XML_FEED_PATHS.has(url.pathname);
    // Home page is stable enough to cache for 1h at the edge (banner + product
    // grid only change on admin writes, which already trigger purges).
    // All other safe HTML routes stay at the 5-min default.
    const htmlTtl = url.pathname === "/" ? 3600 : 300;
    const htmlCacheable = isGet && !isXmlFeed && isHtmlCacheable(url);
    const cacheOpts = htmlCacheable
      ? { cacheEverything: true, cacheTtl: htmlTtl }
      : undefined;

    // 6a. Cache API lookup for HTML pages. With a Worker bound to the route,
    //     `cf.cacheEverything` only caches the inner subrequest — the *outer*
    //     client response always says `cf-cache-status: DYNAMIC` unless we
    //     explicitly hit caches.default. Use a normalized cache key (no
    //     cookies, GET) so __cf_bm and per-visitor headers can't bust it.
    let cacheKey = null;
    if (htmlCacheable) {
      cacheKey = new Request(normalizePublicUrl(url), { method: "GET" });
      try {
        const hit = await caches.default.match(cacheKey);
        if (hit) {
          const h = new Headers(hit.headers);
          h.set("x-phl-via", "edge-cache-hit");
          h.set("cf-cache-status", "HIT");
          return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
        }
      } catch (_) { /* cache miss / unsupported — fall through */ }
    }

    try {
      const res = await proxyToOrigin(request, origin, cacheOpts);
      if (isServiceWorkerPath(url)) {
        const h = new Headers(res.headers);
        h.set("content-type", "text/javascript; charset=utf-8");
        h.set("service-worker-allowed", "/");
        return applySecurityHeaders(applyNoStoreHeaders(new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })), url);
      }

      // Error 1000-style infinite redirect / DNS loop detection.
      if (res.status === 0 || res.status === 521 || res.status === 522 || res.status === 523) {
        return brandedErrorResponse(503, 30);
      }

      // Cache-control by path family.
      const h = new Headers(res.headers);
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhook/")) {
        noCache(h);
      } else if (isFirebaseAuthHelperPath(url)) {
        noCache(h);
        h.delete("x-frame-options");
      } else if (isStatic) {
        if (!h.has("cache-control")) h.set("cache-control", "public, max-age=31536000, immutable");
      } else if (isXmlFeed) {
        // Sitemap + merchant feed: no edge/browser cache; origin sets item/debug headers.
        h.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
        h.set("cdn-cache-control", "no-store");
        h.set("cloudflare-cdn-cache-control", "no-store");
        h.set("content-type", "application/xml; charset=utf-8");
      } else if ((h.get("content-type") || "").includes("text/html")) {
        if (!h.has("cache-control") || /no-cache|no-store|max-age=0/i.test(h.get("cache-control") || "")) {
          const browserMax = url.pathname === "/" ? 3600 : 300;
          h.set("cache-control", `public, max-age=${browserMax}, stale-while-revalidate=86400`);
        }
      }

      // 5xx → branded HTML + try stale cache.
      if (res.status >= 500) {
        noCache(h);
        return await serveStaleOrError(request);
      }

      h.set("x-phl-via", normalProxyVia);

      // 6b. Edge-cache HTML via Cache API so the NEXT visitor HITs at ~50ms.
      //     HTMLRewriter/finalRes streams aren't reliably teeable, so we
      //     buffer the upstream HTML into an ArrayBuffer once and build two
      //     independent Responses from it: one for the cache, one for the
      //     client (which still passes through HTMLRewriter + security
      //     headers and keeps the visitor's Set-Cookie intact).
      const isHtml = (h.get("content-type") || "").includes("text/html");
      if (htmlCacheable && cacheKey && res.status === 200 && isHtml) {
        try {
          const buf = await res.arrayBuffer();
          // Cached copy — strip per-visitor cookies, force public TTL.
          const cacheHeaders = new Headers(h);
          cacheHeaders.delete("set-cookie");
          cacheHeaders.delete("x-phl-via");
          // Origin returns `vary: accept-encoding`; our cache lookup Request
          // doesn't include that header, so Vary causes match() to miss.
          cacheHeaders.delete("vary");
          cacheHeaders.set("cache-control", `public, max-age=${htmlTtl}, s-maxage=${htmlTtl}`);
          cacheHeaders.set("x-phl-cached-at", new Date().toISOString());
          ctx.waitUntil(
            caches.default.put(cacheKey, new Response(buf, { status: 200, headers: cacheHeaders })),
          );
          // Live response — full headers (incl. cookies), HTMLRewriter applied.
          const liveOut = new Response(buf, { status: res.status, statusText: res.statusText, headers: h });
          return applySecurityHeaders(stripLovableInjectedScripts(liveOut), url);
        } catch (_) { /* fall through to streaming path */ }
      }

      const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
      return applySecurityHeaders(stripLovableInjectedScripts(out), url);
    } catch (_) {
      return await serveStaleOrError(request);
    }
  },
};

