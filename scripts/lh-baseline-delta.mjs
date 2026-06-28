#!/usr/bin/env node
/**
 * Lighthouse baseline regression guard.
 *
 * Compares the latest Lighthouse CI run for
 * /resources/peptide-categories-uk-research against a committed baseline
 * and fails ONLY when a tracked category regresses by more than the
 * allowed delta. Absolute thresholds (categories:* min scores) are
 * still enforced by lhci itself; this script catches *drift* — a page
 * that scores 0.92 today but 0.84 tomorrow stays above the 0.8 floor
 * yet should still block the PR.
 *
 * Usage:
 *   node scripts/lh-baseline-delta.mjs \
 *     --report-dir ./lhci-report \
 *     --baseline lighthouse-baseline/desktop.json \
 *     [--max-delta 0.05] [--update]
 *
 * Exit codes:
 *   0 — within tolerance (or baseline written with --update)
 *   1 — regression > max-delta on at least one tracked category
 *   2 — usage / IO error
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const TRACKED = ["performance", "accessibility", "seo", "best-practices"];

function parseArgs(argv) {
  const out = { maxDelta: 0.05, update: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--report-dir") out.reportDir = argv[++i];
    else if (a === "--baseline") out.baseline = argv[++i];
    else if (a === "--max-delta") out.maxDelta = parseFloat(argv[++i]);
    else if (a === "--update") out.update = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: lh-baseline-delta.mjs --report-dir <dir> --baseline <file> [--max-delta 0.05] [--update]",
      );
      process.exit(0);
    }
  }
  if (!out.reportDir || !out.baseline) {
    console.error("error: --report-dir and --baseline are required");
    process.exit(2);
  }
  return out;
}

async function readLatestRun(reportDir) {
  // lhci writes manifest.json + lhr-<hash>.json per run; pick the median
  // representative the manifest already chose to avoid run-to-run noise.
  const manifestPath = path.join(reportDir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (e) {
    console.error(`error: cannot read ${manifestPath}: ${e.message}`);
    process.exit(2);
  }
  const representative =
    manifest.find((m) => m.isRepresentativeRun) || manifest[manifest.length - 1];
  if (!representative) {
    console.error("error: lhci manifest has no runs");
    process.exit(2);
  }
  const lhrPath = path.isAbsolute(representative.jsonPath)
    ? representative.jsonPath
    : path.join(reportDir, path.basename(representative.jsonPath));
  const lhr = JSON.parse(await fs.readFile(lhrPath, "utf8"));
  const scores = {};
  for (const key of TRACKED) {
    const cat = lhr.categories?.[key];
    if (cat && typeof cat.score === "number") scores[key] = cat.score;
  }
  return scores;
}

async function readBaseline(file) {
  try {
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    console.error(`error: cannot read baseline ${file}: ${e.message}`);
    process.exit(2);
  }
}

async function writeBaseline(file, scores) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload = {
    capturedAt: new Date().toISOString(),
    url: "/resources/peptide-categories-uk-research",
    scores,
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

(async () => {
  const args = parseArgs(process.argv);
  const current = await readLatestRun(args.reportDir);

  if (args.update) {
    await writeBaseline(args.baseline, current);
    console.log(
      `baseline written → ${args.baseline}\n` +
        JSON.stringify(current, null, 2),
    );
    process.exit(0);
  }

  const baseline = await readBaseline(args.baseline);
  if (!baseline) {
    // First run: seed and pass. Subsequent runs will compare against this.
    await writeBaseline(args.baseline, current);
    console.log(
      `no baseline at ${args.baseline} — seeded with current scores, ` +
        `no delta check performed this run`,
    );
    process.exit(0);
  }

  const tol = args.maxDelta;
  const regressions = [];
  const summary = [];
  for (const key of TRACKED) {
    const curr = current[key];
    const base = baseline.scores?.[key];
    if (typeof curr !== "number" || typeof base !== "number") continue;
    const delta = curr - base;
    summary.push(
      `${key.padEnd(14)} base=${base.toFixed(3)} curr=${curr.toFixed(3)} Δ=${
        delta >= 0 ? "+" : ""
      }${delta.toFixed(3)}`,
    );
    if (delta < -tol) {
      regressions.push({ key, base, curr, delta });
    }
  }

  console.log(`Lighthouse delta vs ${args.baseline} (tolerance ±${tol}):`);
  console.log(summary.join("\n"));

  if (regressions.length > 0) {
    console.error(
      `\nFAIL — ${regressions.length} category regressed beyond ±${tol}:`,
    );
    for (const r of regressions) {
      console.error(
        `  ${r.key}: ${r.base.toFixed(3)} → ${r.curr.toFixed(3)} (Δ${r.delta.toFixed(3)})`,
      );
    }
    process.exit(1);
  }
  console.log("\nOK — no tracked category regressed beyond tolerance");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
