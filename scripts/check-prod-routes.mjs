#!/usr/bin/env node
/**
 * Production route checker.
 *
 * Crawls a small set of critical URLs PLUS every <loc> in /sitemap.xml
 * and fails (exit 1) if any returns a non-200 status. Run after deploy
 * (see .github/workflows/post-deploy-regression.yml) so a regression
 * like the splat 404 override or an SSR ReferenceError is caught before
 * users do.
 *
 *   BASE=https://phlabs.co.uk node scripts/check-prod-routes.mjs
 *   CONCURRENCY=8 LIMIT=200 node scripts/check-prod-routes.mjs
 */
const BASE = (process.env.BASE ?? "https://phlabs.co.uk").replace(/\/$/, "");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const LIMIT = Number(process.env.LIMIT ?? 500);

const UA =
  "PHLabsProdRouteChecker/1.0 (+https://phlabs.co.uk; ops)";

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

async function head(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "*/*" },
    });
    // Some routes don't implement HEAD — retry with a small GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": UA, Accept: "text/html,application/xml" },
      });
    }
    return {
      url,
      status: res.status,
      xRobots: res.headers.get("x-robots-tag") ?? "",
    };
  } catch (e) {
    return { url, status: 0, error: String(e) };
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

  const all = Array.from(new Set([...CRITICAL, ...sitemapUrls])).slice(
    0,
    LIMIT,
  );
  console.log(`  checking ${all.length} URLs (concurrency=${CONCURRENCY})\n`);

  const results = await pool(all, head, CONCURRENCY);
  const bad = results.filter((r) => r.status !== 200);
  const noindexed = results.filter((r) =>
    /noindex/i.test(r.xRobots ?? ""),
  );

  for (const r of bad) {
    console.error(`  ✗ ${r.status} ${r.url}${r.error ? " " + r.error : ""}`);
  }
  for (const r of noindexed) {
    // x-robots-tag: noindex on a sitemap URL is just as broken as a 404,
    // because Google will drop it from the index.
    if (!bad.includes(r)) {
      console.error(`  ✗ noindex ${r.url} (x-robots-tag: ${r.xRobots})`);
    }
  }

  const failed = bad.length + noindexed.filter((r) => !bad.includes(r)).length;
  console.log(
    `\n${all.length - failed}/${all.length} OK · ${bad.length} non-200 · ${noindexed.length} noindex`,
  );

  if (failed > 0) {
    console.error(`❌ FAIL — ${failed} route(s) failed.`);
    process.exit(1);
  }
  console.log("✅ All production routes return 200 and are indexable.");
}

main().catch((e) => {
  console.error("check-prod-routes crashed:", e);
  process.exit(1);
});
