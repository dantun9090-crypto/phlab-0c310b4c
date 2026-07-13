// @vitest-environment node
/**
 * Regression test: every /products/category/* route responds HTTP 200.
 *
 * Two layers of coverage:
 *   1. BASELINE_SLUGS — a fixed list of every category we currently ship.
 *      If a slug in this list ever returns non-200 (backend deleted the
 *      category, route regressed, redirect broken), the test fails.
 *   2. DISCOVERED_SLUGS — every /products/category/<slug> href found on the
 *      live home page, so newly added categories are covered automatically.
 *
 * Env overrides:
 *   BASE_URL                     Origin under test (default https://phlabs.co.uk)
 *   SKIP_LIVE_CATEGORY_CHECK=1   Bypass locally when offline
 *
 * Run: bunx vitest run tests/products-category-live-200.test.ts
 */
import { describe, it, expect } from "vitest";

// NOTE: don't name this env var BASE_URL — Vite reserves that (defaults to "/")
// and it leaks into process.env during vitest runs, wiping our default.
const BASE = (process.env.CATEGORY_BASE_URL || "https://phlabs.co.uk").replace(/\/$/, "");


const UA = "phlabs-category-regression/1.0";
const PROBE_TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;

// Baseline: every category slug the site is currently expected to serve.
// Sourced from a live crawl of https://phlabs.co.uk (2026-07-13).
// Add new slugs here when categories launch so they're locked in as regression coverage.
const BASELINE_SLUGS = [
  "bacteriostatic-water",
  "blends",
  "bpc-157",
  "cellular-aging",
  "ghk-cu",
  "melanin",
  "metabolic-research",
  "metabolic-signaling",
  "neurological",
  "retatrutide",
  "tb-500",
  "tirzepatide",
  "tissue-repair",
] as const;

async function probeStatus(url: string): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    // HEAD first — some CDN edges 405 on HEAD, fall back to GET.
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": UA },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": UA },
      });
    }
    return res.status;
  } catch (err) {
    return (err as Error).name === "AbortError" ? 0 : -1;
  } finally {
    clearTimeout(timer);
  }
}

async function probeAll(
  urls: string[],
): Promise<Array<{ url: string; status: number }>> {
  const out: Array<{ url: string; status: number }> = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => ({ url, status: await probeStatus(url) })),
    );
    out.push(...results);
  }
  return out;
}

async function discoverSlugsFromHome(): Promise<string[]> {
  try {
    const res = await fetch(BASE + "/", { headers: { "user-agent": UA } });
    if (!res.ok) return [];
    const html = await res.text();
    const found = new Set<string>();
    const re = /\/products\/category\/([a-z0-9][a-z0-9-]*)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) found.add(m[1].toLowerCase());
    return [...found];
  } catch {
    return [];
  }
}

function statusLabel(status: number) {
  if (status === 0) return "TIMEOUT";
  if (status === -1) return "NETWORK_ERROR";
  return `HTTP ${status}`;
}

const skip = process.env.SKIP_LIVE_CATEGORY_CHECK === "1";
const describeMaybe = skip ? describe.skip : describe;

describeMaybe(`live category routes on ${BASE}`, () => {
  it(
    "every baseline /products/category/<slug> returns 200",
    async () => {
      const urls = BASELINE_SLUGS.map((s) => `${BASE}/products/category/${s}`);
      const results = await probeAll(urls);
      const bad = results.filter((r) => r.status !== 200);
      const report = bad.map((r) => `  ${statusLabel(r.status)}  ${r.url}`).join("\n");
      expect(
        bad,
        `${bad.length}/${results.length} baseline category URLs did not return 200:\n${report}`,
      ).toEqual([]);
    },
    5 * 60_000,
  );

  it(
    "every /products/category/<slug> discovered on the home page returns 200",
    async () => {
      const slugs = await discoverSlugsFromHome();
      // Missing home links aren't a hard failure — home page markup shifts
      // (carousels, hydration timing). The baseline test above still covers
      // regressions. Only fail here when discovery DOES find slugs but any
      // probe non-200.
      if (slugs.length === 0) return;
      const urls = slugs.map((s) => `${BASE}/products/category/${s}`);
      const results = await probeAll(urls);
      const bad = results.filter((r) => r.status !== 200);
      const report = bad.map((r) => `  ${statusLabel(r.status)}  ${r.url}`).join("\n");
      expect(
        bad,
        `${bad.length}/${results.length} home-page-linked category URLs did not return 200:\n${report}`,
      ).toEqual([]);
    },
    5 * 60_000,
  );
});
