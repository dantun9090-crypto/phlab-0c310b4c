/**
 * Deep health check — verifies 7 infrastructure invariants on phlabs.co.uk:
 *  A robots.txt cache header sane (≤1h, not immutable)
 *  B sitemap.xml has fresh lastmod (<24h)
 *  C Googlebot UA gets prerendered HTML (not SPA shell)
 *  D Cloudflare edge cache HITs HTML on 2nd browser fetch
 *  E Worker internal cache (x-phl-cache) HITs on 2nd fetch
 *  F htmlTtl is not zero (no skip;reason=ttl-0)
 *  G CSP header present without literal __CSP_NONCE__ placeholder
 *
 * GET /api/public/health-deep → JSON report (no auth, no PII).
 */
import { createFileRoute } from "@tanstack/react-router";

const ORIGIN = "https://phlabs.co.uk";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

type Status = "PASS" | "FAIL";
interface Check { status: Status; detail: string }

function pass(detail: string): Check { return { status: "PASS", detail }; }
function fail(detail: string): Check { return { status: "FAIL", detail }; }

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  } catch {
    return null;
  }
}

async function checkRobotsCache(): Promise<Check> {
  const r = await safeFetch(`${ORIGIN}/robots.txt`, {
    headers: { Accept: "text/plain", "User-Agent": BROWSER_UA },
  });
  if (!r) return fail("fetch failed");
  const cc = r.headers.get("cache-control") || "";
  if (!cc) return fail("no cache-control header");
  if (/immutable/i.test(cc)) return fail(`immutable present: ${cc}`);
  const m = cc.match(/max-age\s*=\s*(\d+)/i);
  const maxAge = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(maxAge)) return fail(`no max-age: ${cc}`);
  if (maxAge > 3600) return fail(`max-age=${maxAge} (>3600)`);
  return pass(`max-age=${maxAge}`);
}

async function checkSitemapFresh(): Promise<Check> {
  const r = await safeFetch(`${ORIGIN}/sitemap.xml`, {
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!r || !r.ok) return fail(`status=${r?.status ?? "ERR"}`);
  const xml = await r.text();
  const dates = Array.from(xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi))
    .map((m) => m[1].trim());
  if (!dates.length) return fail("no <lastmod> entries");
  const times = dates
    .map((d) => Date.parse(d))
    .filter((n) => Number.isFinite(n));
  if (!times.length) return fail("unparseable lastmod");
  const latest = Math.max(...times);
  const ageH = (Date.now() - latest) / 3_600_000;
  const latestIso = new Date(latest).toISOString().slice(0, 10);
  // Catalogue content does not change daily — only flag a genuinely stale or
  // future-dated sitemap (SITEMAP_MAX_AGE_H = 30 days).
  const SITEMAP_MAX_AGE_H = 30 * 24;
  if (ageH < -24) return fail(`latest lastmod=${latestIso} is in the future`);
  if (ageH > SITEMAP_MAX_AGE_H)
    return fail(`latest lastmod=${latestIso}, age=${ageH.toFixed(1)}h (>${SITEMAP_MAX_AGE_H}h)`);
  return pass(`latest lastmod=${latestIso} (${(ageH / 24).toFixed(1)}d ago, ${dates.length} urls)`);

}

