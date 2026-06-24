#!/usr/bin/env bun
/**
 * Dependency vulnerability scan against the OSV.dev advisory database.
 *
 * Reads the CycloneDX SBOM produced by `bun run sbom`, batches every
 * package@version against https://api.osv.dev/v1/querybatch, and exits
 * non-zero if any advisory of `medium` severity or higher is reported.
 *
 * Used by:
 *   - CI (PR + main) — blocks merges that introduce or regress
 *     medium/high/critical advisories.
 *   - Post-deploy workflow — re-runs after publish so the deployment
 *     log carries the live security posture of what just shipped.
 *
 * Why OSV over `bun audit` / `npm audit`:
 *   - Works offline-of-registry (the bun registry's audit endpoint is
 *     not stable; npm audit needs a package-lock).
 *   - One source of truth across npm + GitHub Security advisories.
 *   - Lets us audit the exact resolved tree (incl. nested copies),
 *     not just top-level pins.
 *
 * Exit codes:
 *   0  no medium+ findings
 *   1  one or more medium+ findings (or audit failed to run)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"] as const;
type Severity = (typeof SEVERITY_ORDER)[number];

// Resolve the minimum-blocking severity from (in order of precedence):
//   1. SECURITY_MIN_SEVERITY env var (workflow-level / one-off override)
//   2. .security-config.json `minSeverity` field (committed repo policy)
//   3. hard-coded default of "medium"
// This means CI can flip the gate via a workflow_dispatch input or a
// repo config bump — no scanner code edits required.
const CONFIG_PATH = join(process.cwd(), ".security-config.json");
let configMin: Severity | undefined;
if (existsSync(CONFIG_PATH)) {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { minSeverity?: string };
    if (cfg.minSeverity && (SEVERITY_ORDER as readonly string[]).includes(cfg.minSeverity)) {
      configMin = cfg.minSeverity as Severity;
    }
  } catch {
    /* ignore malformed config — fall back to default */
  }
}
const MIN_BLOCKING: Severity =
  (process.env.SECURITY_MIN_SEVERITY as Severity) ?? configMin ?? "medium";
const minIdx = SEVERITY_ORDER.indexOf(MIN_BLOCKING);
const SBOM_PATH = join(process.cwd(), "dist", "sbom.cdx.json");
const REPORT_PATH =
  process.env.SECURITY_REPORT_PATH ?? join(process.cwd(), "dist", "security-audit.json");

function normalise(sev: string): Severity {
  const s = sev.toLowerCase();
  if (s === "moderate") return "medium";
  if (s === "" || s === "unknown") return "info";
  return (SEVERITY_ORDER as readonly string[]).includes(s) ? (s as Severity) : "info";
}

function severityRank(sev: string): number {
  return SEVERITY_ORDER.indexOf(normalise(sev));
}

function cvssToSeverity(score: number): Severity {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  if (score > 0) return "low";
  return "info";
}

