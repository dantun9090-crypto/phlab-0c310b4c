#!/usr/bin/env bun
/**
 * Probe /robots.txt and /sitemap*.xml on every build.
 *
 * Asserts these two files return the correct cache contract:
 *   - cdn-cache-control MUST include "no-store" — otherwise a stale
 *     robots or sitemap survives across content changes and stops Google
 *     from discovering the new inventory.
 *   - cache-control MAY have a short browser max-age (<= 3600) with
 *     must-revalidate or stale-while-revalidate, but MUST NOT be
 *     "immutable" and MUST NOT declare s-maxage>0 (that would let CF
 *     hold it despite CDN no-store).
 *   - cf-cache-status MUST NOT be HIT / REVALIDATED / STALE / UPDATING.
 *   - content-type MUST match the expected MIME (text/plain, xml).
 *
 * Runs against $PROBE_BASE_URL (default https://phlabs.co.uk). Called
 * from the `postbuild:probe` npm script and from the
 * `sitemap-robots-cache-probe` GitHub workflow on every push to main.
 *
 * Diagnostics artifacts (all under $PROBE_REPORTS_DIR, default `reports/`):
 *   - probe-detailed-log.jsonl — one JSON line per HTTP attempt
 *   - probe-detailed-log.md    — human-readable attempt table
 *   - probe-summary.md         — one row per (domain, url) with PASS/FAIL
 *   - drift-diff-<host>.json   — expected vs. fetched diff on drift
 *   - drift-diff-<host>.md     — human-readable diff on drift
 *
 * Exit codes:
 *   0 — every path passes
 *   1 — one or more paths violate the contract
 *   2 — network / unexpected error
 */
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// CLI + env config
// ---------------------------------------------------------------------------
function parseCliArg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const eqIdx = argv.findIndex((a) => a.startsWith(`--${name}=`));
  if (eqIdx >= 0) return argv[eqIdx].slice(`--${name}=`.length);
  const spaceIdx = argv.findIndex((a) => a === `--${name}`);
  if (spaceIdx >= 0 && argv[spaceIdx + 1]) return argv[spaceIdx + 1];
  return undefined;
}

const CLI_DOMAIN = parseCliArg("domain");
const BASE = CLI_DOMAIN
  ? (CLI_DOMAIN.startsWith("http") ? CLI_DOMAIN : `https://${CLI_DOMAIN}`).replace(/\/+$/, "")
  : (process.env.PROBE_BASE_URL ||
     process.env.PROBE_DOMAIN ||
     process.env.TEST_BASE_URL ||
     "https://phlabs.co.uk").replace(/\/+$/, "");
const OUT_DIR = process.env.PROBE_OUT_DIR || "sitemap-robots-probe";
const REPORTS_DIR = process.env.PROBE_REPORTS_DIR || "reports";
const DIST_DIR = process.env.PROBE_DIST_DIR || "dist";
const BROWSER_MAX_AGE_CEILING = 3600;
const MAX_RETRIES = Math.max(1, Number(parseCliArg("retries") ?? process.env.PROBE_RETRIES ?? "3"));
const RETRY_DELAY_MS = Number(parseCliArg("retry-delay") ?? process.env.PROBE_RETRY_DELAY_SEC ?? "10") * 1000;

// Legacy hosts that intentionally 301 to the canonical apex. A 301 on
// robots/sitemap from these hosts is CORRECT — not drift. See
// REDIRECT_HOSTS in src/server.ts.
const LEGACY_REDIRECT_HOSTS = new Set([
  "prohealthpeptides.co.uk",
  "www.prohealthpeptides.co.uk",
  "www.phlabs.co.uk",
]);

const HOST_SLUG = new URL(BASE).hostname.replace(/[^a-z0-9]+/gi, "-");

// ---------------------------------------------------------------------------
// Targets + auto-discovery
// ---------------------------------------------------------------------------
interface Target {
  path: string;
  expectedContentType: RegExp;
  optional: boolean;
  source?: string;
}

