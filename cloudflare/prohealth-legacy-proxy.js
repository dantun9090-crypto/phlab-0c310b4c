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

  if ((headers.get("content-type") || "").includes("text/html")) {
    // Avoid pinning an HTML shell on the legacy host while the domain is being
    // set up and reviewed in Merchant Center.
    noStore(headers);
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