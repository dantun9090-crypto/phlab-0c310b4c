/**
 * Preflight — robots.txt Sitemap: directives must exactly match the set
 * of live sitemap feeds served by the app.
 *
 * Enforced invariants:
 *   1. Every `Sitemap:` URL in public/robots.txt uses the canonical
 *      SITE_URL host (no www., no legacy domain, no preview host).
 *   2. Every declared sitemap path corresponds to an existing route file
 *      under src/routes/ (so the URL actually resolves in production).
 *   3. Every sitemap-style feed route (sitemap.xml, bing-feed.xml) is
 *      listed — a new feed added without a matching robots entry fails.
 *   4. No stale entries — a robots directive with no backing route fails.
 *
 * Runs as part of `build:preflight`, so drift blocks the build.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { SITE_URL } from "../src/lib/seo-meta";

// Canonical set of sitemap feeds this project serves. Adding a new
// XML URL-feed route means adding it here AND to public/robots.txt.
const EXPECTED_SITEMAP_PATHS = ["/sitemap.xml", "/bing-feed.xml"] as const;

function routeFileFor(path: string): string {
  // "/sitemap.xml" -> src/routes/sitemap[.]xml.ts (TanStack escape).
  const clean = path.replace(/^\//, "").replace(/\.xml$/, "");
  return resolve(process.cwd(), `src/routes/${clean}[.]xml.ts`);
}

function extractSitemapDirectives(robots: string): string[] {
  const out: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i);
    if (m) out.push(m[1]);
  }
  return out;
}

function fail(msg: string): never {
  console.error(`❌ robots.txt ↔ sitemap drift: ${msg}`);
  process.exit(1);
}

function main() {
  const robotsPath = resolve(process.cwd(), "public/robots.txt");
  if (!existsSync(robotsPath)) fail("public/robots.txt not found");
  const robots = readFileSync(robotsPath, "utf8");

  const declared = extractSitemapDirectives(robots);
  if (declared.length === 0) fail("no Sitemap: directives in robots.txt");

  const expectedUrls = EXPECTED_SITEMAP_PATHS.map((p) => `${SITE_URL}${p}`);

  // 1) Host + path canonicalisation for every declared URL.
  for (const url of declared) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      fail(`Sitemap URL is not a valid absolute URL: "${url}"`);
    }
    const canonicalHost = new URL(SITE_URL).host;
    if (parsed.host !== canonicalHost) {
      fail(`Sitemap URL host "${parsed.host}" != canonical "${canonicalHost}" (${url})`);
    }
    if (parsed.protocol !== "https:") {
      fail(`Sitemap URL must be https (${url})`);
    }
  }

  // 2) Every declared path has a backing route file.
  for (const url of declared) {
    const path = new URL(url).pathname;
    const file = routeFileFor(path);
    if (!existsSync(file)) {
      fail(`Sitemap URL "${url}" has no backing route file (${file})`);
    }
  }

  // 3) Set equality with EXPECTED_SITEMAP_PATHS.
  const declaredSet = new Set(declared);
  const expectedSet = new Set(expectedUrls);
  const missing = expectedUrls.filter((u) => !declaredSet.has(u));
  const extra = declared.filter((u) => !expectedSet.has(u));
  if (missing.length) {
    fail(`missing Sitemap directive(s) in robots.txt: ${missing.join(", ")}`);
  }
  if (extra.length) {
    fail(`stale Sitemap directive(s) in robots.txt (no matching feed): ${extra.join(", ")}`);
  }

  console.log(
    `✅ robots.txt Sitemap directives match ${declared.length} served feed(s): ${declared.join(", ")}`,
  );
}

main();
