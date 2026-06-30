#!/usr/bin/env bun
/**
 * Post-build guard: scans built bundles + checked-in e2e sources for
 * forbidden domain literals.
 *
 * Scope per directory:
 *   - dist/   → fails ONLY on the `phplabs` / `phplab` typo. Legacy-host
 *               literals (`prohealthpeptides.co.uk`, `phlab.lovable.app`)
 *               legitimately appear in built code (301 redirect tables,
 *               SEO metadata mapping previous canonicals → phlabs.co.uk).
 *               The source-level guard (`scripts/check-domains.ts`) is
 *               the authoritative gate for those, with pragma allow-list
 *               for intentional uses. Typos are NEVER intentional.
 *   - e2e/    → fails on all three forbidden patterns. Lines may opt out
 *               via `check-domains-allow-line` (matches the convention in
 *               scripts/check-domains.ts).
 *
 * Canonical: https://phlabs.co.uk
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SELF = relative(ROOT, import.meta.path);

const TARGET_DIRS: Array<{ name: string; scope: "dist" | "e2e" }> = [
  { name: "dist", scope: "dist" },
  { name: "e2e", scope: "e2e" },
];

type Rule = { pattern: RegExp; label: string };
const TYPO_RULE: Rule = {
  pattern: /\bphp+labs?\b/gi,
  label: "phplabs / phplab (typo — correct spelling is 'phlabs')",
};
const LEGACY_RULES: Rule[] = [
  { pattern: /prohealthpeptides\.co\.uk/gi, label: "prohealthpeptides.co.uk" },
  { pattern: /phlab\.lovable\.app/gi, label: "phlab.lovable.app" },
];
const RULES_FOR: Record<"dist" | "e2e", Rule[]> = {
  dist: [TYPO_RULE],
  e2e: [...LEGACY_RULES, TYPO_RULE],
};

// Binary / noise extensions to skip when scanning dist/.
const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg",
  ".ico", ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp4", ".webm", ".mp3", ".wav",
  ".pdf", ".zip", ".gz", ".br",
  ".wasm",
]);

// In e2e/, only scan source files. In dist/, scan everything textual.
type Hit = { file: string; line: number; match: string; label: string };
const hits: Hit[] = [];

function walk(dir: string, scope: "dist" | "e2e") {
  for (const entry of readdirSync(dir)) {
    if (entry === ".DS_Store") continue;
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (rel === SELF) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, scope);
      continue;
    }
    if (!st.isFile()) continue;
    const dot = entry.lastIndexOf(".");
    const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : "";
    if (SKIP_EXT.has(ext)) continue;
    if (st.size > 10_000_000) continue;
    scan(full, rel, scope);
  }
}

function scan(full: string, rel: string, scope: "dist" | "e2e") {
  let content: string;
  try {
    content = readFileSync(full, "utf8");
  } catch {
    return;
  }
  const rules = RULES_FOR[scope];
  const lines = content.split(/\r?\n/);
  for (const rule of rules) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // e2e sources may opt out per line; dist NEVER may.
      if (
        scope === "e2e" &&
        (line.includes("check-domains-allow-line") ||
          (i > 0 && lines[i - 1].includes("check-domains-allow-next-line")))
      ) {
        continue;
      }
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        hits.push({ file: rel, line: i + 1, match: m[0], label: rule.label });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
}

let scanned = 0;
for (const d of TARGET_DIRS) {
  const full = join(ROOT, d);
  if (!existsSync(full)) {
    if (d === "dist") {
      console.log(
        `ℹ️  check-dist-domains: dist/ missing — run \`bun run build\` first. Skipping dist scan.`,
      );
      continue;
    }
    console.log(`ℹ️  check-dist-domains: ${d}/ missing — skipping.`);
    continue;
  }
  scanned++;
  walk(full, d as "dist" | "e2e");
}

if (hits.length === 0) {
  console.log(
    `✅ check-dist-domains: scanned ${scanned} dir(s). No forbidden literals in dist/ or e2e/.`,
  );
  process.exit(0);
}

console.error(
  `❌ check-dist-domains: ${hits.length} forbidden literal occurrence(s):\n`,
);
const byLabel = new Map<string, Hit[]>();
for (const h of hits) {
  if (!byLabel.has(h.label)) byLabel.set(h.label, []);
  byLabel.get(h.label)!.push(h);
}
for (const [label, group] of byLabel) {
  console.error(`— ${label} (${group.length})`);
  for (const h of group.slice(0, 50)) {
    console.error(`    ${h.file}:${h.line}  →  ${h.match}`);
  }
  if (group.length > 50) {
    console.error(`    ... ${group.length - 50} more`);
  }
  console.error("");
}
console.error(`Canonical: https://phlabs.co.uk`);
process.exit(1);