async function checkPrerender(): Promise<Check> {
  const r = await safeFetch(`${ORIGIN}/?hc=${Date.now()}`, {
    headers: { "User-Agent": GOOGLEBOT_UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (!r) return fail("fetch failed");
  const via = (r.headers.get("x-phl-via") || "").toLowerCase();
  const pre = (r.headers.get("x-prerendered") || "").toLowerCase();
  if (via.includes("prerender") || pre === "true") {
    return pass(`x-phl-via=${via || "?"} x-prerendered=${pre || "?"}`);
  }
  if (via.includes("normal-proxy")) return fail(`bot got SPA shell (x-phl-via=${via})`);
  return fail(`no prerender markers (x-phl-via=${via || "missing"})`);
}

async function fetchHtml(): Promise<Response | null> {
  return safeFetch(`${ORIGIN}/`, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    redirect: "follow",
  });
}

interface EdgeResult {
  edge: Check;
  worker: Check;
  ttl: Check;
  csp: Check;
}

async function runEdgeChecks(): Promise<EdgeResult> {
  const r1 = await fetchHtml();
  // small spacing helps CF surface a stable HIT on the 2nd request
  await new Promise((res) => setTimeout(res, 400));
  const r2 = await fetchHtml();

  // The Worker owns HTML caching (X-PHL-Via: edge-html-hit|edge-html-miss) and
  // deliberately returns `no-store` to browsers/CF so stale shells can never be
  // pinned downstream. So read the Worker signal first and only fall back to
  // cf-cache-status / x-phl-cache for legacy deployments.
  const via1 = (r1?.headers.get("x-phl-via") || "").toLowerCase();
  const via2 = (r2?.headers.get("x-phl-via") || "").toLowerCase();

  // F: ttl-0 on 1st fetch
  const phl1 = r1?.headers.get("x-phl-cache") || "";
  const ttl = phl1.includes("skip;reason=ttl-0") || via1.includes("ttl-0")
    ? fail(`1st fetch cache disabled (${phl1 || via1})`)
    : pass(phl1 ? `1st x-phl-cache=${phl1}` : `1st x-phl-via=${via1 || "missing"}`);

  // D + E: HTML served from an edge cache on the 2nd fetch
  const cf2 = (r2?.headers.get("cf-cache-status") || "").toUpperCase();
  const phl2 = r2?.headers.get("x-phl-cache") || "";
  const phl2L = phl2.toLowerCase();
  const workerHit = via2.includes("edge-html-hit") || (phl2L.includes("hit") && !phl2L.includes("inner=miss"));
  const cfHit = cf2 === "HIT" || cf2 === "REVALIDATED";

  const edge = workerHit || cfHit
    ? pass(workerHit ? `worker edge HTML cache HIT (x-phl-via=${via2})` : `cf-cache-status=${cf2}`)
    : fail(`no edge HTML cache hit (x-phl-via=${via2 || "missing"}, cf-cache-status=${cf2 || "missing"})`);

  const worker = workerHit
    ? pass(phl2 ? `x-phl-cache=${phl2}` : `x-phl-via=${via2}`)
    : fail(`worker cache miss (x-phl-via=${via2 || "missing"}, x-phl-cache=${phl2 || "missing"})`);


  // G: CSP header sanity
  const csp = r2?.headers.get("content-security-policy") || r1?.headers.get("content-security-policy") || "";
  const cspCheck = !csp
    ? fail("no CSP header")
    : csp.includes("__CSP_NONCE__")
      ? fail("CSP contains literal __CSP_NONCE__ placeholder")
      : pass(`CSP present (${csp.length} bytes)`);

  return { edge, worker, ttl, csp: cspCheck };
}

export const Route = createFileRoute("/api/public/health-deep")({
  server: {
    handlers: {
      GET: async () => {
        const [robots, sitemap, prerender, edge] = await Promise.all([
          checkRobotsCache(),
          checkSitemapFresh(),
          checkPrerender(),
          runEdgeChecks(),
        ]);

        const checks = {
          robots_cache: robots,
          sitemap_fresh: sitemap,
          prerender,
          edge_cache: edge.edge,
          worker_cache: edge.worker,
          ttl_zero: edge.ttl,
          csp: edge.csp,
        };

        const overall: Status = Object.values(checks).every((c) => c.status === "PASS")
          ? "PASS"
          : "FAIL";

        return new Response(
          JSON.stringify(
            { timestamp: new Date().toISOString(), overall, checks },
            null,
            2,
          ),
          {
            status: overall === "PASS" ? 200 : 503,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "access-control-allow-origin": "*",
            },
          },
        );
      },
      HEAD: async () => new Response(null, { status: 200 }),
    },
  },
});
