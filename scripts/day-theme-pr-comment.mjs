#!/usr/bin/env node
/**
 * Build a markdown PR comment summarising day-theme-audit results.
 *
 * Reads Playwright's JSON report + the test-results/ folder produced by
 * `bun run test:day-theme`. Emits:
 *   - pass/fail/flaky counts
 *   - per-failure block with inline thumbnails (expected/actual/diff)
 *     base64-embedded so the comment is self-contained on GitHub.
 *
 * Usage:
 *   node scripts/day-theme-pr-comment.mjs \
 *     --report playwright-report/report.json \
 *     --results test-results \
 *     --out pr-comment.md
 */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => {
    if (a.startsWith("--") && arr[i + 1]) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const REPORT = args.report || "playwright-report/report.json";
const RESULTS = args.results || "test-results";
const OUT = args.out || "pr-comment.md";
const MAX_THUMB_BYTES = 700_000; // GitHub caps comments ~65k chars; embed small only

function loadReport() {
  if (!existsSync(REPORT)) return null;
  try {
    return JSON.parse(readFileSync(REPORT, "utf8"));
  } catch {
    return null;
  }
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function embed(path) {
  try {
    const buf = readFileSync(path);
    if (buf.length > MAX_THUMB_BYTES) return null;
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function collectFailures() {
  const out = [];
  for (const file of walk(RESULTS)) {
    const lower = file.toLowerCase();
    if (!lower.endsWith(".png")) continue;
    if (
      lower.includes("-diff.") ||
      lower.includes("-actual.") ||
      lower.includes("-expected.")
    ) {
      out.push(file);
    }
  }
  // Group by test directory.
  const groups = new Map();
  for (const f of out) {
    const dir = f.split("/").slice(0, -1).join("/");
    if (!groups.has(dir)) groups.set(dir, {});
    const slot = basename(f).includes("-diff.")
      ? "diff"
      : basename(f).includes("-actual.")
        ? "actual"
        : "expected";
    groups.get(dir)[slot] = f;
  }
  return groups;
}

const report = loadReport();
let passed = 0,
  failed = 0,
  flaky = 0,
  skipped = 0;
const failNames = [];
if (report?.suites) {
  const walkSuite = (s) => {
    for (const sp of s.specs ?? []) {
      for (const t of sp.tests ?? []) {
        const status = t.results?.[t.results.length - 1]?.status;
        if (status === "passed") passed++;
        else if (status === "skipped") skipped++;
        else if (status === "flaky") flaky++;
        else {
          failed++;
          failNames.push(sp.title);
        }
      }
    }
    for (const sub of s.suites ?? []) walkSuite(sub);
  };
  for (const s of report.suites) walkSuite(s);
}

const verdict = failed === 0 ? "✅ PASS" : "❌ FAIL";
const groups = collectFailures();

let md = `### Day-theme audit — ${verdict}\n\n`;
md += `| Passed | Failed | Flaky | Skipped |\n|---:|---:|---:|---:|\n`;
md += `| ${passed} | ${failed} | ${flaky} | ${skipped} |\n\n`;

if (failed && failNames.length) {
  md += `**Failing tests:**\n`;
  for (const n of failNames.slice(0, 20)) md += `- \`${n}\`\n`;
  md += `\n`;
}

if (groups.size) {
  md += `<details><summary>Snapshot diffs (${groups.size})</summary>\n\n`;
  let shown = 0;
  for (const [dir, slots] of groups) {
    if (shown++ >= 8) {
      md += `\n_…and ${groups.size - 8} more diff(s) — see Playwright report artifact._\n`;
      break;
    }
    md += `\n#### \`${dir.replace(/^test-results\//, "")}\`\n\n`;
    md += `| Expected | Actual | Diff |\n|---|---|---|\n`;
    const cell = (p) => {
      if (!p) return "—";
      const data = embed(p);
      return data
        ? `<img src="${data}" width="220" alt="${basename(p)}" />`
        : `\`${basename(p)}\` (too large — see artifact)`;
    };
    md += `| ${cell(slots.expected)} | ${cell(slots.actual)} | ${cell(slots.diff)} |\n`;
  }
  md += `\n</details>\n`;
} else if (failed) {
  md += `_No snapshot diffs on disk — see uploaded Playwright report artifact for details._\n`;
}

md += `\n<sub>Re-seed baselines: \`bun run test:day-theme:update\` (or run the workflow with \`update_snapshots=true\`).</sub>\n`;

import { writeFileSync } from "node:fs";
writeFileSync(OUT, md);
console.log(`[day-theme-pr-comment] wrote ${OUT} (${md.length} chars)`);
