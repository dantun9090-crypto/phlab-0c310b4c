#!/usr/bin/env bun
/**
 * HEAD-probe every dynamic route category and report drift from the
 * enforced cache policy (mirrors src/server.ts).
 *
 * Categories (see src/server.ts):
 *   1. html-shell       — SPA pages. cache-control uncacheable + CDN no-store.
 *   2. dynamic-asset    — /downloads/*, /robots.txt, /sitemap*.xml.
 *                         browser max-age <= 300, no immutable, CDN no-store.
 *   3. sensitive        — /admin*, /auth*, /api/auth*, /api/admin*.
 *                         strict no-store on every tier.
 *   4. immutable-asset  — hashed build output. public + immutable + max-age >= 1y.
 *
 * Usage:
 *   bun scripts/head-probe-cache-drift.ts
 *   PROBE_BASE_URL=https://id-preview--<id>.lovable.app bun scripts/head-probe-cache-drift.ts
 *   PROBE_JSON=1 bun scripts/head-probe-cache-drift.ts > report.json
 *
 * Exit codes: 0 = clean, 1 = drift, 2 = unexpected error.
 *
 * Notes:
 * - Uses HEAD (per the user brief). Some CDNs / workers behave differently
 *   on HEAD vs GET, so where a HEAD returns 405 / no cache headers we
 *   fall back to a GET with a cache-buster so the report is still useful.
 * - Each request uses a random query string so we never assert against a
 *   previously-cached response served to another probe.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE =
  process.env.PROBE_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";
const OUT_DIR = process.env.PROBE_OUT_DIR || "cache-drift-report";
const JSON_ONLY = process.env.PROBE_JSON === "1";
const IMMUTABLE_MIN_MAX_AGE = 31536000;

type Kind = "html-shell" | "dynamic-asset" | "sensitive" | "immutable-asset";

interface Target {
  path: string;
  kind: Kind;
  /** Discover URL from home HTML rather than hard-coding a hashed path. */
  discover?: "hashed-asset-from-home";
  /** Optional variants (split sitemaps): tolerate 404 / SPA fallback. */
  optional?: true;
}

const TARGETS: Target[] = [
  // html-shell
  { path: "/", kind: "html-shell" },
  { path: "/products", kind: "html-shell" },
  { path: "/compound", kind: "html-shell" },
  { path: "/research", kind: "html-shell" },
  { path: "/resources", kind: "html-shell" },
  { path: "/about", kind: "html-shell" },
  { path: "/contact", kind: "html-shell" },
  { path: "/downloads", kind: "html-shell" },
  { path: "/landing/phlabs", kind: "html-shell" },

  // dynamic-asset
  { path: "/downloads/protocol-library.pdf", kind: "dynamic-asset" },
  { path: "/downloads/PH-Labs-Research-Catalogue.pdf", kind: "dynamic-asset" },
  { path: "/robots.txt", kind: "dynamic-asset" },
  { path: "/sitemap.xml", kind: "dynamic-asset" },
  { path: "/sitemap-products.xml", kind: "dynamic-asset", optional: true },
  { path: "/sitemap-articles.xml", kind: "dynamic-asset", optional: true },

  // sensitive
  { path: "/admin", kind: "sensitive" },
  { path: "/auth", kind: "sensitive" },
  { path: "/api/auth/callback", kind: "sensitive" },
  { path: "/api/admin/health", kind: "sensitive" },

  // immutable-asset (discovered at probe time)
  { path: "<discovered>", kind: "immutable-asset", discover: "hashed-asset-from-home" },
];

// --------------------------------------------------------------------------
// Header helpers
// --------------------------------------------------------------------------
function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}
function hasNoStore(header: string): boolean {
  return /\bno-store\b/i.test(header);
}
function isUncacheable(header: string): boolean {
  if (!header) return false;
  if (hasNoStore(header)) return true;
  const ma = parseDirective(header, "max-age") ?? -1;
  return ma === 0 && /must-revalidate/i.test(header);
}
const NEVER_CF = new Set(["HIT", "REVALIDATED", "STALE", "UPDATING"]);

