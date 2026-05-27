import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { resolveLegacyRedirect } from "./lib/legacy-redirects";
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

// Canonical host: phlabs.co.uk is primary; legacy brand domain 301-redirects here.  check-domains-allow-line
const CANONICAL_HOST = "www.phlabs.co.uk";
// Hosts that should 301 to the canonical host (apex + legacy brand domains).
// Lovable preview/published hosts (*.lovable.app, *.lovableproject.com) are
// intentionally excluded so previews keep working.
const REDIRECT_HOSTS = new Set<string>([
  "phlabs.co.uk",
  // check-domains-allow-next-line: legacy host, musi tu zostać żeby zadziałał 301 do www.phlabs.co.uk
  "prohealthpeptides.co.uk",
  // check-domains-allow-next-line: legacy host, musi tu zostać żeby zadziałał 301 do www.phlabs.co.uk
  "www.prohealthpeptides.co.uk",
]);

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "x-xss-protection": "0",
};

// ==================== Bot management + Prerender.io ====================
const PRERENDER_ORIGIN = "https://service.prerender.io";
const PRERENDER_TIMEOUT_MS = 15_000;
const PRERENDER_CACHE_TTL = 3600;
const PRERENDER_SWR_TTL = 86_400;
const LOOP_HEADER = "x-prerender-loop";

// Pliki/ścieżki, dla których nigdy nie wołamy prerendera
const STATIC_EXT = /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|xml|txt|json|wasm|zip)(\?|$)/i;
const BYPASS_PATH_PREFIXES = ["/api/", "/_build/", "/assets/", "/static/", "/__health"];

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

const BLOCKED_BOTS = [
  "baiduspider", "360spider", "sogou", "sogouspider",
  "yandexbot", "yandeximages", "petalbot", "aspiegelbot",
  "python-requests", "scrapy", "curl/", "wget", "httpclient",
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

function decoratePrerender(resp: Response, fromCache: boolean, method: string): Response {
  const headers = new Headers(resp.headers);
  headers.set("x-prerendered", "true");
  headers.set("x-prerender-cache", fromCache ? "HIT" : "MISS");
  headers.set("x-robots-tag", "noarchive");
  headers.set("vary", "user-agent");
  const body = method === "HEAD" ? null : resp.body;
  return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
}

function applySecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  // Only decorate HTML — leaving JSON/XML/asset responses untouched avoids
  // breaking sitemap, JSON-LD endpoints, and prerender.io content sniffing.
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function brandedErrorResponse(): Response {
  return applySecurityHeaders(
    new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
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
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerCtx) {
    const start = Date.now();
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

      // 1. Canonical host redirect (apex + legacy brand domains → www.phlabs.co.uk).
      const reqHost = url.hostname.toLowerCase();
      if (REDIRECT_HOSTS.has(reqHost)) {
        const dest = new URL(url.toString());
        dest.hostname = CANONICAL_HOST;
        dest.protocol = "https:";
        dest.port = "";
        log.info({ event: "worker.redirect", status: 301, reason: "canonical-host", to: dest.toString(), ...baseFields });
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

      // 3. Bot management
      const rawUa = request.headers.get("user-agent") || "";
      const method = request.method.toUpperCase();

      // 3a. Block scrapers / malicious UAs
      if (RX_BLOCKED.test(rawUa) && !request.headers.get(LOOP_HEADER)) {
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
      const isPrerenderBot = RX_PRERENDER.test(rawUa);
      const isLoop = request.headers.has(LOOP_HEADER);
      const token = env?.PRERENDER_TOKEN;

      if (token && isHtmlMethod && isPrerenderBot && !bypassPath && !isStatic && !isLoop) {
        const normalized = normalizePrerenderUrl(url);
        const target = `${PRERENDER_ORIGIN}/${normalized}`;
        const cache = (caches as unknown as { default: Cache }).default;
        const cacheKey = new Request(target, { method: "GET", headers: { accept: "text/html" } });

        const cached = await cache.match(cacheKey);
        if (cached) {
          if (env.PRERENDER_LOG === "1") log.info({ event: "worker.prerender.hit", ...baseFields });
          const ms = Date.now() - start;
          log.info({ event: "worker.request", status: cached.status, ms, prerender: "HIT", ...baseFields });
          return decoratePrerender(cached, true, method);
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
              return decoratePrerender(cacheable, false, method);
            }
            const ms = Date.now() - start;
            log.info({ event: "worker.request", status: fresh.status, ms, prerender: "PASS", ...baseFields });
            return decoratePrerender(fresh, false, method);
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
      const normalized = applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
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
      return brandedErrorResponse();
    }
  },
};
