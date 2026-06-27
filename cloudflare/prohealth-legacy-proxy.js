/**
 * prohealthpeptides.co.uk legacy host proxy.
 *
 * Purpose: keep the legacy GMC/free-listings host live without allowing the
 * Lovable primary-domain redirect to send requests to phlabs.co.uk.
 *
 * - prohealthpeptides.co.uk/* proxies PH Labs content with the original URL
 *   staying on prohealthpeptides.co.uk.
 * - www.prohealthpeptides.co.uk/* redirects to the legacy apex, not phlabs.
 * - The free GMC feed is fetched from the main app and rewritten so item links
 *   point to the legacy apex.
 */

const LEGACY_HOST = "prohealthpeptides.co.uk";
const LEGACY_ORIGIN = `https://${LEGACY_HOST}`;
const MAIN_ORIGIN = "https://phlabs.co.uk";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
]);

const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-prohealth-legacy-proxy": "active",
};

function copyRequestHeaders(request) {
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set("x-forwarded-host", LEGACY_HOST);
  headers.set("x-forwarded-proto", "https");
  return headers;
}

function hardenHeaders(headers) {
  const out = new Headers(headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) out.set(key, value);
  out.delete("server");
  out.delete("x-powered-by");
  // Upstream cookies are scoped to phlabs.co.uk and are not valid for this
  // legacy host. Strip them to avoid leaking irrelevant cookie attributes into
  // GMC/browser checks on prohealthpeptides.co.uk.
  out.delete("set-cookie");
  const location = out.get("location");
  if (location) out.set("location", location.replaceAll(MAIN_ORIGIN, LEGACY_ORIGIN));
  return out;
}

function noStore(headers) {
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("cdn-cache-control", "no-store");
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("surrogate-control", "no-store");
}

async function proxyToMain(request, url) {
  const target = new URL(url.pathname + url.search, MAIN_ORIGIN);
  const init = {
    method: request.method,
    headers: copyRequestHeaders(request),
    redirect: "manual",
  };
  if (!(["GET", "HEAD"].includes(request.method))) init.body = request.body;

  const upstream = await fetch(target.toString(), init);
  const headers = hardenHeaders(upstream.headers);
  const contentType = (headers.get("content-type") || "").toLowerCase();

  // Rewrite phlabs.co.uk → prohealthpeptides.co.uk in all text payloads so
  // Google sees a fully isolated domain: distinct canonicals, og:url,
  // hreflang, sitemap <loc>, JSON-LD URLs, feed links, robots Sitemap line.
  // Without this rewrite Google folds the legacy host into phlabs.co.uk as
  // a duplicate and refuses to index it independently.
  const isTextual =
    contentType.includes("text/html") ||
    contentType.includes("xml") ||
    contentType.includes("json") ||
    contentType.includes("text/plain") ||
    url.pathname === "/robots.txt" ||
    url.pathname === "/sitemap.xml" ||
    url.pathname.endsWith(".xml");

  if (url.pathname === "/google-merchant-feed-free.xml") {
    const xml = await upstream.text();
    headers.set("content-type", "application/xml; charset=utf-8");
    headers.set("x-feed-legacy-host", LEGACY_HOST);
    noStore(headers);
    return new Response(xml.replaceAll(MAIN_ORIGIN, LEGACY_ORIGIN), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  if (isTextual) {
    let body = await upstream.text();
    body = body
      .replaceAll(`https://www.${new URL(MAIN_ORIGIN).hostname}`, LEGACY_ORIGIN)
      .replaceAll(MAIN_ORIGIN, LEGACY_ORIGIN)
      .replaceAll(`//${new URL(MAIN_ORIGIN).hostname}`, `//${LEGACY_HOST}`);
    headers.set("x-prohealth-rewrite", "1");
    if (contentType.includes("text/html")) noStore(headers);
    // content-length will be stale after rewrite
    headers.delete("content-length");
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (host === `www.${LEGACY_HOST}`) {
      url.hostname = LEGACY_HOST;
      url.protocol = "https:";
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }

    if (host !== LEGACY_HOST) {
      return new Response("Not found", { status: 404 });
    }

    try {
      return await proxyToMain(request, url);
    } catch {
      return new Response("Temporary upstream error", {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "retry-after": "30",
          ...SECURITY_HEADERS,
        },
      });
    }
  },
};