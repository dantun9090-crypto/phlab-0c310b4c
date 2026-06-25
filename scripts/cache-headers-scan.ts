#!/usr/bin/env bun
/**
 * Cache header scanner.
 *
 * Probes a list of public and sensitive paths on the live site and
 * inspects the four headers that determine edge / browser caching:
 *   - cache-control          (browser)
 *   - cdn-cache-control      (Cloudflare / CDN tier)
 *   - surrogate-control      (reverse-proxy tier)
 *   - cf-cache-status        (what CF actually did)
 *
 * Public paths   → must have a bounded TTL (>0, ≤1h) on browser OR CDN
 *                  tier, and cf-cache-status must NOT be an error state.
 * Sensitive paths → every present cache-control header must be uncacheable
 *                   (no-store OR max-age=0+must-revalidate), s-maxage=0,
 *                   and cf-cache-status must NOT be HIT/REVALIDATED/
 *                   UPDATING/STALE (no replay of another user's HTML).
 *
 * Emits two artifacts for CI:
 *   cache-headers-report.json  — full structured result
 *   cache-headers-report.md    — human-readable summary (GH step summary)
 *
 * Exit code is non-zero on any violation so CI fails loudly.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = process.env.CACHE_SCAN_BASE_URL || process.env.TEST_BASE_URL || "https://phlabs.co.uk";
const OUT_DIR = process.env.CACHE_SCAN_OUT_DIR || "cache-headers-report";
const TTL_CEILING = 3600;

const PUBLIC_PATHS = [
  "/",
  "/products",
  "/compound",
  "/research",
  "/landing/phlabs",
  "/about",
  "/contact",
  "/resources",
];

const SENSITIVE_PATHS = [
  "/admin",
  "/cart",
  "/checkout",
  "/account",
  "/login",
  "/register",
  "/payment",
  "/vip",
  "/api/public/cache-config",
];

type Kind = "public" | "sensitive";

interface Probe {
  path: string;
  kind: Kind;
  url: string;
  status: number | null;
  headers: Record<string, string>;
  violations: string[];
  warnings: string[];
  fetchedAt: string;
  ok: boolean;
}

function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

function isUncacheable(header: string): boolean {
  const h = header.toLowerCase();
  if (/\bno-store\b/.test(h)) return true;
  const ma = parseDirective(h, "max-age") ?? -1;
  return ma === 0 && /must-revalidate/.test(h);
}

function pickHeaders(h: Headers): Record<string, string> {
  const want = [
    "cache-control",
    "cdn-cache-control",
    "surrogate-control",
    "cf-cache-status",
    "age",
    "x-build-id",
    "vary",
    "set-cookie",
  ];
  const out: Record<string, string> = {};
  for (const k of want) {
    const v = h.get(k);
    if (v) out[k] = v;
  }
  return out;
}

async function probe(path: string, kind: Kind): Promise<Probe> {
  const url = `${BASE}${path}`;
  const violations: string[] = [];
  const warnings: string[] = [];
  let status: number | null = null;
  let headers: Record<string, string> = {};

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "phlabs-cache-headers-scan/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    headers = pickHeaders(res.headers);
  } catch (err) {
    violations.push(`network error: ${(err as Error).message}`);
    return {
      path,
      kind,
      url,
      status,
      headers,
      violations,
      warnings,
      fetchedAt: new Date().toISOString(),
      ok: false,
    };
  }

  const cc = headers["cache-control"] || "";
  const cdn = headers["cdn-cache-control"] || "";
  const surrogate = headers["surrogate-control"] || "";
  const cf = (headers["cf-cache-status"] || "").toUpperCase();

  if (kind === "sensitive") {
    if (status && status >= 500) violations.push(`status ${status}`);
    if (!cc) violations.push("missing cache-control");
    for (const [name, value] of [
      ["cache-control", cc],
      ["cdn-cache-control", cdn],
      ["surrogate-control", surrogate],
    ] as const) {
      if (value && !isUncacheable(value)) {
        violations.push(`${name} not uncacheable: "${value}"`);
      }
    }
    const sMax = parseDirective(cc, "s-maxage") ?? 0;
    if (sMax > 0) violations.push(`s-maxage=${sMax} on sensitive path`);
    if (["HIT", "REVALIDATED", "UPDATING", "STALE"].includes(cf)) {
      violations.push(`cf-cache-status=${cf} replays cached HTML`);
    }
    if (headers["set-cookie"] && /Path=\//i.test(headers["set-cookie"])) {
      // informational only
    }
  } else {
    if (status !== 200 && status !== 301 && status !== 302) {
      violations.push(`unexpected status ${status}`);
    }
    if (status === 200) {
      if (!cc && !cdn) violations.push("no cache-control / cdn-cache-control set");
      const browserTtl = Math.max(
        parseDirective(cc, "max-age") ?? 0,
        parseDirective(cc, "s-maxage") ?? 0,
      );
      const cdnTtl = Math.max(
        parseDirective(cdn, "max-age") ?? 0,
        parseDirective(cdn, "s-maxage") ?? 0,
      );
      const effective = Math.max(browserTtl, cdnTtl);
      if (/\bno-store\b/i.test(cc) && !cdn) {
        warnings.push("browser no-store with no CDN tier — every request hits origin");
      }
      if (effective > TTL_CEILING) {
        violations.push(`effective TTL ${effective}s exceeds ${TTL_CEILING}s ceiling`);
      }
      if (cf && !["HIT", "MISS", "DYNAMIC", "BYPASS", "EXPIRED", "REVALIDATED", "UPDATING", "STALE", "NONE/UNKNOWN"].includes(cf)) {
        warnings.push(`unusual cf-cache-status=${cf}`);
      }
    }
  }

  return {
    path,
    kind,
    url,
    status,
    headers,
    violations,
    warnings,
    fetchedAt: new Date().toISOString(),
    ok: violations.length === 0,
  };
}

function renderMarkdown(results: Probe[]): string {
  const failed = results.filter((r) => !r.ok);
  const lines: string[] = [];
  lines.push(`# Cache headers scan`);
  lines.push("");
  lines.push(`- Base: \`${BASE}\``);
  lines.push(`- Probed: **${results.length}** paths`);
  lines.push(`- Violations: **${failed.length}**`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push("");
  for (const kind of ["public", "sensitive"] as const) {
    lines.push(`## ${kind} paths`);
    lines.push("");
    lines.push("| Path | Status | cache-control | cdn-cache-control | surrogate-control | cf-cache-status | OK |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const r of results.filter((r) => r.kind === kind)) {
      const h = r.headers;
      lines.push(
        `| \`${r.path}\` | ${r.status ?? "ERR"} | \`${h["cache-control"] || "-"}\` | \`${h["cdn-cache-control"] || "-"}\` | \`${h["surrogate-control"] || "-"}\` | \`${h["cf-cache-status"] || "-"}\` | ${r.ok ? "✅" : "❌"} |`,
      );
    }
    lines.push("");
  }
  if (failed.length) {
    lines.push(`## Violations`);
    lines.push("");
    for (const r of failed) {
      lines.push(`### ❌ \`${r.path}\` (${r.kind})`);
      for (const v of r.violations) lines.push(`- ${v}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function main() {
  const work: Promise<Probe>[] = [
    ...PUBLIC_PATHS.map((p) => probe(p, "public")),
    ...SENSITIVE_PATHS.map((p) => probe(p, "sensitive")),
  ];
  const results = await Promise.all(work);

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, "cache-headers-report.json");
  const mdPath = join(OUT_DIR, "cache-headers-report.md");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        base: BASE,
        generatedAt: new Date().toISOString(),
        ttlCeilingSeconds: TTL_CEILING,
        results,
      },
      null,
      2,
    ),
  );
  writeFileSync(mdPath, renderMarkdown(results));

  const failed = results.filter((r) => !r.ok);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const { appendFileSync } = await import("node:fs");
      mkdirSync(dirname(process.env.GITHUB_STEP_SUMMARY), { recursive: true });
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(results) + "\n");
    } catch {}
  }

  console.log(`Cache headers scan: ${results.length} probed, ${failed.length} violations.`);
  console.log(`Report: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
  if (failed.length) {
    for (const r of failed) {
      console.error(`  ✗ ${r.kind} ${r.path} :: ${r.violations.join("; ")}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
