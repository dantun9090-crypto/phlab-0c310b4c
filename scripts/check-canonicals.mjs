#!/usr/bin/env node
/**
 * Canonical uniqueness checker.
 *
 * For every URL in /sitemap.xml plus the critical list, fetches the HTML
 * and asserts:
 *   - exactly ONE <link rel="canonical"> tag in the document head
 *   - canonical href is absolute and on the project apex (https://phlabs.co.uk)
 *   - canonical href self-references the fetched URL (ignoring trailing slash
 *     and utm_* / gclid / fbclid query params)
 *   - if <meta property="og:url"> is present, it matches the canonical
 *
 * Catches regressions like the /research canonical leaking into pillar
 * pages (/research/bpc-157-uk emitting two canonicals).
 *
 *   BASE=https://phlabs.co.uk node scripts/check-canonicals.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = (process.env.BASE ?? "https://phlabs.co.uk").replace(/\/$/, "");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const LIMIT = Number(process.env.LIMIT ?? 500);
const REPORT_PATH =
  process.env.CANONICAL_REPORT_PATH ?? "/tmp/canonicals-report.json";
const ALLOWED_HOSTS = new Set([new URL(BASE).host, "phlabs.co.uk"]);

const UA = "PHLabsCanonicalChecker/1.0 (+https://phlabs.co.uk; ops)";

const CRITICAL = [
  "/",
  "/products",
  "/research",
  "/resources",
  "/about",
  "/contact",
  "/lab-reports",
  "/quality-control",
  "/storage-guide",
  "/shipping-policy",
  "/refund-policy",
  "/terms-and-conditions",
  "/privacy-policy",
  "/cookies",
];

const STRIP_PARAMS = /^(utm_|gclid$|fbclid$|mc_|ref$)/i;

function normalize(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (STRIP_PARAMS.test(k)) url.searchParams.delete(k);
    }
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const search = url.searchParams.toString();
    return `${url.protocol}//${url.host}${path}${search ? "?" + search : ""}`;
  } catch {
    return u;
  }
}

async function probe(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html")) {
      return { url, status: res.status, verdict: "skip", reason: "not html" };
    }
    const body = await res.text();
    const canonicals = Array.from(
      body.matchAll(
        /<link[^>]+rel=["']canonical["'][^>]*?\bhref=["']([^"']+)["']/gi,
      ),
    ).map((m) => m[1]);
    const ogUrlMatch = body.match(
      /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
    );
    const ogUrl = ogUrlMatch ? ogUrlMatch[1] : "";

    const issues = [];
    if (canonicals.length === 0) {
      issues.push("missing canonical");
    } else if (canonicals.length > 1) {
      issues.push(`${canonicals.length} canonicals: ${canonicals.join(" | ")}`);
    } else {
      const c = canonicals[0];
      let cu;
      try {
        cu = new URL(c);
      } catch {
        issues.push(`canonical not absolute: ${c}`);
      }
      if (cu) {
        if (!ALLOWED_HOSTS.has(cu.host)) {
          issues.push(`canonical host ${cu.host} not on apex`);
        }
        if (normalize(c) !== normalize(url)) {
          issues.push(`canonical not self-referential (${c} ≠ ${url})`);
        }
        if (ogUrl && normalize(ogUrl) !== normalize(c)) {
          issues.push(`og:url (${ogUrl}) ≠ canonical (${c})`);
        }
      }
    }

    return {
      url,
      status: res.status,
      canonicals,
      ogUrl,
      verdict: issues.length ? "fail" : "ok",
      reason: issues.join("; "),
    };
  } catch (e) {
    return { url, status: 0, verdict: "fail", reason: `fetch error: ${e}` };
  }
}

async function pool(items, worker, n) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx]);
      }
    }),
  );
  return out;
}

async function loadSitemap() {
  const r = await fetch(`${BASE}/sitemap.xml`, {
    headers: { "User-Agent": UA },
  });
  if (r.status !== 200) throw new Error(`/sitemap.xml returned ${r.status}`);
  const xml = await r.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
}

async function main() {
  console.log(`▶ Canonical uniqueness check against ${BASE}`);
  const sitemap = await loadSitemap();
  console.log(`  sitemap.xml → ${sitemap.length} URLs`);

  const all = Array.from(new Set([...CRITICAL, ...sitemap])).slice(0, LIMIT);
  console.log(`  checking ${all.length} URLs (concurrency=${CONCURRENCY})\n`);

  const results = await pool(all, probe, CONCURRENCY);
  const failed = results.filter((r) => r.verdict === "fail");

  for (const r of failed) {
    console.error(`  ✗ ${r.url} — ${r.reason}`);
  }

  console.log(
    `\n${results.length - failed.length}/${results.length} OK · ${failed.length} canonical issues`,
  );

  try {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          base: BASE,
          generatedAt: new Date().toISOString(),
          totals: { checked: results.length, failed: failed.length },
          results,
        },
        null,
        2,
      ),
    );
    console.log(`  report → ${REPORT_PATH}`);
  } catch (e) {
    console.warn(`  could not write report: ${e}`);
  }

  if (failed.length > 0) {
    console.error(`❌ FAIL — ${failed.length} canonical issue(s).`);
    process.exit(1);
  }
  console.log("✅ Every page has exactly one self-referential canonical.");
}

main().catch((e) => {
  console.error("check-canonicals crashed:", e);
  process.exit(1);
});
