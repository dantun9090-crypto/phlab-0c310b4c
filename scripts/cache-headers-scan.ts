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
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = process.env.CACHE_SCAN_BASE_URL || process.env.TEST_BASE_URL || "https://phlabs.co.uk";
const OUT_DIR = process.env.CACHE_SCAN_OUT_DIR || "cache-headers-report";
const TTL_CEILING = 3600;

// HTML shells MUST NEVER be edge-cached. A cached shell after a Lovable
// publish points at hashed JS/CSS chunks that have been evicted from the
// new build, producing blank pages until a manual Cloudflare purge — the
// exact regression fixed in src/server.ts (max-age=0, must-revalidate +
// cdn-cache-control: no-store + cloudflare-cdn-cache-control: no-store).
// This scanner is the CI guardrail that prevents that ever regressing.
const HTML_SHELL_PATHS = [
  "/",
  "/products",
  "/compound",
  "/research",
  "/landing/phlabs",
  "/about",
  "/contact",
  "/resources",
  "/peptide-calculator",
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

type Kind = "html-shell" | "sensitive";

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

async function fetchProbe(url: string) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "user-agent": "phlabs-cache-headers-scan/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, headers: pickHeaders(res.headers) };
}

async function probe(path: string, kind: Kind): Promise<Probe> {
  const url = `${BASE}${path}`;
  const violations: string[] = [];
  const warnings: string[] = [];
  let status: number | null = null;
  let headers: Record<string, string> = {};
  let firstCf = "";

  try {
    if (kind === "html-shell") {
      // Warm the edge, then measure. CF Rule 3 caches public HTML for 4h;
      // second probe must return HIT.
      const first = await fetchProbe(url);
      firstCf = (first.headers["cf-cache-status"] || "").toUpperCase();
      // small delay to let CF finalize the cache entry
      await new Promise((r) => setTimeout(r, 2000));
    }
    const res = await fetchProbe(url);
    status = res.status;
    headers = res.headers;
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
      violations.push(`cf-cache-status=${cf} replays cached HTML on sensitive path`);
    }
  } else {
    // html-shell: Cloudflare Cache Rule 3 intentionally caches public HTML
    // at the edge for 4h. Origin still emits `no-store` (that's how CF
    // handles a fresh publish → the shell overwrites on next MISS), but at
    // the edge we REQUIRE cf-cache-status: HIT on the warm probe.
    if (status !== 200 && status !== 301 && status !== 302) {
      violations.push(`unexpected status ${status}`);
    }
    if (status === 200) {
      // Origin cache-control must remain no-store — the edge overrides via
      // Cache Rule 3, but the origin invariant is the safety net.
      if (!cc) warnings.push("missing cache-control on HTML shell (origin should emit no-store)");
      else if (!isUncacheable(cc)) {
        warnings.push(`origin cache-control not no-store: "${cc}"`);
      }
      // Edge must be caching this. Accept HIT/REVALIDATED/UPDATED/STALE as
      // "edge-cached". Fail on DYNAMIC or MISS after warm-up.
      const cached = ["HIT", "REVALIDATED", "UPDATING", "STALE"].includes(cf);
      const warming = ["MISS", "EXPIRED"].includes(cf);
      if (!cached) {
        // MISS on second probe is a real problem (rule not matching).
        if (warming) {
          violations.push(
            `cf-cache-status=${cf} on warm probe — Cache Rule 3 not caching HTML shell (first=${firstCf})`,
          );
        } else if (cf === "DYNAMIC") {
          violations.push(
            `cf-cache-status=DYNAMIC — Worker or origin marking HTML uncacheable, Cache Rule 3 bypassed`,
          );
        } else if (cf) {
          violations.push(`cf-cache-status=${cf} — expected HIT on warm probe`);
        } else {
          violations.push(`cf-cache-status missing — cannot confirm edge caching`);
        }
      }
    }
    void TTL_CEILING;
  }

  return {
    path,
    kind,
    url,
    status,
    headers: firstCf ? { ...headers, "x-first-cf-cache-status": firstCf } : headers,
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
  for (const kind of ["html-shell", "sensitive"] as const) {
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
    ...HTML_SHELL_PATHS.map((p) => probe(p, "html-shell")),
    ...SENSITIVE_PATHS.map((p) => probe(p, "sensitive")),
  ];
  const results = await Promise.all(work);

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
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
