#!/usr/bin/env node
/**
 * Rolling-window evaluator for the canary workflow.
 *
 * Reads/writes .canary-state/history.json — a small array of the last N run
 * outcomes {ts, outcome}. Emits GitHub Actions outputs:
 *   should_alert=true|false
 *   summary="X/Y runs failing"
 *
 * Alert only when the failure count inside the window reaches FAIL_THRESHOLD.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), ".canary-state");
const FILE = resolve(DIR, "history.json");
const OUT = process.env.GITHUB_OUTPUT;

const FAIL_THRESHOLD = Number(process.env.FAIL_THRESHOLD || "3");
const WINDOW_RUNS = Number(process.env.WINDOW_RUNS || "6");
const outcome = (process.env.RUN_OUTCOME || "success").toLowerCase(); // success|failure|cancelled|skipped
const force = String(process.env.FORCE_ALERT || "").toLowerCase() === "true";

mkdirSync(DIR, { recursive: true });

let history = [];
try {
  if (existsSync(FILE)) history = JSON.parse(readFileSync(FILE, "utf8"));
  if (!Array.isArray(history)) history = [];
} catch {
  history = [];
}

history.push({ ts: Date.now(), outcome });
history = history.slice(-WINDOW_RUNS);
writeFileSync(FILE, JSON.stringify(history, null, 2));

const failures = history.filter((r) => r.outcome === "failure").length;
const shouldAlert = force || failures >= FAIL_THRESHOLD;
const summary = `${failures}/${history.length} runs failing (threshold ${FAIL_THRESHOLD}/${WINDOW_RUNS})`;

console.log("Canary window state:", { history, failures, threshold: FAIL_THRESHOLD, shouldAlert, force });

if (OUT) {
  appendFileSync(OUT, `should_alert=${shouldAlert}\n`);
  appendFileSync(OUT, `summary=${summary}\n`);
}
