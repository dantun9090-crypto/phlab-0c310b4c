#!/usr/bin/env node
/**
 * Rolling-window evaluator for the canary workflow.
 *
 * State file .canary-state/history.json:
 *   { runs: [{ts, outcome, buildId, bootBad, failureCount}, ...],
 *     lastAlertedBuild: "<id>" }
 *
 * Emits GitHub Actions outputs:
 *   should_alert=true|false          — Slack notify, deduped per build-id
 *   rollback_recommended=true|false  — sustained boot-bad or high-severity fails
 *   summary="X/Y runs failing"
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), ".canary-state");
const FILE = resolve(DIR, "history.json");
const OUT = process.env.GITHUB_OUTPUT;

const FAIL_THRESHOLD = Number(process.env.FAIL_THRESHOLD || "3");
const WINDOW_RUNS = Number(process.env.WINDOW_RUNS || "6");
const ROLLBACK_BOOT_BAD_THRESHOLD = Number(process.env.ROLLBACK_BOOT_BAD_THRESHOLD || "2");
const outcome = (process.env.RUN_OUTCOME || "success").toLowerCase();
const force = String(process.env.FORCE_ALERT || "").toLowerCase() === "true";
const buildId = (process.env.BUILD_ID || "unknown").trim();
const bootBadCount = Number(process.env.BOOT_BAD_COUNT || "0");
const failureCount = Number(process.env.FAILURE_COUNT || "0");

mkdirSync(DIR, { recursive: true });

let state = { runs: [], lastAlertedBuild: "" };
try {
  if (existsSync(FILE)) {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    if (Array.isArray(parsed)) state = { runs: parsed, lastAlertedBuild: "" }; // migrate legacy
    else state = { runs: [], lastAlertedBuild: "", ...parsed };
  }
} catch {
  /* keep defaults */
}

state.runs.push({ ts: Date.now(), outcome, buildId, bootBad: bootBadCount, failureCount });
state.runs = state.runs.slice(-WINDOW_RUNS);

const failuresInWindow = state.runs.filter((r) => r.outcome === "failure").length;
const bootBadInWindow = state.runs.reduce((n, r) => n + (r.bootBad || 0), 0);

// Alert dedupe: skip Slack if we already alerted for THIS build-id, unless
// forced. A fresh build-id resets the dedupe (new deploy = new signal).
const sameBuildAsLastAlert =
  !!state.lastAlertedBuild && state.lastAlertedBuild === buildId;
const wouldAlert = force || failuresInWindow >= FAIL_THRESHOLD;
const shouldAlert = force || (wouldAlert && !sameBuildAsLastAlert);

// Rollback recommended when the SAME build sustains multiple boot-bad flags
// OR the failure threshold is met and boot-bad is present at all.
const rollbackRecommended =
  bootBadInWindow >= ROLLBACK_BOOT_BAD_THRESHOLD ||
  (wouldAlert && bootBadInWindow > 0);

if (shouldAlert && buildId && buildId !== "unknown") {
  state.lastAlertedBuild = buildId;
}

writeFileSync(FILE, JSON.stringify(state, null, 2));

const summary = `${failuresInWindow}/${state.runs.length} runs failing (threshold ${FAIL_THRESHOLD}/${WINDOW_RUNS}), bootBad=${bootBadInWindow}, build=${buildId.slice(0, 12)}`;

console.log("Canary window state:", {
  runs: state.runs,
  failuresInWindow,
  bootBadInWindow,
  buildId,
  lastAlertedBuild: state.lastAlertedBuild,
  shouldAlert,
  rollbackRecommended,
  force,
});

if (OUT) {
  appendFileSync(OUT, `should_alert=${shouldAlert}\n`);
  appendFileSync(OUT, `rollback_recommended=${rollbackRecommended}\n`);
  appendFileSync(OUT, `summary=${summary}\n`);
  appendFileSync(OUT, `build_id=${buildId}\n`);
  appendFileSync(OUT, `boot_bad_in_window=${bootBadInWindow}\n`);
}
