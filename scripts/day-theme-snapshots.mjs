#!/usr/bin/env node
/**
 * Single entry point for day-theme visual regression baselines.
 *
 * Works locally and in CI — replaces the `workflow_dispatch` input flag.
 *
 * Usage:
 *   node scripts/day-theme-snapshots.mjs            # diff (CI default)
 *   node scripts/day-theme-snapshots.mjs --update   # (re)seed baselines
 *   node scripts/day-theme-snapshots.mjs --ci       # diff, fail loud
 *
 * Env:
 *   TEST_BASE_URL   target server (default http://localhost:8080)
 *   UPDATE_SNAPSHOTS=true  same effect as --update
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const update =
  args.has("--update") ||
  args.has("-u") ||
  process.env.UPDATE_SNAPSHOTS === "true" ||
  process.env.UPDATE_SNAPSHOTS === "1";

const base = process.env.TEST_BASE_URL || "http://localhost:8080";
process.env.TEST_BASE_URL = base;

const spec = "e2e/day-theme-audit.spec.ts";
if (!existsSync(spec)) {
  console.error(`[day-theme-snapshots] spec not found: ${spec}`);
  process.exit(2);
}

const pwArgs = [
  "playwright",
  "test",
  spec,
  "--reporter=line,json",
  ...(update ? ["--update-snapshots"] : []),
];

console.log(
  `[day-theme-snapshots] mode=${update ? "UPDATE" : "DIFF"} base=${base}`,
);

const runner = process.env.PW_RUNNER || "bunx";
const result = spawnSync(runner, pwArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME:
      process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ||
      "playwright-report/report.json",
  },
});
process.exit(result.status ?? 1);
