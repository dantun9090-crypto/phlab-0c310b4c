#!/usr/bin/env bun
/**
 * Post-build guard: ensures forbidden domain literals never ship in the
 * built bundles or in the e2e test sources that get checked in.
 *
 * Scans:
 *   - dist/        (built client + server bundles emitted by `vite build`)
 *   - e2e/         (Playwright test sources)
 *
 * Forbidden literals (NEVER allowed in shipped output):
 *   - prohealthpeptides.co.uk
 *   - phlab.lovable.app
 *   - phplabs / phplab    (typo for `phlabs`)
 *
 * Canonical: https://phlabs.co.uk
 *
 * An `e2e/` source may opt out a single line with the comment marker
 * `check-domains-allow-line` (matches the convention in
 * scripts/check-domains.ts). `dist/` has NO opt-out — built bundles must
 * never contain these strings.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SELF = relative(ROOT, import.meta.path);

const TARGET_DIRS = ["dist", "e2e"];

const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /prohealthpeptides\.co\.uk/gi, label: "prohealthpeptides.co.uk" },
  { pattern: /phlab\.lovable\.app/gi, label: "phlab.lovable.app" },
  { pattern: /\bphp+labs?\b/gi, label: "phplabs / phplab (typo)" },
];

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
  // Quick reject: don't pay regex cost on irrelevant files.
  if (
    !/prohealthpeptides|phlab\.lovable\.app|php+labs?/i.test(content)
  ) {
    return;
  }
  const lines = content.split(/\r?\n/);
  for (const rule of FORBIDDEN) {
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
