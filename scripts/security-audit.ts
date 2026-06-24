#!/usr/bin/env bun
/**
 * Runs `bun audit` and fails the process if any vulnerability of
 * `medium` severity or higher is reported.
 *
 * Used by:
 *   - CI (PR + main) — blocks merges that introduce or regress
 *     medium/high/critical advisories.
 *   - Post-deploy workflow — re-runs after publish so the deployment
 *     log carries the live security posture of what just shipped.
 *
 * Exit codes:
 *   0  no medium+ findings
 *   1  one or more medium+ findings (or audit failed to run)
 */
import { spawnSync } from "node:child_process";

const SEVERITY_ORDER = ["info", "low", "moderate", "medium", "high", "critical"] as const;
type Severity = (typeof SEVERITY_ORDER)[number];

const MIN_BLOCKING: Severity = (process.env.SECURITY_MIN_SEVERITY as Severity) ?? "medium";
const minIdx = SEVERITY_ORDER.indexOf(MIN_BLOCKING);

function normalise(sev: string): Severity {
  const s = sev.toLowerCase();
  if (s === "moderate") return "medium";
  return (SEVERITY_ORDER as readonly string[]).includes(s) ? (s as Severity) : "info";
}

function severityRank(sev: string): number {
  return SEVERITY_ORDER.indexOf(normalise(sev));
}

console.log(`▶ Running dependency security scan (blocking >= ${MIN_BLOCKING})`);

const res = spawnSync("bun", ["audit", "--json"], { encoding: "utf8" });
const raw = (res.stdout ?? "").trim();

if (!raw) {
  console.error("✖ bun audit produced no output:", res.stderr);
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error("✖ bun audit returned non-JSON output:", raw.slice(0, 500));
  process.exit(1);
}

type Advisory = { severity?: string; module_name?: string; title?: string; url?: string };
const advisories: Advisory[] = [];

if (parsed && typeof parsed === "object") {
  const root = parsed as Record<string, unknown>;
  if (root.advisories && typeof root.advisories === "object") {
    advisories.push(...(Object.values(root.advisories) as Advisory[]));
  } else if (Array.isArray(root.vulnerabilities)) {
    advisories.push(...(root.vulnerabilities as Advisory[]));
  }
}

const blocking = advisories.filter((a) => severityRank(a.severity ?? "info") >= minIdx);

console.log(`Total advisories: ${advisories.length}`);
console.log(`Blocking (>= ${MIN_BLOCKING}): ${blocking.length}`);

if (blocking.length > 0) {
  console.error("\n✖ Vulnerable dependencies detected:\n");
  for (const a of blocking) {
    console.error(
      `  [${(a.severity ?? "?").toUpperCase()}] ${a.module_name ?? "?"} — ${a.title ?? "?"}`,
    );
    if (a.url) console.error(`    ${a.url}`);
  }
  console.error(
    "\nFix: pin the patched version via `overrides` + `resolutions` in package.json,\n" +
      "     then run `bun install` and re-run `bun run security:scan`.\n",
  );
  process.exit(1);
}

console.log("✔ No medium+ vulnerabilities. Safe to merge / deploy.");