// --------------------------------------------------------------------------
// Probing
// --------------------------------------------------------------------------
interface ProbeHeaders {
  status: number;
  method: "HEAD" | "GET";
  contentType: string;
  cacheControl: string;
  cdnCacheControl: string;
  surrogateControl: string;
  cfCacheStatus: string;
  age: number;
  buildId: string;
  phlPolicy: string;
}

function bust(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${sep}__cache_drift=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchWithFallback(path: string): Promise<ProbeHeaders> {
  const url = bust(path);
  const commonHeaders = {
    "user-agent": "phlabs-cache-drift-probe/1.0",
    "cache-control": "no-cache",
    pragma: "no-cache",
  };

  let res: Response;
  let method: "HEAD" | "GET" = "HEAD";
  try {
    res = await fetch(url, {
      method: "HEAD",
      headers: commonHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    res = await fetch(url, {
      method: "GET",
      headers: commonHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    method = "GET";
  }

  // Some edges return 405 / strip cache headers on HEAD — fall back to GET.
  const status = res.status;
  const hasCache = res.headers.get("cache-control") || res.headers.get("cdn-cache-control");
  if (method === "HEAD" && (status === 405 || !hasCache)) {
    const getRes = await fetch(url, {
      method: "GET",
      headers: commonHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    return readHeaders(getRes, "GET");
  }
  return readHeaders(res, method);
}

function readHeaders(res: Response, method: "HEAD" | "GET"): ProbeHeaders {
  const h = res.headers;
  return {
    status: res.status,
    method,
    contentType: h.get("content-type") || "",
    cacheControl: h.get("cache-control") || "",
    cdnCacheControl: h.get("cdn-cache-control") || h.get("cloudflare-cdn-cache-control") || "",
    surrogateControl: h.get("surrogate-control") || "",
    cfCacheStatus: (h.get("cf-cache-status") || "").toUpperCase(),
    age: Number(h.get("age") || "0") || 0,
    buildId: h.get("x-build-id") || "",
    phlPolicy: h.get("x-phl-cache-policy") || "",
  };
}

async function discoverHashedAsset(): Promise<string | null> {
  try {
    const res = await fetch(bust("/"), {
      headers: { "user-agent": "phlabs-cache-drift-probe/1.0", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/\/(?:assets|_build)\/[A-Za-z0-9._/-]+\.(?:js|css)/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Policy enforcement per category
// --------------------------------------------------------------------------
function enforcePolicy(target: Target, path: string, h: ProbeHeaders): string[] {
  const violations: string[] = [];
  const cdn = h.cdnCacheControl || h.surrogateControl;

  switch (target.kind) {
    case "html-shell": {
      if (h.status !== 200 && h.status !== 301 && h.status !== 302) {
        violations.push(`unexpected status ${h.status}`);
      }
      if (h.status === 200) {
        if (!h.contentType || !/text\/html/i.test(h.contentType)) {
          violations.push(`content-type not text/html: "${h.contentType}"`);
        }
        if (!isUncacheable(h.cacheControl)) {
          violations.push(`browser cache-control not uncacheable: "${h.cacheControl}"`);
        }
        if (!cdn || !hasNoStore(cdn)) {
          violations.push(`cdn-cache-control must be no-store (got "${cdn || "unset"}")`);
        }
        const sCC = parseDirective(h.cacheControl, "s-maxage") ?? 0;
        const sCDN = parseDirective(h.cdnCacheControl, "s-maxage") ?? 0;
        if (sCC > 0 || sCDN > 0) violations.push(`s-maxage>0 (cc=${sCC}, cdn=${sCDN})`);
        if (NEVER_CF.has(h.cfCacheStatus)) violations.push(`cf-cache-status=${h.cfCacheStatus}`);
        if (h.age > 0) violations.push(`age=${h.age}s — served from CF cache`);
      }
      break;
    }
    case "dynamic-asset": {
      // Optional variants: tolerate 404 or SPA-fallback HTML.
      const isSpaFallback = h.status === 200 && /text\/html/i.test(h.contentType);
      if (target.optional && (h.status === 404 || isSpaFallback)) return violations;

      if (h.status !== 200) violations.push(`unexpected status ${h.status}`);
      if (!cdn) {
        violations.push("cdn-cache-control missing");
      } else if (!hasNoStore(cdn)) {
        violations.push(`cdn-cache-control not no-store: "${cdn}"`);
      }
      if (h.cacheControl) {
        if (/\bimmutable\b/i.test(h.cacheControl)) {
          violations.push(`cache-control has 'immutable' ("${h.cacheControl}")`);
        }
        const ma = parseDirective(h.cacheControl, "max-age");
        if (ma !== null && ma > 300) violations.push(`browser max-age=${ma} > 300`);
        const s = parseDirective(h.cacheControl, "s-maxage") ?? 0;
        if (s > 0) violations.push(`s-maxage=${s} on browser tier`);
      } else {
        violations.push("cache-control missing");
      }
      if (NEVER_CF.has(h.cfCacheStatus)) violations.push(`cf-cache-status=${h.cfCacheStatus}`);
      break;
    }
    case "sensitive": {
      for (const [name, value] of [
        ["cache-control", h.cacheControl],
        ["cdn-cache-control", h.cdnCacheControl],
        ["surrogate-control", h.surrogateControl],
      ] as const) {
        if (value && !isUncacheable(value)) {
          violations.push(`${name} not uncacheable: "${value}"`);
        }
      }
      const sMax = parseDirective(h.cacheControl, "s-maxage") ?? 0;
      if (sMax > 0) violations.push(`s-maxage=${sMax}`);
      if (NEVER_CF.has(h.cfCacheStatus)) violations.push(`cf-cache-status=${h.cfCacheStatus}`);
      break;
    }
    case "immutable-asset": {
      if (h.status !== 200) violations.push(`unexpected status ${h.status}`);
      const cc = h.cacheControl.toLowerCase();
      if (!/\bpublic\b/.test(cc)) violations.push(`cache-control missing 'public': "${h.cacheControl}"`);
      if (!/\bimmutable\b/.test(cc)) violations.push(`cache-control missing 'immutable': "${h.cacheControl}"`);
      const ma = parseDirective(h.cacheControl, "max-age") ?? 0;
      if (ma < IMMUTABLE_MIN_MAX_AGE) {
        violations.push(`max-age=${ma} < ${IMMUTABLE_MIN_MAX_AGE}`);
      }
      break;
    }
  }

  void path;
  return violations;
}

// --------------------------------------------------------------------------
// Reporting
// --------------------------------------------------------------------------
interface Result {
  path: string;
  kind: Kind;
  method: "HEAD" | "GET";
  status: number;
  contentType: string;
  cacheControl: string;
  cdnCacheControl: string;
  cfCacheStatus: string;
  age: number;
  buildId: string;
  phlPolicy: string;
  optionalSkipped: boolean;
  violations: string[];
  ok: boolean;
}

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const color = process.stdout.isTTY && !JSON_ONLY;
const c = (s: string, code: string) => (color ? `${code}${s}${ANSI.reset}` : s);

function padEnd(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function printReport(results: Result[]): void {
  const kinds: Kind[] = ["html-shell", "dynamic-asset", "sensitive", "immutable-asset"];
  const failed = results.filter((r) => !r.ok);

  console.log(c(`Cache-policy drift probe`, ANSI.bold));
  console.log(`  base:       ${BASE}`);
  console.log(`  probed:     ${results.length}`);
  console.log(
    `  status:     ${failed.length === 0 ? c("clean", ANSI.green) : c(`${failed.length} drifted`, ANSI.red)}`,
  );
  console.log("");

  for (const kind of kinds) {
    const rows = results.filter((r) => r.kind === kind);
    if (rows.length === 0) continue;
    console.log(c(`── ${kind} ──`, ANSI.cyan));
    console.log(
      c(
        `  ${padEnd("path", 44)} ${padEnd("st", 4)} ${padEnd("cf", 12)} ${padEnd("age", 5)} ${padEnd("cache-control", 42)} ${padEnd("cdn-cache-control", 24)}`,
        ANSI.dim,
      ),
    );
    for (const r of rows) {
      const badge = r.optionalSkipped
        ? c("skip", ANSI.yellow)
        : r.ok
        ? c("  ok", ANSI.green)
        : c("FAIL", ANSI.red);
      console.log(
        `  ${badge} ${padEnd(truncate(r.path, 42), 42)} ${padEnd(String(r.status), 4)} ${padEnd(r.cfCacheStatus || "-", 12)} ${padEnd(String(r.age), 5)} ${padEnd(truncate(r.cacheControl || "-", 40), 42)} ${padEnd(truncate(r.cdnCacheControl || "-", 22), 24)}`,
      );
    }
    console.log("");
  }

  if (failed.length) {
    console.log(c(`Drift details`, ANSI.bold));
    for (const r of failed) {
      console.log(`  ${c("✗", ANSI.red)} [${r.kind}] ${r.path}`);
      for (const v of r.violations) console.log(`      - ${v}`);
    }
    console.log("");
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  // Discover hashed asset if any target needs it.
  let discovered: string | null = null;
  if (TARGETS.some((t) => t.discover === "hashed-asset-from-home")) {
    discovered = await discoverHashedAsset();
  }

  const results: Result[] = await Promise.all(
    TARGETS.map(async (t): Promise<Result> => {
      const path = t.discover === "hashed-asset-from-home" ? discovered || "<not-discovered>" : t.path;

      if (t.discover && !discovered) {
        return {
          path,
          kind: t.kind,
          method: "GET",
          status: 0,
          contentType: "",
          cacheControl: "",
          cdnCacheControl: "",
          cfCacheStatus: "",
          age: 0,
          buildId: "",
          phlPolicy: "",
          optionalSkipped: true,
          violations: ["could not discover hashed asset from home HTML"],
          ok: false,
        };
      }

      let h: ProbeHeaders;
      try {
        h = await fetchWithFallback(path);
      } catch (err) {
        return {
          path,
          kind: t.kind,
          method: "GET",
          status: 0,
          contentType: "",
          cacheControl: "",
          cdnCacheControl: "",
          cfCacheStatus: "",
          age: 0,
          buildId: "",
          phlPolicy: "",
          optionalSkipped: false,
          violations: [`network error: ${(err as Error).message}`],
          ok: false,
        };
      }

      const violations = enforcePolicy(t, path, h);
      const isSpaFallback = h.status === 200 && /text\/html/i.test(h.contentType);
      const optionalSkipped = !!t.optional && (h.status === 404 || (t.kind === "dynamic-asset" && isSpaFallback));

      return {
        path,
        kind: t.kind,
        method: h.method,
        status: h.status,
        contentType: h.contentType,
        cacheControl: h.cacheControl,
        cdnCacheControl: h.cdnCacheControl,
        cfCacheStatus: h.cfCacheStatus,
        age: h.age,
        buildId: h.buildId,
        phlPolicy: h.phlPolicy,
        optionalSkipped,
        violations,
        ok: violations.length === 0,
      };
    }),
  );

  // Persist artifacts.
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, "cache-drift-report.json");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      { base: BASE, generatedAt: new Date().toISOString(), results },
      null,
      2,
    ),
  );

  if (JSON_ONLY) {
    console.log(JSON.stringify({ base: BASE, results }, null, 2));
  } else {
    printReport(results);
    console.log(c(`report: ${jsonPath}`, ANSI.dim));
  }

  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
