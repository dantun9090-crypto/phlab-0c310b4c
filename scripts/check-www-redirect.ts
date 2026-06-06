#!/usr/bin/env bun
/**
 * CI guard: www.phlabs.co.uk MUST 301/308 redirect to https://phlabs.co.uk
 * for every key route. Fails the build if any route returns a non-redirect
 * status or points to the wrong canonical host.
 *
 * Skip locally with SKIP_WWW_REDIRECT_CHECK=1 (e.g. offline dev).
 */

const APEX = "https://phlabs.co.uk";
const WWW = "https://www.phlabs.co.uk";

const ROUTES = [
  "/",
  "/products",
  "/about",
  "/contact",
  "/faq",
  "/resources",
  "/sitemap.xml",
  "/robots.txt",
];

const ACCEPTABLE = new Set([301, 308]);

if (process.env.SKIP_WWW_REDIRECT_CHECK === "1") {
  console.log("⏭  SKIP_WWW_REDIRECT_CHECK=1 — skipping www→apex redirect check");
  process.exit(0);
}

type Failure = { url: string; reason: string };
const failures: Failure[] = [];

async function check(path: string) {
  const url = `${WWW}${path}`;
  try {
    const res = await fetch(url, { redirect: "manual" });
    if (!ACCEPTABLE.has(res.status)) {
      failures.push({ url, reason: `expected 301/308, got ${res.status}` });
      return;
    }
    const location = res.headers.get("location");
    if (!location) {
      failures.push({ url, reason: "redirect response has no Location header" });
      return;
    }
    const target = new URL(location, url);
    if (target.origin !== APEX) {
      failures.push({
        url,
        reason: `Location host = ${target.origin}, expected ${APEX}`,
      });
      return;
    }
    if (target.pathname !== path && !(path === "/" && target.pathname === "/")) {
      failures.push({
        url,
        reason: `path changed: ${path} → ${target.pathname}`,
      });
      return;
    }
    console.log(`✅ ${url} → ${res.status} ${location}`);
  } catch (err) {
    failures.push({ url, reason: `fetch failed: ${(err as Error).message}` });
  }
}

console.log(`🔎 Verifying www → apex redirect for ${ROUTES.length} routes…\n`);
await Promise.all(ROUTES.map(check));

if (failures.length) {
  console.error("\n❌ www → apex redirect check failed:");
  for (const f of failures) console.error(`  • ${f.url}: ${f.reason}`);
  process.exit(1);
}

console.log(`\n✅ All ${ROUTES.length} routes redirect www → apex correctly`);
