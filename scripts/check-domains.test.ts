/**
 * Build-guard companion: ensure route + e2e code never reintroduces
 * forbidden domains. Mirrors `scripts/check-domains.ts` (run during
 * `prebuild`) but lives in the unit-test suite so the failure shows up
 * during local `vitest` runs too — fast feedback before pushing.
 *
 * Allowlist convention matches the build script: append a trailing
 * `// check-domains-allow-line: <reason>` to legitimate references
 * (e.g. SW cleanup of the legacy host).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

// Same patterns the build-time guard enforces. Keep these in sync with
// scripts/check-domains.ts — if you add one here, add it there too.
const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /prohealthpeptides\.co\.uk/gi, label: "prohealthpeptides.co.uk" },
  { pattern: /phlab\.lovable\.app/gi, label: "phlab.lovable.app" },
  { pattern: /\bphp+labs?\b/gi, label: "phplabs/phplab (typo)" },
];

const SCAN_DIRS = ["src/routes", "e2e"];
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) {
      const dot = e.lastIndexOf(".");
      const ext = dot >= 0 ? e.slice(dot).toLowerCase() : "";
      if (TEXT_EXT.has(ext)) out.push(full);
    }
  }
  return out;
}

describe("forbidden-domain guard (routes + e2e)", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it("scans a non-trivial number of files (sanity)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const { pattern, label } of FORBIDDEN) {
    it(`route + e2e code contains no unallowed "${label}" references`, () => {
      const hits: string[] = [];
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const prev = i > 0 ? lines[i - 1] : "";
          // Reset regex state between lines (global flag).
          pattern.lastIndex = 0;
          if (!pattern.test(line)) continue;
          if (
            line.includes("check-domains-allow-line") ||
            prev.includes("check-domains-allow-next-line")
          ) {
            continue;
          }
          hits.push(`${relative(ROOT, file)}:${i + 1}  →  ${line.trim()}`);
        }
      }
      expect(
        hits,
        `Forbidden "${label}" references found.\n` +
          `Use https://phlabs.co.uk, or add a trailing\n` +
          `// check-domains-allow-line: <reason>\n` +
          `comment if the reference is intentional.\n\n` +
          hits.join("\n"),
      ).toEqual([]);
    });
  }
});