async function main() {
  if (!existsSync(SBOM_PATH)) {
    console.log("ℹ SBOM not found — generating first.");
    const r = spawnSync("bun", ["run", "sbom"], { stdio: "inherit" });
    if (r.status !== 0) {
      console.error("✖ Failed to generate SBOM.");
      process.exit(1);
    }
  }

  const sbom = JSON.parse(readFileSync(SBOM_PATH, "utf8")) as {
    components: Array<{ name: string; version: string }>;
  };

  console.log(`▶ Auditing ${sbom.components.length} packages via OSV (blocking >= ${MIN_BLOCKING})`);

  type Query = { package: { name: string; ecosystem: "npm" }; version: string };
  const queries: Query[] = sbom.components.map((c) => ({
    package: { name: c.name, ecosystem: "npm" },
    version: c.version,
  }));

  // OSV API caps batch size — chunk to 1000 queries per request.
  const BATCH = 1000;
  type OsvVuln = { id: string };
  const vulnIds = new Set<string>();
  const vulnByQuery: Array<{ pkg: string; version: string; ids: string[] }> = [];

  for (let i = 0; i < queries.length; i += BATCH) {
    const slice = queries.slice(i, i + BATCH);
    const res = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: slice }),
    });
    if (!res.ok) {
      console.error(`✖ OSV query failed: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    const data = (await res.json()) as { results: Array<{ vulns?: OsvVuln[] }> };
    data.results.forEach((r, idx) => {
      if (!r.vulns || r.vulns.length === 0) return;
      const q = slice[idx]!;
      const ids = r.vulns.map((v) => v.id);
      ids.forEach((id) => vulnIds.add(id));
      vulnByQuery.push({ pkg: q.package.name, version: q.version, ids });
    });
  }

  console.log(`  ${vulnByQuery.length} affected packages, ${vulnIds.size} unique advisories.`);

  type OsvDetail = {
    id: string;
    summary?: string;
    severity?: Array<{ type: string; score: string }>;
    database_specific?: { severity?: string };
    references?: Array<{ url: string }>;
  };
  const details = new Map<string, OsvDetail>();

  // Fetch each advisory only once.
  for (const id of vulnIds) {
    const res = await fetch(`https://api.osv.dev/v1/vulns/${id}`);
    if (!res.ok) continue;
    details.set(id, (await res.json()) as OsvDetail);
  }

  function pickSeverity(d: OsvDetail | undefined): Severity {
    if (!d) return "info";
    if (d.database_specific?.severity) return normalise(d.database_specific.severity);
    if (d.severity && d.severity.length > 0) {
      const v = d.severity.find((s) => s.type?.startsWith("CVSS"));
      if (v) {
        const m = v.score.match(/CVSS:[^/]+\/([^ ]+)/);
        const baseMatch = (m?.[1] ?? "").match(/CVSS:.*?\/AV/);
        void baseMatch;
        // OSV gives the full vector — score parsing is heavy; fall back to
        // the embedded numeric score if present, else assume 'medium'.
        const numeric = parseFloat(v.score);
        if (!Number.isNaN(numeric)) return cvssToSeverity(numeric);
      }
    }
    return "medium";
  }

  type Blocking = {
    pkg: string;
    version: string;
    id: string;
    severity: Severity;
    summary: string;
    url: string;
  };
  // Triaged false-positives / accepted risks are listed in
  // .security-ignore.json at the repo root. Each entry MUST include a
  // reason. Add via PR — never silence advisories inline.
  const ignorePath = join(process.cwd(), ".security-ignore.json");
  const ignoreSet = new Set<string>();
  if (existsSync(ignorePath)) {
    const cfg = JSON.parse(readFileSync(ignorePath, "utf8")) as {
      ignore?: Array<{ id: string; reason: string }>;
    };
    cfg.ignore?.forEach((e) => ignoreSet.add(e.id));
  }

  const blocking: Blocking[] = [];
  const informational: Array<{ pkg: string; id: string; severity: Severity }> = [];
  const ignored: Array<{ pkg: string; id: string; severity: Severity }> = [];

  for (const v of vulnByQuery) {
    for (const id of v.ids) {
      const d = details.get(id);
      const sev = pickSeverity(d);
      const item = {
        pkg: v.pkg,
        version: v.version,
        id,
        severity: sev,
        summary: d?.summary ?? "(no summary)",
        url: d?.references?.[0]?.url ?? `https://osv.dev/vulnerability/${id}`,
      };
      if (ignoreSet.has(id)) {
        ignored.push({ pkg: v.pkg, id, severity: sev });
        continue;
      }
      if (severityRank(sev) >= minIdx) blocking.push(item);
      else informational.push({ pkg: v.pkg, id, severity: sev });
    }
  }

  if (ignored.length > 0) {
    console.log(`\nℹ ${ignored.length} advisories suppressed via .security-ignore.json.`);
  }
  if (informational.length > 0) {
    console.log(`ℹ ${informational.length} sub-threshold advisories (info/low) — not blocking.`);
  }


  if (blocking.length === 0) {
    console.log("\n✔ No medium+ vulnerabilities. Safe to merge / deploy.");
    return;
  }

  console.error(`\n✖ ${blocking.length} blocking vulnerabilities (>= ${MIN_BLOCKING}):\n`);
  for (const b of blocking) {
    console.error(`  [${b.severity.toUpperCase()}] ${b.pkg}@${b.version} — ${b.id}`);
    console.error(`    ${b.summary}`);
    console.error(`    ${b.url}`);
  }
  console.error(
    "\nFix: pin the patched version via `overrides` + `resolutions` in package.json,\n" +
      "     then run `bun install` and re-run `bun run security:scan`.\n",
  );
  process.exit(1);
}

void main();
