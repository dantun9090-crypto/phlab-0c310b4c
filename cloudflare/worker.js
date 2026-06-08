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
 *   ORIGIN           — defaults to "https://phlab.lovable.app" if unset
 */

const CANONICAL_HOST = "phlabs.co.uk";
const DEFAULT_ORIGIN = "https://phlab.lovable.app";

const REDIRECT_HOSTS = new Set([
  "www.phlabs.co.uk",
  "prohealthpeptides.co.uk",
  "www.prohealthpeptides.co.uk",
]);

const WEBHOOK_PREFIXES = [
  "/api/truelayer/",
  "/api/fena/",
  "/api/public/hooks/",
  "/webhook/",
];

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
  /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|xml|txt|json|wasm|zip)(\?|$)/i;

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host",
]);

const STRIP_RESPONSE_HEADERS = ["x-powered-by", "server", "x-deployment-id", "x-render-origin-server"];

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
};

const PRERENDER_ORIGIN = "https://service.prerender.io";
const PRERENDER_TIMEOUT_MS = 25_000;

// ---------- helpers ----------

function applySecurityHeaders(res) {
  const h = new Headers(res.headers);
  for (const k of STRIP_RESPONSE_HEADERS) h.delete(k);
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

function proxyToOrigin(request, _origin) {
  // Pass-through via Cloudflare's DNS-based routing. This preserves Host
  // (phlabs.co.uk) so the origin does not 302 back to the canonical host
  // — Lovable's published hosting redirects phlab.lovable.app → phlabs.co.uk,
  // so we MUST NOT rewrite the URL/host to the lovable.app origin.
  return fetch(request, { redirect: "manual" });
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

// ---------- main ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const origin = (env && env.ORIGIN) || DEFAULT_ORIGIN;

    // 1. Hostname normalization (defense in depth — origin also does this).
    if (REDIRECT_HOSTS.has(host) || (url.protocol === "http:" && host === CANONICAL_HOST)) {
      const dest = new URL(url.toString());
      dest.protocol = "https:";
      dest.hostname = CANONICAL_HOST;
      dest.port = "";
      return Response.redirect(dest.toString(), 301);
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
    const isBot = BOT_UA_RX.test(ua);
    const isGet = request.method === "GET";
    const isStatic = STATIC_EXT_RX.test(url.pathname);
    const token = env && env.PRERENDER_TOKEN;
    const isLoop = request.headers.has("x-prerender-loop");

    if (isBot && isGet && !isStatic && token && !isLoop) {
      try {
        const pre = await fetchPrerender(request, token);
        if (pre && pre.status < 500 && pre.status !== 429) {
          const h = new Headers(pre.headers);
          h.set("x-prerendered", "true");
          h.delete("x-robots-tag");
          if (!h.has("cache-control")) h.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
          return applySecurityHeaders(new Response(pre.body, { status: pre.status, statusText: pre.statusText, headers: h }));
        }
      } catch (_) {
        // timeout / network — fall through to origin
      }
      // Fallback to origin with loop marker so we don't re-enter prerender.
      const reReq = new Request(request, { headers: new Headers(request.headers) });
      reReq.headers.set("x-prerender-loop", "1");
      try {
        const res = await proxyToOrigin(reReq, origin);
        return applySecurityHeaders(res);
      } catch (_) {
        return serveStaleOrError(request);
      }
    }

    // 6. Normal proxy → origin (preserves CF edge caching configured by Rulesets).
    try {
      const res = await proxyToOrigin(request, origin);

      // Error 1000-style infinite redirect / DNS loop detection.
      if (res.status === 0 || res.status === 521 || res.status === 522 || res.status === 523) {
        return brandedErrorResponse(503, 30);
      }

      // Cache-control by path family.
      const h = new Headers(res.headers);
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhook/")) {
        noCache(h);
      } else if (isStatic) {
        if (!h.has("cache-control")) h.set("cache-control", "public, max-age=31536000, immutable");
      } else if ((h.get("content-type") || "").includes("text/html")) {
        if (!h.has("cache-control")) h.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
      }

      // 5xx → branded HTML + try stale cache.
      if (res.status >= 500) {
        noCache(h);
        return await serveStaleOrError(request);
      }

      return applySecurityHeaders(new Response(res.body, { status: res.status, statusText: res.statusText, headers: h }));
    } catch (_) {
      return await serveStaleOrError(request);
    }
  },
};
