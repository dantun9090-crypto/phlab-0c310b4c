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
  const allSame = new Set(times).size === 1;
  const latestIso = new Date(latest).toISOString().slice(0, 10);
  if (ageH > 24 && allSame) return fail(`all lastmod identical=${latestIso}, age=${ageH.toFixed(1)}h`);
  if (ageH > 24) return fail(`latest lastmod=${latestIso}, age=${ageH.toFixed(1)}h (>24h)`);
  return pass(`latest lastmod=${latestIso} (${ageH.toFixed(1)}h ago, ${dates.length} urls)`);
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

  // F: ttl-0 on 1st fetch
  const phl1 = r1?.headers.get("x-phl-cache") || "";
  const ttl = phl1.includes("skip;reason=ttl-0")
    ? fail(`1st fetch x-phl-cache=${phl1}`)
    : pass(phl1 ? `1st x-phl-cache=${phl1}` : "no x-phl-cache header (1st)");

  // D: cf edge cache on 2nd
  const cf2 = (r2?.headers.get("cf-cache-status") || "").toUpperCase();
  const edge =
    cf2 === "HIT" || cf2 === "REVALIDATED"
      ? pass(`cf-cache-status=${cf2}`)
      : fail(`cf-cache-status=${cf2 || "missing"}`);

  // E: worker internal cache on 2nd
  const phl2 = r2?.headers.get("x-phl-cache") || "";
  const phl2L = phl2.toLowerCase();
  const worker =
    phl2L.includes("hit") && !phl2L.includes("inner=miss")
      ? pass(`x-phl-cache=${phl2}`)
      : fail(`x-phl-cache=${phl2 || "missing"}`);

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
