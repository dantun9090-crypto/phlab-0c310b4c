#!/usr/bin/env bun
/**
 * Build-time guard: compares sitemap static entries against actual route files
 * under src/routes/, and flags:
 *   - Stale sitemap entries: paths in src/lib/sitemap-entries.ts (static list)
 *     that don't map to any route file.
 *   - Missing sitemap entries: public indexable static route files that are
 *     not listed in the static sitemap (dynamic $param routes are skipped —
 *     they're populated by the async generator in sitemap-entries.ts).
 *
 * Runs offline, no network. Exits 1 on drift.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ROUTES_DIR = join(ROOT, "src/routes");
const SITEMAP_LIB = join(ROOT, "src/lib/sitemap-entries.ts");
const POLICY_LIB = join(ROOT, "src/lib/sitemap-policy.ts");

// ---------- 1. Parse static entries from sitemap-entries.ts ----------
const sitemapSrc = readFileSync(SITEMAP_LIB, "utf8");
const staticBlockMatch = sitemapSrc.match(
  /function buildStaticEntries[\s\S]*?return \[([\s\S]*?)\];\s*\}/,
);
if (!staticBlockMatch) {
  console.error("[sitemap-routes] Could not locate buildStaticEntries() in sitemap-entries.ts");
  process.exit(1);
}
const staticPaths = new Set<string>();
for (const m of staticBlockMatch[1].matchAll(/path:\s*"([^"]+)"/g)) {
  staticPaths.add(m[1]);
}

// ---------- 2. Inspect route files ----------
function listRouteFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listRouteFiles(join(dir, entry.name), rel));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Convert a TanStack Start route filename (relative to src/routes) into the
 * URL path it serves, or null if it isn't a page route (e2e fixtures, layout
 * wrappers, api/*, splats, XML/txt endpoints, etc).
 */
function routeFileToPath(file: string): string | null {
  // Skip TanStack internals / non-page routes.
  if (file.startsWith("api/")) return null;
  if (file.startsWith("__")) return null;             // __root, __e2e.*
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return null;

  // Strip extension.
  let name = file.replace(/\.(ts|tsx)$/, "");

  // Escaped-dot suffix (e.g. sitemap[.]xml) → non-HTML endpoint, skip.
  if (name.includes("[.]")) return null;

  // Splat catch-all.
  if (name === "$" || name.endsWith("/$") || name.endsWith(".$")) return null;

  // Layout / pathless routes (leading underscore segment) — treat as layout,
  // their leaves are separate files. Skip the layout wrapper itself.
  const segments = name.split("/");
  const leaf = segments[segments.length - 1];
  if (leaf.startsWith("_") && !leaf.includes(".")) return null;

  // Convert flat dot-separated filename into slash URL.
  // - `_marketing.compound` → `_marketing/compound`
  // - `research.index` → `research/index`
  // - `products_.$slug` → `products_/$slug`  (trailing _ before dot = suffix)
  let urlPath = leaf.replace(/\./g, "/");

  // Reassemble with folder prefix if the file was nested.
  if (segments.length > 1) {
    urlPath = segments.slice(0, -1).join("/") + "/" + urlPath;
  }

  // Drop pathless layout segments from URL (segments starting with `_`).
  urlPath = urlPath
    .split("/")
    .filter((s) => !s.startsWith("_"))
    .join("/");

  // `index` leaf → parent path.
  urlPath = urlPath.replace(/\/index$/, "").replace(/^index$/, "");

  // Dynamic $param routes — not static, generator handles them.
  if (urlPath.includes("$")) return null;

  // TanStack's `products_.$slug` uses trailing `_` to break out of a layout;
  // strip it for URL comparison.
  urlPath = urlPath.replace(/_(\/|$)/g, "$1");

  urlPath = "/" + urlPath.replace(/^\/+/, "");
  if (urlPath !== "/" && urlPath.endsWith("/")) urlPath = urlPath.slice(0, -1);
  return urlPath;
}

const routeFiles = listRouteFiles(ROUTES_DIR);
const routePaths = new Set<string>();
const dynamicRouteFiles: string[] = [];
for (const f of routeFiles) {
  const p = routeFileToPath(f);
  if (p) routePaths.add(p);
  else if (f.includes("$") && !f.startsWith("api/") && !f.startsWith("__")) {
    dynamicRouteFiles.push(f);
  }
}

// ---------- 3. Reuse the runtime policy for indexability ----------
// Cheap re-implementation so we don't have to boot the TS module graph. Keep
// TRANSACTIONAL_PREFIXES + NEVER_INDEX_EXACT in sync manually — the CI test
// `tests/sitemap-policy-consistency.test.ts` already covers deeper checks.
const policySrc = readFileSync(POLICY_LIB, "utf8");
const transactional =
  [...policySrc.matchAll(/"(\/[a-z-]+)"[,\s]/g)]
    .map((m) => m[1])
    .filter((p) =>
      /\/(cart|checkout|payment|account|login|register|admin|api|webhook|server-functions|lovable|vip-store)$/.test(
        p,
      ),
    );
const neverIndex = new Set<string>(["/search", "/not-found", "/$"]);

function isLikelyIndexable(path: string): boolean {
  if (neverIndex.has(path)) return false;
  for (const prefix of transactional) {
    if (path === prefix || path.startsWith(prefix + "/")) return false;
  }
  // Skip obviously private/utility page routes we don't want in sitemap.
  if (/^\/(install|request-catalog|privacy-requests|search|sentry-test)$/.test(path)) return false;
  // Wallid redirect aliases → canonical /checkout/* routes; not indexable.
  if (path === "/order/success" || path === "/order/cancel" || path === "/order/cancelled") return false;
  // MCP server + its OAuth/discovery companion routes are machine endpoints,
  // not indexable pages.
  if (path === "/mcp" || path.startsWith("/[.mcp]/") || path.startsWith("/[.well-known]/")) return false;
  return true;
}

// ---------- 4. Compare ----------
const stale: string[] = [];
for (const p of staticPaths) {
  if (!routePaths.has(p)) stale.push(p);
}

const missing: string[] = [];
for (const p of routePaths) {
  if (!isLikelyIndexable(p)) continue;
  if (staticPaths.has(p)) continue;
  missing.push(p);
}

// ---------- 5. Report ----------
let failed = false;
if (stale.length) {
  failed = true;
  console.error("\n❌ Stale sitemap entries (no matching route file):");
  for (const p of stale) console.error(`   - ${p}`);
  console.error("   → Remove from buildStaticEntries() in src/lib/sitemap-entries.ts");
}
if (missing.length) {
  failed = true;
  console.error("\n❌ Missing sitemap entries (route exists but not indexed):");
  for (const p of missing) console.error(`   - ${p}`);
  console.error("   → Add to buildStaticEntries() in src/lib/sitemap-entries.ts");
  console.error("     (or add prefix to isLikelyIndexable() if intentionally excluded)");
}

if (failed) {
  console.error("\nSitemap ↔ route drift detected.");
  process.exit(1);
}

console.log(
  `✅ Sitemap in sync: ${staticPaths.size} static entries, ${routePaths.size} static routes, ${dynamicRouteFiles.length} dynamic route files (handled by generator).`,
);
