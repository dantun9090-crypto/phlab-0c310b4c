#!/usr/bin/env bun
/**
 * CI guard: skanuje repozytorium pod kątem zabronionych domen.
 * Fails build, jeśli znajdzie:
 *   - prohealthpeptides.co.uk  (stara domena, 301 -> www.phlabs.co.uk)
 *   - phlab.lovable.app        (stary preview URL)
 *   - phplabs.co.uk / phplab   (literówka — poprawnie: phlabs)
 *
 * Jedyna poprawna domena produkcyjna: https://www.phlabs.co.uk
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".output",
  ".vinxi",
  ".tanstack",
  ".wrangler",
  ".cache",
  ".next",
  "coverage",
  ".lovable",
]);

// Plik samego skryptu jest pomijany, bo z definicji zawiera te stringi.
const SELF = relative(ROOT, import.meta.path);

const FORBIDDEN: { pattern: RegExp; label: string; hint: string }[] = [
  {
    pattern: /prohealthpeptides\.co\.uk/gi,
    label: "prohealthpeptides.co.uk",
    hint: "Stara domena. Użyj https://www.phlabs.co.uk",
  },
  {
    pattern: /phlab\.lovable\.app/gi,
    label: "phlab.lovable.app",
    hint: "Stary preview URL. Użyj https://www.phlabs.co.uk",
  },
  {
    // Literówka: phplabs / phplab (z dodatkowym 'p'). Poprawnie: phlabs.
    pattern: /\bphp+labs?\b/gi,
    label: "phplabs / phplab (literówka)",
    hint: "Poprawna pisownia to 'phlabs' (jedno 'p'). Użyj https://www.phlabs.co.uk",
  },
];

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".mdx", ".html", ".htm",
  ".css", ".scss", ".yml", ".yaml", ".toml",
  ".xml", ".txt", ".env", ".sh",
]);

type Hit = { file: string; line: number; match: string; label: string; hint: string };
const hits: Hit[] = [];

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry) || entry.startsWith(".DS_Store")) continue;
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (rel === SELF) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : "";
      const isDotfile = entry.startsWith(".") && !ext;
      if (!TEXT_EXT.has(ext) && !isDotfile) continue;
      if (st.size > 2_000_000) continue;
      scan(full, rel);
    }
  }
}

function scan(full: string, rel: string) {
  let content: string;
  try {
    content = readFileSync(full, "utf8");
  } catch {
    return;
  }
  const lines = content.split(/\r?\n/);
  for (const rule of FORBIDDEN) {
    rule.pattern.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        hits.push({ file: rel, line: i + 1, match: m[0], label: rule.label, hint: rule.hint });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
}

walk(ROOT);

if (hits.length === 0) {
  console.log("✅ check-domains: brak zabronionych domen. Canonical: https://www.phlabs.co.uk");
  process.exit(0);
}

console.error(`❌ check-domains: znaleziono ${hits.length} zabronion${hits.length === 1 ? "e wystąpienie" : "ych wystąpień"}:\n`);
const byLabel = new Map<string, Hit[]>();
for (const h of hits) {
  if (!byLabel.has(h.label)) byLabel.set(h.label, []);
  byLabel.get(h.label)!.push(h);
}
for (const [label, group] of byLabel) {
  console.error(`— ${label} (${group.length})`);
  console.error(`  ${group[0].hint}`);
  for (const h of group) {
    console.error(`    ${h.file}:${h.line}  →  ${h.match}`);
  }
  console.error("");
}
process.exit(1);
