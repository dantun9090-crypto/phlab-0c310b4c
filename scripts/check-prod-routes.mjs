#!/usr/bin/env node
/**
 * Production route checker.
 *
 * Crawls a small set of critical URLs PLUS every <loc> in /sitemap.xml
 * and fails (exit 1) if any:
 *   - returns a non-200 status (after following redirects), OR
 *   - carries `x-robots-tag: noindex` or `<meta name="robots" content="noindex">`
 *     while NOT explicitly signalling 404 or redirect.
 *
 * Why: a 200 OK that is silently `noindex` is exactly the `/compare/*`
 * regression class — Google drops the URL from the index. The only
 * legitimate carriers of noindex are 404 pages and 3xx redirects.
 *
 * A JSON report is written to $REPORT_PATH (default /tmp/prod-routes-report.json)
 * so downstream workflow steps can render a PR comment / step summary.
 *
 *   BASE=https://phlabs.co.uk node scripts/check-prod-routes.mjs
 *   CONCURRENCY=8 LIMIT=200 node scripts/check-prod-routes.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = (process.env.BASE ?? "https://phlabs.co.uk").replace(/\/$/, "");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const LIMIT = Number(process.env.LIMIT ?? 500);
const REPORT_PATH = process.env.REPORT_PATH ?? "/tmp/prod-routes-report.json";

const UA = "PHLabsProdRouteChecker/1.0 (+https://phlabs.co.uk; ops)";

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
  "/sitemap.xml",
  "/robots.txt",
  "/google-merchant-feed.xml",
  "/google-merchant-feed-free.xml",
];

async function probe(path, { fromSitemap = false } = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  try {
    // Step 1: see if this URL is a redirect (no-follow).
    const noFollow = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html,application/xml" },
    });
    const isRedirect = noFollow.status >= 300 && noFollow.status < 400;

    // Step 2: follow to terminal response so we know the real status.
    const res = isRedirect
      ? await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: { "User-Agent": UA, Accept: "text/html,application/xml" },
        })
      : noFollow;

    const status = res.status;
    const xRobots = res.headers.get("x-robots-tag") ?? "";
    const ctype = res.headers.get("content-type") ?? "";
    let metaRobots = "";
    if (ctype.includes("text/html")) {
      const body = await res.text();
      const m = body.match(
        /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i,
      );
      if (m) metaRobots = m[1];
    }
    const noindex =
      /noindex/i.test(xRobots) || /noindex/i.test(metaRobots);

    let verdict = "ok";
    let reason = "";
    if (status !== 200) {
      verdict = "fail";
      reason = `status ${status}`;
    } else if (noindex) {
      // Only legal if the terminal page is itself a 404 or this entry came
      // from a redirect. A 200 OK page may never carry noindex.
      if (fromSitemap) {
        verdict = "fail";
        reason = `sitemap URL noindex (${xRobots || metaRobots})`;
      } else if (!isRedirect) {
        verdict = "fail";
        reason = `noindex on 200 (${xRobots || metaRobots})`;
      }
    }
    return {
      url,
      status,
      xRobots,
      metaRobots,
      redirected: isRedirect,
      fromSitemap,
      verdict,
      reason,
    };
  } catch (e) {
    return {
      url,
      status: 0,
      xRobots: "",
      metaRobots: "",
      redirected: false,
      fromSitemap,
      verdict: "fail",
      reason: `fetch error: ${String(e)}`,
    };
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
  if (r.status !== 200) {
    throw new Error(`/sitemap.xml returned ${r.status}`);
  }
  const xml = await r.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
}

async function main() {
  console.log(`▶ Production route check against ${BASE}`);

  const sitemapUrls = await loadSitemap();
  console.log(`  sitemap.xml → ${sitemapUrls.length} URLs`);

  const critical = CRITICAL.map((p) => ({ path: p, fromSitemap: false }));
  const sitemap = sitemapUrls.map((u) => ({ path: u, fromSitemap: true }));
  const seen = new Set();
  const queue = [];
  for (const item of [...critical, ...sitemap]) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    queue.push(item);
    if (queue.length >= LIMIT) break;
  }
  console.log(`  checking ${queue.length} URLs (concurrency=${CONCURRENCY})\n`);

  const results = await pool(
    queue,
    (item) => probe(item.path, { fromSitemap: item.fromSitemap }),
    CONCURRENCY,
  );

  const failed = results.filter((r) => r.verdict === "fail");
  for (const r of failed) {
    console.error(`  ✗ ${r.status || "ERR"} ${r.url} — ${r.reason}`);
  }

  console.log(
    `\n${results.length - failed.length}/${results.length} OK · ${failed.length} failed`,
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
    console.error(`❌ FAIL — ${failed.length} route(s) failed.`);
    process.exit(1);
  }
  console.log("✅ All production routes return 200 and are indexable.");
}

main().catch((e) => {
  console.error("check-prod-routes crashed:", e);
  process.exit(1);
});
