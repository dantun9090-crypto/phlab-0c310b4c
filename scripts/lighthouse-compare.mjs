// Build a markdown comment comparing this PR's Lighthouse run against
// the most recent baseline row in lighthouse-history.csv.
//
// Usage: node scripts/lighthouse-compare.mjs <artifacts-dir> <csv-path>
// Emits markdown to stdout.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [artifactsDir, csvPath] = process.argv.slice(2);
const PERF_REGRESSION_THRESHOLD = -0.05;

function loadCurrent() {
  const out = {};
  for (const file of readdirSync(artifactsDir)) {
    if (!file.startsWith("lh-") || !file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(readFileSync(join(artifactsDir, file), "utf8"));
      const profile = data.profile;
      const run = (data.runs ?? [])[0];
      if (profile && run) out[profile] = run;
    } catch {
      /* skip */
    }
  }
  return out;
}

function loadBaseline() {
  if (!existsSync(csvPath)) return {};
  const lines = readFileSync(csvPath, "utf8").trim().split("\n").slice(1);
  const last = { desktop: null, mobile: null };
  for (const line of lines) {
    const [, , profile, , perf, , lcp, , tbt, cls] = line.split(",");
    if (!profile) continue;
    last[profile] = {
      perf: Number(perf),
      lcp: Number(lcp),
      tbt: Number(tbt),
      cls: Number(cls),
    };
  }
  return last;
}

function delta(curr, base, digits = 2) {
  if (curr == null || base == null || Number.isNaN(base)) return "—";
  const d = curr - base;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(digits)}`;
}

const current = loadCurrent();
const baseline = loadBaseline();

let regression = false;
let md = "## Lighthouse — `/compound`\n\n";
md += "| Profile | Perf | Δ | LCP (ms) | TBT (ms) | CLS |\n";
md += "|---|---|---|---|---|---|\n";

for (const profile of ["desktop", "mobile"]) {
  const c = current[profile];
  const b = baseline[profile];
  if (!c) {
    md += `| ${profile} | _no data_ | — | — | — | — |\n`;
    continue;
  }
  const dPerf = b ? c.perf - b.perf : 0;
  if (b && dPerf < PERF_REGRESSION_THRESHOLD) regression = true;
  md += `| ${profile} | ${c.perf?.toFixed(2) ?? "—"} | ${b ? delta(c.perf, b.perf) : "_baseline_"} | ${Math.round(c.lcp ?? 0)} | ${Math.round(c.tbt ?? 0)} | ${(c.cls ?? 0).toFixed(3)} |\n`;
}

md += "\n";
md += regression
  ? `> ❌ Performance regression detected (> ${Math.abs(PERF_REGRESSION_THRESHOLD)} drop vs main baseline).\n`
  : "> ✅ No performance regression vs main baseline.\n";

process.stdout.write(md);

if (regression) process.exit(1);
