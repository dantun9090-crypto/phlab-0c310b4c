#!/usr/bin/env bun
/**
 * Guard: /peptide-calculator and /calculator (and any subpath) must be
 * fully decommissioned.
 *
 *   1. robots.txt and every discovered sitemap*.xml must contain zero
 *      "calculator" strings. (They are NOT Disallowed in robots — Google
 *      must be able to crawl them to see the 410 + noindex and drop them
 *      from the index.)
 *   2. GET /peptide-calculator and /calculator (and a subpath probe) must
 *      return HTTP 410 (preferred) or 404 with `x-robots-tag` containing
 *      "noindex".
 *   3. grep of dist/ (post-build) must find no "peptide-calculator" string
 *      (only skipped when dist/ is absent, e.g. when this script is run
 *      standalone without a build).
 *
 * Runs from either $PROBE_BASE_URL or the --base-url CLI arg (default
 * https://phlabs.co.uk). Non-zero exit on any violation — same pattern
 * as scripts/cache-headers-scan.ts and scripts/probe-sitemap-robots.ts.
 */
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEAD_PATHS = ["/peptide-calculator", "/calculator", "/peptide-calculator/anything"];
const DEAD_STRING = "peptide-calculator";
const DEAD_RE = /calculator/i;
const ACCEPTED_STATUSES = new Set([404, 410]);

function parseArg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const eq = argv.findIndex((a) => a.startsWith(`--${name}=`));
  if (eq >= 0) return argv[eq].slice(`--${name}=`.length);
  const idx = argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return undefined;
}

const BASE = (parseArg("base-url") ||
  process.env.PROBE_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk").replace(/\/+$/, "");
const DIST_DIR = process.env.PROBE_DIST_DIR || "dist";
const UA = "phlabs-calculator-decommission-check/1.0";

const violations: string[] = [];
const passed: string[] = [];

function fail(msg: string) { violations.push(msg); }
function ok(msg: string) { passed.push(msg); }

async function fetchOnce(path: string, method: "GET" | "HEAD" = "GET"): Promise<Response | null> {
  try {
    return await fetch(`${BASE}${path}?__decom_probe=${Date.now()}`, {
      method,
      headers: { "user-agent": UA, "cache-control": "no-cache", pragma: "no-cache" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    fail(`network error fetching ${path}: ${(e as Error).message}`);
    return null;
  }
}

async function checkRobots() {
  const res = await fetchOnce("/robots.txt");
  if (!res) return;
  if (res.status !== 200) { fail(`/robots.txt returned ${res.status}`); return; }
  const body = await res.text();
  if (DEAD_RE.test(body)) fail(`/robots.txt contains a "calculator" reference — must not appear anywhere in robots.txt`);
  else ok(`/robots.txt clean (no calculator refs)`);
}

async function discoverSitemaps(): Promise<string[]> {
  const found = new Set<string>(["/sitemap.xml"]);
  for (const seed of ["/sitemap-index.xml", "/sitemap.xml"]) {
    const res = await fetchOnce(seed);
    if (!res || res.status !== 200) continue;
    const body = await res.text();
    for (const m of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      try {
        const u = new URL(m[1], BASE);
        if (u.origin !== new URL(BASE).origin) continue;
        if (/^\/sitemap[-a-z0-9_]*\.xml$/i.test(u.pathname)) found.add(u.pathname);
      } catch { /* noop */ }
    }
  }
  return [...found];
}

async function checkSitemaps() {
  const paths = await discoverSitemaps();
  for (const p of paths) {
    const res = await fetchOnce(p);
    if (!res) continue;
    if (res.status !== 200) { ok(`${p} not served (status ${res.status}) — nothing to check`); continue; }
    const body = await res.text();
    if (DEAD_RE.test(body)) fail(`${p} contains a "calculator" entry — must be excluded from every sitemap`);
    else ok(`${p} clean (no calculator entries)`);
  }
}

async function checkDeadRoutes() {
  for (const path of DEAD_PATHS) {
    const res = await fetchOnce(path);
    if (!res) continue;
    if (!ACCEPTED_STATUSES.has(res.status)) {
      fail(`${path} returned HTTP ${res.status} — expected 410 (preferred) or 404`);
      continue;
    }
    const xr = (res.headers.get("x-robots-tag") || "").toLowerCase();
    if (!xr.includes("noindex")) {
      fail(`${path} returned ${res.status} but x-robots-tag "${xr || "(missing)"}" does not include noindex`);
      continue;
    }
    ok(`${path} → ${res.status} + x-robots-tag "${xr}"`);
  }
}

function checkDistArtifacts() {
  if (!existsSync(DIST_DIR)) {
    ok(`dist/ absent — skipping filesystem grep (run after build for full coverage)`);
    return;
  }
  const stack: string[] = [DIST_DIR];
  // Also scan the shipped downloads folder so protocol-library.pdf etc.
  // are covered by the grep even when they land outside dist/.
  for (const extra of ["public", "src/assets/downloads"]) if (existsSync(extra)) stack.push(extra);

  const hits: Array<{ file: string; kind: "text" | "binary" }> = [];
  while (stack.length) {
    const cur = stack.pop()!;
    let st;
    try { st = statSync(cur); } catch { continue; }
    if (st.isDirectory()) {
      for (const name of readdirSync(cur)) {
        if (name === "node_modules" || name === ".git" || name.startsWith("cache-") /* stale reports */) continue;
        stack.push(join(cur, name));
      }
      continue;
    }
    if (!st.isFile()) continue;
    // Read as buffer; check for the ASCII byte sequence.
    try {
      const buf = readFileSync(cur);
      if (buf.includes(DEAD_STRING)) {
        const kind = /\.(pdf|png|jpg|jpeg|gif|webp|woff2?|ttf|otf|ico|zip)$/i.test(cur) ? "binary" : "text";
        hits.push({ file: cur, kind });
      }
    } catch { /* noop */ }
  }
  if (hits.length === 0) {
    ok(`no "peptide-calculator" string found in dist/, public/, or src/assets/downloads/`);
  } else {
    for (const h of hits) fail(`artifact still contains "peptide-calculator" (${h.kind}): ${h.file}`);
  }
}

async function main() {
  console.log(`[decommission-check] base=${BASE}`);
  await checkRobots();
  await checkSitemaps();
  await checkDeadRoutes();
  checkDistArtifacts();

  console.log("\n--- PASSED ---");
  for (const p of passed) console.log(" ✓", p);
  if (violations.length) {
    console.log("\n--- VIOLATIONS ---");
    for (const v of violations) console.log(" ✗", v);
    console.error(`\n${violations.length} violation(s) — /peptide-calculator and /calculator are not fully decommissioned.`);
    process.exit(1);
  }
  console.log("\nAll decommission guards passed.");
}

main().catch((e) => {
  console.error("[decommission-check] fatal:", e);
  process.exit(2);
});
