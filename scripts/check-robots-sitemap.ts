/**
 * Preflight — robots.txt Sitemap: directives must exactly match the set
 * of live sitemap feeds served by the app.
 *
 * Emits a full drift report (all issues at once, with source locations and
 * remediation hints) instead of failing on the first problem, so a single
 * run tells you every SEO gap to close.
 *
 * Enforced invariants:
 *   1. Every `Sitemap:` URL uses the canonical SITE_URL host over https.
 *   2. Every declared sitemap path resolves to an existing route file.
 *   3. Every sitemap-style feed route is listed in robots.txt (missing).
 *   4. No robots directive points at a non-existent feed (stale).
 *   5. No duplicate Sitemap: directives.
 *
 * Runs as part of `build:preflight`, so drift blocks the build.
 */
import { readFileSync, existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { SITE_URL } from "../src/lib/seo-meta";

// Canonical set of sitemap feeds this project serves. Adding a new
// XML URL-feed route means adding it here AND to public/robots.txt.
const EXPECTED_SITEMAP_PATHS = ["/sitemap.xml", "/bing-feed.xml"] as const;

const ROBOTS_REL = "public/robots.txt";
const ROBOTS_PATH = resolve(process.cwd(), ROBOTS_REL);

interface Directive {
  raw: string;
  line: number; // 1-indexed
  url: URL | null;
}

interface Issue {
  severity: "error" | "warn";
  code: string;
  message: string;
  location?: string; // e.g. public/robots.txt:42
  hint?: string;
}

function routeFileFor(path: string): string {
  // "/sitemap.xml" -> src/routes/sitemap[.]xml.ts (TanStack escape).
  const clean = path.replace(/^\//, "").replace(/\.xml$/, "");
  return resolve(process.cwd(), `src/routes/${clean}[.]xml.ts`);
}

function relFromCwd(abs: string): string {
  return relative(process.cwd(), abs) || abs;
}

function extractDirectives(robots: string): Directive[] {
  const out: Directive[] = [];
  const lines = robots.split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i);
    if (!m) return;
    let url: URL | null = null;
    try {
      url = new URL(m[1]);
    } catch {
      /* leave null, reported as INVALID_URL */
    }
    out.push({ raw: m[1], line: i + 1, url });
  });
  return out;
}

function loc(line: number): string {
  return `${ROBOTS_REL}:${line}`;
}

function main() {
  const issues: Issue[] = [];

  if (!existsSync(ROBOTS_PATH)) {
    console.error(`❌ ${ROBOTS_REL} not found`);
    process.exit(1);
  }
  const robots = readFileSync(ROBOTS_PATH, "utf8");
  const declared = extractDirectives(robots);
  const canonicalHost = new URL(SITE_URL).host;

  if (declared.length === 0) {
    issues.push({
      severity: "error",
      code: "NO_DIRECTIVES",
      message: "no Sitemap: directives in robots.txt",
      location: ROBOTS_REL,
      hint: `Add: Sitemap: ${SITE_URL}/sitemap.xml`,
    });
  }

  // 1) Per-directive: syntactic + host + protocol + backing route.
  for (const d of declared) {
    if (!d.url) {
      issues.push({
        severity: "error",
        code: "INVALID_URL",
        message: `Sitemap URL is not a valid absolute URL: "${d.raw}"`,
        location: loc(d.line),
        hint: `Use an absolute https URL, e.g. ${SITE_URL}/sitemap.xml`,
      });
      continue;
    }
    if (d.url.protocol !== "https:") {
      issues.push({
        severity: "error",
        code: "NOT_HTTPS",
        message: `Sitemap URL must be https (${d.raw})`,
        location: loc(d.line),
        hint: `Rewrite as https://${canonicalHost}${d.url.pathname}`,
      });
    }
    if (d.url.host !== canonicalHost) {
      issues.push({
        severity: "error",
        code: "WRONG_HOST",
        message: `Sitemap URL host "${d.url.host}" != canonical "${canonicalHost}"`,
        location: loc(d.line),
        hint: `Rewrite as https://${canonicalHost}${d.url.pathname}`,
      });
    }
    const routeFile = routeFileFor(d.url.pathname);
    if (!existsSync(routeFile)) {
      issues.push({
        severity: "error",
        code: "STALE_DIRECTIVE",
        message: `Stale Sitemap directive — no backing route for "${d.url.pathname}"`,
        location: loc(d.line),
        hint: `Either create ${relFromCwd(routeFile)} or remove this Sitemap: line.`,
      });
    }
  }

  // 2) Duplicates.
  const byUrl = new Map<string, Directive[]>();
  for (const d of declared) {
    const key = d.url ? d.url.toString() : d.raw;
    const arr = byUrl.get(key) ?? [];
    arr.push(d);
    byUrl.set(key, arr);
  }
  for (const [key, ds] of byUrl) {
    if (ds.length > 1) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_DIRECTIVE",
        message: `Duplicate Sitemap directive for ${key}`,
        location: ds.map((d) => loc(d.line)).join(", "),
        hint: "Keep a single Sitemap: line per feed URL.",
      });
    }
  }

  // 3) Missing — expected feeds not declared (compared by pathname on
  //    canonical host, so a WRONG_HOST directive still counts as missing).
  const declaredPaths = new Set(
    declared
      .filter((d) => d.url && d.url.host === canonicalHost && d.url.protocol === "https:")
      .map((d) => d.url!.pathname),
  );
  for (const p of EXPECTED_SITEMAP_PATHS) {
    if (!declaredPaths.has(p)) {
      const routeFile = routeFileFor(p);
      const routeExists = existsSync(routeFile);
      issues.push({
        severity: "error",
        code: "MISSING_DIRECTIVE",
        message: `Missing Sitemap directive for served feed ${SITE_URL}${p}`,
        location: ROBOTS_REL,
        hint: routeExists
          ? `Route exists at ${relFromCwd(routeFile)} — add: Sitemap: ${SITE_URL}${p}`
          : `Expected route ${relFromCwd(routeFile)} does NOT exist — create it or remove ${p} from EXPECTED_SITEMAP_PATHS in scripts/check-robots-sitemap.ts`,
      });
    }
  }

  // ---------- report ----------
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");

  console.log("── robots.txt ↔ sitemap drift report ──");
  console.log(`  canonical host : ${canonicalHost}`);
  console.log(`  robots file    : ${ROBOTS_REL}`);
  console.log(`  declared feeds : ${declared.length}`);
  for (const d of declared) console.log(`     • ${d.raw}  (${loc(d.line)})`);
  console.log(`  expected feeds : ${EXPECTED_SITEMAP_PATHS.length}`);
  for (const p of EXPECTED_SITEMAP_PATHS) {
    const rf = routeFileFor(p);
    console.log(`     • ${SITE_URL}${p}  →  ${relFromCwd(rf)}${existsSync(rf) ? "" : "  [MISSING FILE]"}`);
  }
  console.log("");

  if (issues.length === 0) {
    console.log(
      `✅ robots.txt Sitemap directives match ${declared.length} served feed(s) with no drift.`,
    );
    return;
  }

  console.log(`Found ${errors.length} error(s)${warns.length ? `, ${warns.length} warning(s)` : ""}:`);
  for (const i of issues) {
    const tag = i.severity === "error" ? "❌" : "⚠️ ";
    console.log(`\n${tag} [${i.code}] ${i.message}`);
    if (i.location) console.log(`   at:  ${i.location}`);
    if (i.hint) console.log(`   fix: ${i.hint}`);
  }
  console.log("");

  if (errors.length > 0) process.exit(1);
}

main();
