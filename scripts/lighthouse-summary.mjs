// Extract the key metrics from the most recent Lighthouse CI run and
// emit them as JSON on stdout. Used by the workflow to build artifacts
// and PR comments.
//
// Usage: node scripts/lighthouse-summary.mjs <profile>
//
// Reads .lighthouseci/lhr-*.json (Lighthouse CI dumps one report per
// URL × run). Picks the LATEST report for /compound.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const profile = process.argv[2] ?? "unknown";
const dir = ".lighthouseci";

let reports = [];
try {
  reports = readdirSync(dir)
    .filter((f) => f.startsWith("lhr-") && f.endsWith(".json"))
    .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
} catch {
  process.stdout.write(JSON.stringify({ profile, error: "no .lighthouseci dir" }));
  process.exit(0);
}

const out = { profile, runs: [] };
for (const { f } of reports) {
  try {
    const r = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const url = r.finalDisplayedUrl ?? r.finalUrl ?? "?";
    if (!/\/compound(\b|\/|$)/.test(url)) continue;
    const a = r.audits ?? {};
    out.runs.push({
      url,
      perf: r.categories?.performance?.score ?? null,
      seo: r.categories?.seo?.score ?? null,
      lcp: a["largest-contentful-paint"]?.numericValue ?? null,
      fcp: a["first-contentful-paint"]?.numericValue ?? null,
      tbt: a["total-blocking-time"]?.numericValue ?? null,
      cls: a["cumulative-layout-shift"]?.numericValue ?? null,
      si: a["speed-index"]?.numericValue ?? null,
    });
  } catch {
    /* skip */
  }
}
process.stdout.write(JSON.stringify(out, null, 2));
