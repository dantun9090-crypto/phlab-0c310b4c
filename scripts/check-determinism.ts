#!/usr/bin/env bun
/**
 * Determinism check for the security pipeline.
 *
 * Reads SHA-256 hashes of `dist/sbom.cdx.json` and `dist/security-audit.json`
 * from two runs of the security-scan job — one that restored both the
 * Bun install store and the SBOM cache, and one that built everything
 * from a clean cache — and fails if either pair differs.
 *
 * If the cached and fresh runs disagree, either:
 *   - the SBOM generator depends on something other than `bun.lock` +
 *     `scripts/generate-sbom.ts` (i.e. cache key is incomplete), or
 *   - the audit scanner depends on something non-deterministic
 *     (timestamps, hashmap order, network ordering, ...).
 *
 * Either way we want CI to scream so the cache stays trustworthy and
 * the audit JSON stays reproducible build-over-build.
 *
 * Usage:
 *   bun scripts/check-determinism.ts <cached-dir> <fresh-dir>
 *
 * Each directory must contain `sbom.cdx.json` and `security-audit.json`.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const [, , cachedDir, freshDir] = process.argv;
if (!cachedDir || !freshDir) {
  console.error("usage: check-determinism.ts <cached-dir> <fresh-dir>");
  process.exit(2);
}

const FILES = ["sbom.cdx.json", "security-audit.json"] as const;
let mismatched = 0;
const rows: Array<{ file: string; cached: string; fresh: string; match: boolean }> = [];

for (const f of FILES) {
  const a = join(cachedDir, f);
  const b = join(freshDir, f);
  if (!existsSync(a) || !existsSync(b)) {
    console.error(`MISSING: ${f} (cached=${existsSync(a)}, fresh=${existsSync(b)})`);
    mismatched += 1;
    rows.push({ file: f, cached: existsSync(a) ? sha256(a) : "(missing)", fresh: existsSync(b) ? sha256(b) : "(missing)", match: false });
    continue;
  }
  const ha = sha256(a);
  const hb = sha256(b);
  const match = ha === hb;
  if (!match) mismatched += 1;
  rows.push({ file: f, cached: ha, fresh: hb, match });
}

const summaryLines = [
  "### 🧪 Determinism check (cached vs fresh)",
  "",
  "| File | Cached SHA-256 | Fresh SHA-256 | Match |",
  "|---|---|---|---|",
  ...rows.map((r) => `| \`${r.file}\` | \`${r.cached.slice(0, 16)}…\` | \`${r.fresh.slice(0, 16)}…\` | ${r.match ? "✅" : "❌"} |`),
  "",
  mismatched === 0
    ? "All artifacts hash-identical — cache key is complete and generators are deterministic."
    : `❌ ${mismatched} artifact(s) differ between cached and fresh runs — cache key is incomplete or a generator is non-deterministic.`,
  "",
];

console.log(summaryLines.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n"));
}

process.exit(mismatched === 0 ? 0 : 1);
