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
 * Exit codes:
 *   0 — every path passes
 *   1 — one or more paths violate the contract
 *   2 — network / unexpected error
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE =
  process.env.PROBE_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";
const OUT_DIR = process.env.PROBE_OUT_DIR || "sitemap-robots-probe";
const BROWSER_MAX_AGE_CEILING = 3600;

interface Target {
  path: string;
  expectedContentType: RegExp;
}

// robots.txt + every sitemap variant we might ship. The scanner tolerates
// 404 on optional split sitemaps (products/articles) so we can add them
// without a coordinated CI change.
const TARGETS: Target[] = [
  { path: "/robots.txt", expectedContentType: /text\/plain/ },
  { path: "/sitemap.xml", expectedContentType: /xml/ },
  { path: "/sitemap-products.xml", expectedContentType: /xml/ },
  { path: "/sitemap-articles.xml", expectedContentType: /xml/ },
];

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
  ok: boolean;
}

function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

async function probe(target: Target): Promise<Result> {
  const url = `${BASE}${target.path}?__cache_probe=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const violations: string[] = [];
  let status: number | null = null;
  let h: Headers | null = null;

  try {
    const res = await fetch(url, {
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
  } catch (err) {
    violations.push(`network error: ${(err as Error).message}`);
    return {
      path: target.path,
      url,
      status,
      contentType: "",
      cacheControl: "",
      cdnCacheControl: "",
      surrogateControl: "",
      cfCacheStatus: "",
      age: 0,
      violations,
      optionalSkipped: false,
      ok: false,
    };
  }

  const contentType = h.get("content-type") || "";
  const cc = h.get("cache-control") || "";
  const cdn = h.get("cdn-cache-control") || h.get("cloudflare-cdn-cache-control") || "";
  const surrogate = h.get("surrogate-control") || "";
  const cf = (h.get("cf-cache-status") || "").toUpperCase();
  const age = Number(h.get("age") || "0") || 0;

  // Optional sitemap variants: tolerate 404 (site simply doesn't split them).
  const isOptional = target.path === "/sitemap-products.xml" || target.path === "/sitemap-articles.xml";
  if (status === 404 && isOptional) {
    return {
      path: target.path,
      url,
      status,
      contentType,
      cacheControl: cc,
      cdnCacheControl: cdn,
      surrogateControl: surrogate,
      cfCacheStatus: cf,
      age,
      violations,
      optionalSkipped: true,
      ok: true,
    };
  }

  if (status !== 200) violations.push(`unexpected status ${status}`);
  if (contentType && !target.expectedContentType.test(contentType)) {
    violations.push(`content-type "${contentType}" does not match ${target.expectedContentType}`);
  }

  // The one non-negotiable: CDN MUST be no-store.
  const cdnHeader = cdn || surrogate;
  if (!cdnHeader) {
    violations.push("cdn-cache-control missing — CF will apply its own cache TTL");
  } else if (!/\bno-store\b/i.test(cdnHeader)) {
    violations.push(`cdn-cache-control not no-store: "${cdnHeader}"`);
  }

  // Browser: short max-age is fine, but no immutable, no s-maxage.
  if (cc) {
    if (/\bimmutable\b/i.test(cc)) {
      violations.push(`cache-control has 'immutable' — stale robots/sitemap will pin in browsers ("${cc}")`);
    }
    const maxAge = parseDirective(cc, "max-age");
    if (maxAge !== null && maxAge > BROWSER_MAX_AGE_CEILING) {
      violations.push(`cache-control max-age=${maxAge} exceeds ${BROWSER_MAX_AGE_CEILING}s ceiling`);
    }
    const sMax = parseDirective(cc, "s-maxage") ?? 0;
    if (sMax > 0) {
      violations.push(`cache-control s-maxage=${sMax} — CF may hold response despite CDN no-store`);
    }
  } else {
    violations.push("cache-control missing");
  }

  if (["HIT", "REVALIDATED", "STALE", "UPDATING"].includes(cf)) {
    violations.push(`cf-cache-status=${cf} — served from CF cache`);
  }
  if (age > 0) {
    violations.push(`age=${age}s — served from CF cache`);
  }

  return {
    path: target.path,
    url,
    status,
    contentType,
    cacheControl: cc,
    cdnCacheControl: cdn,
    surrogateControl: surrogate,
    cfCacheStatus: cf,
    age,
    violations,
    optionalSkipped: false,
    ok: violations.length === 0,
  };
}

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
  lines.push("| Path | Status | content-type | cache-control | cdn-cache-control | cf-cache-status | Age | OK |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| \`${r.path}\` | ${r.status ?? "ERR"} | \`${r.contentType || "-"}\` | \`${r.cacheControl || "-"}\` | \`${r.cdnCacheControl || "-"}\` | \`${r.cfCacheStatus || "-"}\` | ${r.age} | ${r.optionalSkipped ? "⚪️ skip" : r.ok ? "✅" : "❌"} |`,
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

async function main() {
  const results = await Promise.all(TARGETS.map(probe));

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, "sitemap-robots-probe.json");
  const mdPath = join(OUT_DIR, "sitemap-robots-probe.md");
  writeFileSync(
    jsonPath,
    JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), results }, null, 2),
  );
  writeFileSync(mdPath, renderMarkdown(results));

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(results) + "\n");
    } catch {}
  }

  const failed = results.filter((r) => !r.ok);
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
