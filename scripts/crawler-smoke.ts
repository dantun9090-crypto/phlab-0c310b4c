#!/usr/bin/env bun
/**
 * Crawler / SEO smoke tests.
 *
 * Verifies, against the live production origin:
 *   1. www → apex 301/308 redirect (path preserved)
 *   2. prohealthpeptides.co.uk → apex 301/308 redirect
 *   3. /robots.txt: 200, lists Sitemap, allows /, disallows /admin /checkout
 *      /payment /account /api, blocks AdsBot-Google
 *   4. /sitemap.xml: 200, valid XML, contains apex URLs and at least one
 *      product entry
 *   5. Prerender output for key routes against common crawler UAs
 *      (Googlebot, Bingbot, Facebook, Twitter, LinkedIn) returns a full
 *      HTML document with the expected <title> + body content (i.e. the
 *      prerender Worker is actually serving rendered HTML, not the JS shell).
 *
 * Run via:    bun scripts/crawler-smoke.ts
 * Override:   SMOKE_BASE_URL=https://phlab.lovable.app bun scripts/crawler-smoke.ts
 * Skip CI:    SKIP_CRAWLER_SMOKE=1 bun scripts/crawler-smoke.ts
 */

const BASE = process.env.SMOKE_BASE_URL ?? "https://phlabs.co.uk";
const APEX_HOST = new URL(BASE).host;

if (process.env.SKIP_CRAWLER_SMOKE === "1") {
  console.log("⏭  SKIP_CRAWLER_SMOKE=1 — skipping crawler smoke tests");
  process.exit(0);
}

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? " — " + detail : ""}`);
}

const CRAWLER_UAS: Record<string, string> = {
  Googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  Bingbot:
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  Facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Twitter: "Twitterbot/1.0",
  LinkedIn: "LinkedInBot/1.0 (compatible; Mozilla/5.0; +https://www.linkedin.com)",
};

const PRERENDER_ROUTES: Array<{ path: string; needles: string[] }> = [
  { path: "/", needles: ["<title>", "PH Labs"] },
  { path: "/products", needles: ["<title>", "Research"] },
  { path: "/products/bpc-157", needles: ["<title>", "BPC"] },
  { path: "/about", needles: ["<title>", "About"] },
  { path: "/contact", needles: ["<title>", "Contact"] },
];

const REDIRECT_ROUTES = ["/", "/products", "/about", "/sitemap.xml", "/robots.txt"];

async function checkRedirect(fromHost: string, label: string) {
  for (const path of REDIRECT_ROUTES) {
    const url = `https://${fromHost}${path}`;
    try {
      const res = await fetch(url, { redirect: "manual" });
      const loc = res.headers.get("location") ?? "";
      const ok =
        (res.status === 301 || res.status === 308) &&
        loc.startsWith(`https://${APEX_HOST}`) &&
        new URL(loc).pathname === path;
      record(
        `${label} ${path}`,
        ok,
        ok ? `${res.status} → ${loc}` : `status=${res.status} loc=${loc}`,
      );
    } catch (e) {
      record(`${label} ${path}`, false, String(e));
    }
  }
}

async function checkRobots() {
  try {
    const res = await fetch(`${BASE}/robots.txt`);
    const body = await res.text();
    const checks: Array<[string, boolean]> = [
      ["status 200", res.status === 200],
      ["has Sitemap directive", /Sitemap:\s*https:\/\//i.test(body)],
      ["allows /", /Allow:\s*\/\s*$/im.test(body) || /User-agent:\s*\*/i.test(body)],
      ["disallows /admin", /Disallow:\s*\/admin/i.test(body)],
      ["disallows /checkout", /Disallow:\s*\/checkout/i.test(body)],
      ["disallows /payment", /Disallow:\s*\/payment/i.test(body)],
      ["disallows /account", /Disallow:\s*\/account/i.test(body)],
      ["disallows /api", /Disallow:\s*\/api/i.test(body)],
      ["blocks AdsBot-Google", /User-agent:\s*AdsBot-Google\b/i.test(body)],
    ];
    for (const [name, ok] of checks) {
      record(`robots.txt: ${name}`, ok);
    }
  } catch (e) {
    record("robots.txt: fetch", false, String(e));
  }
}

async function checkSitemap() {
  try {
    const res = await fetch(`${BASE}/sitemap.xml`);
    const body = await res.text();
    record("sitemap.xml: status 200", res.status === 200);
    record(
      "sitemap.xml: content-type xml",
      /xml/i.test(res.headers.get("content-type") ?? ""),
    );
    record(
      "sitemap.xml: valid <urlset>",
      body.includes("<urlset") && body.includes("</urlset>"),
    );
    record(
      "sitemap.xml: contains apex URLs",
      body.includes(`https://${APEX_HOST}/`),
    );
    record(
      "sitemap.xml: contains /products entries",
      body.includes(`https://${APEX_HOST}/products`),
    );
    const urlCount = (body.match(/<url>/g) ?? []).length;
    record(
      "sitemap.xml: at least 5 <url> entries",
      urlCount >= 5,
      `found ${urlCount}`,
    );
  } catch (e) {
    record("sitemap.xml: fetch", false, String(e));
  }
}

async function checkPrerender() {
  for (const [uaName, ua] of Object.entries(CRAWLER_UAS)) {
    for (const { path, needles } of PRERENDER_ROUTES) {
      try {
        const res = await fetch(`${BASE}${path}`, {
          headers: { "User-Agent": ua, Accept: "text/html" },
          redirect: "follow",
        });
        const body = await res.text();
        const has = needles.every((n) => body.toLowerCase().includes(n.toLowerCase()));
        const sized = body.length > 2000; // shell is ~1–2 KB; prerender ≫ that
        const ok = res.status === 200 && has && sized;
        record(
          `prerender [${uaName}] ${path}`,
          ok,
          `status=${res.status} size=${body.length} needles=${has}`,
        );
      } catch (e) {
        record(`prerender [${uaName}] ${path}`, false, String(e));
      }
    }
  }
}

async function main() {
  console.log(`▶ Crawler smoke against ${BASE}\n`);
  await checkRedirect(`www.${APEX_HOST}`, "www→apex");
  await checkRedirect("prohealthpeptides.co.uk", "legacy→apex");
  await checkRobots();
  await checkSitemap();
  await checkPrerender();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length > 0) {
    console.error(`❌ ${failed.length} failed`);
    process.exit(1);
  }
  console.log("✅ All crawler / SEO smoke checks passed");
}

main().catch((e) => {
  console.error("crawler-smoke crashed:", e);
  process.exit(1);
});