const SEED_TARGETS: Target[] = [
  { path: "/robots.txt", expectedContentType: /text\/plain/, optional: false, source: "seed" },
  { path: "/sitemap.xml", expectedContentType: /xml/, optional: false, source: "seed" },
  { path: "/sitemap-index.xml", expectedContentType: /xml/, optional: true, source: "seed" },
  { path: "/sitemap-products.xml", expectedContentType: /xml/, optional: true, source: "seed" },
  { path: "/sitemap-articles.xml", expectedContentType: /xml/, optional: true, source: "seed" },
];

async function discoverAdditionalSitemaps(seenPaths: Set<string>): Promise<Target[]> {
  const seeds = ["/sitemap-index.xml", "/sitemap.xml"];
  const found = new Map<string, Target>();
  for (const seed of seeds) {
    try {
      const res = await fetch(`${BASE}${seed}?__discover=${Date.now()}`, {
        headers: { "user-agent": "phlabs-sitemap-robots-probe/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status !== 200) continue;
      const ct = res.headers.get("content-type") || "";
      if (!/xml/i.test(ct)) continue;
      const body = await res.text();
      const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      for (const raw of locs) {
        let u: URL;
        try { u = new URL(raw, BASE); } catch { continue; }
        if (u.origin !== new URL(BASE).origin) continue;
        if (!/^\/sitemap[-a-z0-9_]*\.xml$/i.test(u.pathname)) continue;
        if (seenPaths.has(u.pathname) || found.has(u.pathname)) continue;
        found.set(u.pathname, {
          path: u.pathname,
          expectedContentType: /xml/,
          optional: true,
          source: `discovered via ${seed}`,
        });
      }
    } catch { /* best-effort */ }
  }
  return [...found.values()];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RedirectHop { status: number; location: string; }

interface AttemptLog {
  timestamp: string;
  domain: string;
  url: string;
  path: string;
  attempt_number: number;
  http_status_code: number | null;
  cf_cache_status: string;
  cdn_cache_control: string;
  cache_control: string;
  age: string;
  content_type: string;
  redirect_chain: RedirectHop[];
  pass_or_fail: "PASS" | "FAIL" | "SKIP";
  violations: string[];
  error_message: string | null;
}

interface Result {
  path: string;
  url: string;
  status: number | null;
  contentType: string;
  cacheControl: string;
  cdnCacheControl: string;
  surrogateControl: string;
  cfCacheStatus: string;
  age: number;
  violations: string[];
  optionalSkipped: boolean;
  optional: boolean;
  source?: string;
  ok: boolean;
  attempts: number;
  redirectChain: RedirectHop[];
  body?: string;
}

function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Detailed per-attempt logging
// ---------------------------------------------------------------------------
mkdirSync(REPORTS_DIR, { recursive: true });
const DETAILED_JSONL = join(REPORTS_DIR, "probe-detailed-log.jsonl");
const DETAILED_MD = join(REPORTS_DIR, "probe-detailed-log.md");

function logAttempt(entry: AttemptLog) {
  try { appendFileSync(DETAILED_JSONL, JSON.stringify(entry) + "\n"); } catch {}
  try {
    const line =
      `| ${entry.timestamp} | \`${entry.domain}\` | \`${entry.path}\` | ${entry.attempt_number} | ` +
      `${entry.http_status_code ?? "ERR"} | ${entry.cf_cache_status || "-"} | ` +
      `\`${entry.cdn_cache_control || "-"}\` | \`${entry.cache_control || "-"}\` | ` +
      `${entry.age || "-"} | ${entry.pass_or_fail} |\n`;
    if (!existsSync(DETAILED_MD)) {
      writeFileSync(
        DETAILED_MD,
        "# Probe detailed log\n\n" +
          "| ts | domain | path | attempt | status | cf-cache | cdn-cache-control | cache-control | age | verdict |\n" +
          "|---|---|---|---|---|---|---|---|---|---|\n",
      );
    }
    appendFileSync(DETAILED_MD, line);
  } catch {}
}

// ---------------------------------------------------------------------------
// Probe (single attempt)
// ---------------------------------------------------------------------------
async function probe(target: Target, attemptNumber: number): Promise<Result> {
  const url = `${BASE}${target.path}?__cache_probe=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const violations: string[] = [];
  const redirectChain: RedirectHop[] = [];
  let status: number | null = null;
  let h: Headers | null = null;
  let body = "";
  let errorMessage: string | null = null;

  const baseHost = new URL(BASE).hostname;
  const isLegacyHost = LEGACY_REDIRECT_HOSTS.has(baseHost);

  const makeResult = (extra: Partial<Result>): Result => ({
    path: target.path,
    url,
    status,
    contentType: h?.get("content-type") || "",
    cacheControl: h?.get("cache-control") || "",
    cdnCacheControl: h?.get("cdn-cache-control") || h?.get("cloudflare-cdn-cache-control") || "",
    surrogateControl: h?.get("surrogate-control") || "",
    cfCacheStatus: (h?.get("cf-cache-status") || "").toUpperCase(),
    age: Number(h?.get("age") || "0") || 0,
    violations,
    optionalSkipped: false,
    optional: target.optional,
    source: target.source,
    ok: false,
    attempts: attemptNumber,
    redirectChain,
    body,
    ...extra,
  });

  try {
    // Follow up to 3 redirects manually so we can record the chain.
    let currentUrl = url;
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "user-agent": "phlabs-sitemap-robots-probe/1.0",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
      h = res.headers;
      if (status >= 300 && status < 400) {
        const loc = h.get("location") || "";
        redirectChain.push({ status, location: loc });
        if (!loc || hop === 3) break;
        currentUrl = new URL(loc, currentUrl).toString();
        continue;
      }
      try { body = await res.text(); } catch { body = ""; }
      break;
    }
  } catch (err) {
    errorMessage = (err as Error).message;
    violations.push(`network error: ${errorMessage}`);
    const r = makeResult({ ok: false });
    logAttempt(buildAttemptLog(target, r, attemptNumber, "FAIL", errorMessage));
    return r;
  }

  const contentType = h!.get("content-type") || "";
  const cc = h!.get("cache-control") || "";
  const cdn = h!.get("cdn-cache-control") || h!.get("cloudflare-cdn-cache-control") || "";
  const surrogate = h!.get("surrogate-control") || "";
  const cf = (h!.get("cf-cache-status") || "").toUpperCase();
  const age = Number(h!.get("age") || "0") || 0;

  // Optional targets tolerate "not shipped": true 404 or SPA HTML fallback.
  const isSpaFallback = status === 200 && /text\/html/i.test(contentType);
  if (target.optional && (status === 404 || isSpaFallback)) {
    const r = makeResult({ ok: true, optionalSkipped: true });
    logAttempt(buildAttemptLog(target, r, attemptNumber, "SKIP", null));
    return r;
  }

  // Legacy redirect hosts: 301/308 → canonical apex is CORRECT.
  if (isLegacyHost && (status === 301 || status === 308)) {
    const r = makeResult({
      ok: true,
      optionalSkipped: true,
      source: (target.source ?? "") + " (legacy 301 → apex, skipped)",
    });
    logAttempt(buildAttemptLog(target, r, attemptNumber, "SKIP", null));
    return r;
  }

  if (status !== 200) violations.push(`unexpected status ${status}`);
  if (contentType && !target.expectedContentType.test(contentType)) {
    violations.push(`content-type "${contentType}" does not match ${target.expectedContentType}`);
  }

  const cdnHeader = cdn || surrogate;
  if (!cdnHeader) violations.push("cdn-cache-control missing — CF will apply its own cache TTL");
  else if (!/\bno-store\b/i.test(cdnHeader)) violations.push(`cdn-cache-control not no-store: "${cdnHeader}"`);

  if (cc) {
    if (/\bimmutable\b/i.test(cc)) violations.push(`cache-control has 'immutable' ("${cc}")`);
    const maxAge = parseDirective(cc, "max-age");
    if (maxAge !== null && maxAge > BROWSER_MAX_AGE_CEILING) {
      violations.push(`cache-control max-age=${maxAge} exceeds ${BROWSER_MAX_AGE_CEILING}s ceiling`);
    }
    const sMax = parseDirective(cc, "s-maxage") ?? 0;
    if (sMax > 0) violations.push(`cache-control s-maxage=${sMax} — CF may hold response despite CDN no-store`);
  } else {
    violations.push("cache-control missing");
  }

  if (["HIT", "REVALIDATED", "STALE", "UPDATING"].includes(cf)) violations.push(`cf-cache-status=${cf} — served from CF cache`);
  if (age > 0) violations.push(`age=${age}s — served from CF cache`);

  const r = makeResult({ ok: violations.length === 0 });
  logAttempt(buildAttemptLog(target, r, attemptNumber, r.ok ? "PASS" : "FAIL", null));
  return r;
}

function buildAttemptLog(
  target: Target,
  r: Result,
  attemptNumber: number,
  verdict: "PASS" | "FAIL" | "SKIP",
  errorMessage: string | null,
): AttemptLog {
  return {
    timestamp: new Date().toISOString(),
    domain: new URL(BASE).hostname,
    url: r.url,
    path: target.path,
    attempt_number: attemptNumber,
    http_status_code: r.status,
    cf_cache_status: r.cfCacheStatus,
    cdn_cache_control: r.cdnCacheControl,
    cache_control: r.cacheControl,
    age: String(r.age || ""),
    content_type: r.contentType,
    redirect_chain: r.redirectChain,
    pass_or_fail: verdict,
    violations: r.violations,
    error_message: errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Drift diff — expected (dist/ or origin nocache) vs. fetched (edge)
// ---------------------------------------------------------------------------
function sha256(s: string): string {
  return "sha256:" + createHash("sha256").update(s).digest("hex");
}

async function loadExpected(path: string): Promise<{ content: string; source: string } | null> {
  // 1. Try local dist file (post-build).
  const distCandidates = [
    join(DIST_DIR, path.replace(/^\/+/, "")),
    join(DIST_DIR, "public", path.replace(/^\/+/, "")),
  ];
  for (const p of distCandidates) {
    if (existsSync(p)) {
      try { return { content: readFileSync(p, "utf8"), source: `dist: ${p}` }; } catch {}
    }
  }
  // 2. Fallback: fetch from origin with cache-bust.
  try {
    const res = await fetch(`${BASE}${path}?nocache=${Date.now()}`, {
      headers: {
        "user-agent": "phlabs-sitemap-robots-probe/1.0",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { content: await res.text(), source: `origin nocache: ${BASE}${path}?nocache=1` };
  } catch {}
  return null;
}

function diffLines(expected: string, fetched: string, max = 40): string[] {
  const a = expected.split(/\r?\n/);
  const b = fetched.split(/\r?\n/);
  const setA = new Set(a);
  const setB = new Set(b);
  const out: string[] = [];
  for (const line of a) if (!setB.has(line)) { out.push(`- ${line}`); if (out.length >= max) return out; }
  for (const line of b) if (!setA.has(line)) { out.push(`+ ${line}`); if (out.length >= max) return out; }
  return out;
}

interface DriftEntry {
  url: string;
  timestamp: string;
  expected_content_hash: string | null;
  fetched_content_hash: string;
  expected_content_preview: string | null;
  fetched_content_preview: string;
  expected_source: string | null;
  redirect_chain: RedirectHop[];
  header_diff: {
    expected_cdn_cache_control: string;
    actual_cdn_cache_control: string;
    expected_cache_control_max_age_lte: number;
    actual_cache_control: string;
    actual_cf_cache_status: string;
  };
  content_diff_lines: string[];
  violations: string[];
}

async function buildDriftDiff(failed: Result[]): Promise<DriftEntry[]> {
  const entries: DriftEntry[] = [];
  for (const r of failed) {
    const expected = await loadExpected(r.path);
    const fetchedBody = r.body ?? "";
    entries.push({
      url: r.url,
      timestamp: new Date().toISOString(),
      expected_content_hash: expected ? sha256(expected.content) : null,
      fetched_content_hash: sha256(fetchedBody),
      expected_content_preview: expected ? expected.content.slice(0, 500) : null,
      fetched_content_preview: fetchedBody.slice(0, 500),
      expected_source: expected?.source ?? null,
      redirect_chain: r.redirectChain,
      header_diff: {
        expected_cdn_cache_control: "no-store",
        actual_cdn_cache_control: r.cdnCacheControl || "(missing)",
        expected_cache_control_max_age_lte: BROWSER_MAX_AGE_CEILING,
        actual_cache_control: r.cacheControl || "(missing)",
        actual_cf_cache_status: r.cfCacheStatus || "(none)",
      },
      content_diff_lines: expected ? diffLines(expected.content, fetchedBody) : [],
      violations: r.violations,
    });
  }
  return entries;
}

function renderDriftMd(entries: DriftEntry[]): string {
  const lines: string[] = [`# Drift diff — ${new URL(BASE).hostname}`, ""];
  for (const e of entries) {
    lines.push(`## ❌ ${e.url}`);
    lines.push("");
    lines.push(`- Redirect chain: ${e.redirect_chain.length ? JSON.stringify(e.redirect_chain) : "(none)"}`);
    lines.push(`- Expected source: ${e.expected_source ?? "(unavailable)"}`);
    lines.push(`- Expected hash: \`${e.expected_content_hash ?? "n/a"}\``);
    lines.push(`- Fetched hash:  \`${e.fetched_content_hash}\``);
    lines.push(`- Header diff:`);
    lines.push("  ```json");
    lines.push("  " + JSON.stringify(e.header_diff, null, 2).replace(/\n/g, "\n  "));
    lines.push("  ```");
    if (e.content_diff_lines.length) {
      lines.push(`- Content diff (first ${e.content_diff_lines.length} lines):`);
      lines.push("  ```diff");
      for (const l of e.content_diff_lines) lines.push("  " + l);
      lines.push("  ```");
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Standard markdown report (per-domain)
// ---------------------------------------------------------------------------
function renderMarkdown(results: Result[]): string {
  const failed = results.filter((r) => !r.ok);
  const lines: string[] = [];
  lines.push(`# /robots.txt & /sitemap*.xml cache probe`);
  lines.push("");
  lines.push(`- Base: \`${BASE}\``);
  lines.push(`- Probed: **${results.length}**`);
  lines.push(`- Violations: **${failed.length}**`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("| Path | Source | Status | content-type | cache-control | cdn-cache-control | cf-cache-status | Age | OK |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| \`${r.path}\` | ${r.source || "-"} | ${r.status ?? "ERR"} | \`${r.contentType || "-"}\` | \`${r.cacheControl || "-"}\` | \`${r.cdnCacheControl || "-"}\` | \`${r.cfCacheStatus || "-"}\` | ${r.age} | ${r.optionalSkipped ? "⚪️ skip" : r.ok ? "✅" : "❌"} |`,
    );
  }
  if (failed.length) {
    lines.push("");
    lines.push(`## Violations`);
    for (const r of failed) {
      lines.push(`### ❌ \`${r.path}\``);
      for (const v of r.violations) lines.push(`- ${v}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Cross-domain summary (appended per invocation — one row per (domain, path))
// ---------------------------------------------------------------------------
const SUMMARY_MD = join(REPORTS_DIR, "probe-summary.md");
function appendSummary(results: Result[], attemptsUsed: number) {
  const host = new URL(BASE).hostname;
  const failed = results.filter((r) => !r.ok);
  const status = failed.length === 0 ? "✅ PASS" : "❌ FAIL";
  const passCount = results.filter((r) => r.ok && !r.optionalSkipped).length;
  const skipCount = results.filter((r) => r.optionalSkipped).length;
  const total = results.length;

  let details: string;
  if (failed.length === 0) {
    details = `${passCount}/${total - skipCount} URLs clean, ${attemptsUsed - 1} retries needed`;
  } else {
    details = failed
      .map((r) => `${r.path}: ${r.violations[0] ?? "drift"} (after ${r.attempts} attempts)`)
      .join("; ");
  }

  if (!existsSync(SUMMARY_MD)) {
    writeFileSync(
      SUMMARY_MD,
      "## 🤖 Robots & Sitemap Probe Results\n\n" +
        "| Domain | Status | Details |\n" +
        "|--------|--------|---------|\n",
    );
  }
  appendFileSync(SUMMARY_MD, `| ${host} | ${status} | ${details} |\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const seedPaths = new Set(SEED_TARGETS.map((t) => t.path));
  const discovered = await discoverAdditionalSitemaps(seedPaths);
  const targets = [...SEED_TARGETS, ...discovered];
  console.log(
    `sitemap/robots cache probe (${BASE}): ${targets.length} paths ` +
      `(${SEED_TARGETS.length} seed + ${discovered.length} discovered), max ${MAX_RETRIES} attempt(s)`,
  );

  // First attempt.
  let results = await Promise.all(targets.map((t) => probe(t, 1)));
  let attemptsUsed = 1;
  for (let attempt = 2; attempt <= MAX_RETRIES; attempt++) {
    const failedIdx = results.map((r, i) => (!r.ok ? i : -1)).filter((i) => i >= 0);
    if (failedIdx.length === 0) break;
    console.log(
      `sitemap/robots cache probe: attempt ${attempt}/${MAX_RETRIES} — ` +
        `${failedIdx.length} paths failed, retrying in ${RETRY_DELAY_MS / 1000}s`,
    );
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const retried = await Promise.all(failedIdx.map((i) => probe(targets[i], attempt)));
    for (let j = 0; j < failedIdx.length; j++) results[failedIdx[j]] = retried[j];
    attemptsUsed = attempt;
  }

  // Per-domain report (legacy OUT_DIR location, kept for existing consumers).
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `sitemap-robots-probe-${HOST_SLUG}.json`);
  const mdPath = join(OUT_DIR, `sitemap-robots-probe-${HOST_SLUG}.md`);
  writeFileSync(
    jsonPath,
    JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), attemptsUsed, results }, null, 2),
  );
  writeFileSync(mdPath, renderMarkdown(results));

  // Cross-domain summary (append).
  appendSummary(results, attemptsUsed);

  // Drift diff on failure.
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    const drift = await buildDriftDiff(failed);
    writeFileSync(join(REPORTS_DIR, `drift-diff-${HOST_SLUG}.json`), JSON.stringify(drift, null, 2));
    writeFileSync(join(REPORTS_DIR, `drift-diff-${HOST_SLUG}.md`), renderDriftMd(drift));
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(results) + "\n");
    } catch {}
  }

  console.log(`sitemap/robots cache probe: ${results.length} paths, ${failed.length} violations`);
  console.log(`  report: ${jsonPath}`);
  console.log(`  report: ${mdPath}`);
  for (const r of results) {
    const tag = r.optionalSkipped ? "SKIP" : r.ok ? "PASS" : "FAIL";
    console.log(`  ${tag} ${r.path}  cc="${r.cacheControl}"  cdn="${r.cdnCacheControl}"  cf=${r.cfCacheStatus}`);
    if (!r.ok) for (const v of r.violations) console.log(`      - ${v}`);
  }
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
