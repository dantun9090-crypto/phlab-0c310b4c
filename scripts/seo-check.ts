/**
 * Automated SEO regression check.
 *
 * Fails (exit 1) if any route's <title> or meta description exceeds the
 * limits in SEO_LIMITS. Covers two surfaces:
 *
 *   1. Static route files under src/routes/ — scanned via regex for
 *      `{ title: "..." }` and `{ name: "description", content: "..." }`
 *      entries inside head() returns.
 *   2. The dynamic /$ splat route — exercised by calling metaForPath()
 *      against a representative set of paths (catalogue, product detail,
 *      research article, resource article, legal pages, deep fallback).
 *
 * Run via: bun scripts/seo-check.ts   (or `bun run seo:check`)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { SEO_LIMITS, metaForPath } from "../src/lib/seo-meta";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const ROUTES_DIR = join(ROOT, "src", "routes");

type Violation = {
  source: string;
  field: "title" | "description";
  value: string;
  length: number;
  limit: number;
};

const violations: Violation[] = [];

function check(source: string, field: Violation["field"], value: string) {
  const limit = field === "title" ? SEO_LIMITS.titleMax : SEO_LIMITS.descriptionMax;
  if (value.length > limit) {
    violations.push({ source, field, value, length: value.length, limit });
  }
}

// ── 1. Walk static route files ────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

const TITLE_RE = /\{\s*title:\s*(["'`])((?:\\.|(?!\1).)*)\1\s*\}/g;
const DESC_RE =
  /\{\s*name:\s*["']description["'],\s*content:\s*(["'`])((?:\\.|(?!\1).)*)\1\s*\}/g;

for (const file of walk(ROUTES_DIR)) {
  // Skip the splat route — it's covered dynamically below.
  if (file.endsWith("$.tsx")) continue;
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);

  for (const m of src.matchAll(TITLE_RE)) {
    // Only literal strings are checked. Template-literal interpolations
    // (e.g. `${foo}`) are exercised by the dynamic section below.
    const raw = m[2];
    if (raw.includes("${")) continue;
    check(rel, "title", raw);
  }
  for (const m of src.matchAll(DESC_RE)) {
    const raw = m[2];
    if (raw.includes("${")) continue;
    check(rel, "description", raw);
  }
}

// ── 2. Exercise the dynamic splat route ───────────────────────────────────
const SAMPLE_PATHS = [
  "",
  "products",
  "products/bpc-157",
  "products/semaglutide-5mg-research-grade-uk",
  "products/a-very-long-experimental-peptide-name-for-testing",
  "research",
  "research/peptide-stability-study",
  "resources",
  "resources/storage-and-reconstitution-guide-for-research-peptides",
  "lab-reports",
  "quality-control",
  "storage-guide",
  "about",
  "contact",
  "shipping-policy",
  "refund-policy",
  "terms-and-conditions",
  "privacy-policy",
  "cookies",
  "search",
  "some/deep/unknown/fallback/path",
];

for (const p of SAMPLE_PATHS) {
  const meta = metaForPath(p);
  const label = `metaForPath("${p}")`;
  check(label, "title", meta.title);
  check(label, "description", meta.description);
}

// ── Report ────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log(
    `✓ SEO check passed — title ≤ ${SEO_LIMITS.titleMax}, description ≤ ${SEO_LIMITS.descriptionMax}`,
  );
  process.exit(0);
}

console.error(`✗ SEO check failed — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(
    `  [${v.field}] ${v.length}/${v.limit} chars\n    at ${v.source}\n    "${v.value}"\n`,
  );
}
process.exit(1);
