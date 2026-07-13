/**
 * CF-Cache-Status regression guard.
 *
 * Every human-facing HTML route on phlabs.co.uk MUST reach the origin
 * (Worker) on every request — Cloudflare must NOT serve a cached HTML
 * shell. In practice that means `cf-cache-status` on HTML responses
 * belongs to a small allowlist of "origin was hit" values:
 *
 *   - DYNAMIC   — CF sees the response as uncacheable (no-store)
 *   - BYPASS    — a cache rule / config told CF to skip the cache
 *   - MISS      — no cached copy existed (rare on HTML with no-store, but valid)
 *   - EXPIRED   — the previous copy expired and CF revalidated
 *   - NONE/UNKNOWN — no CF cache decision recorded
 *
 * Anything else (HIT, STALE, REVALIDATED, UPDATING) means Cloudflare
 * replayed a cached HTML shell — the exact failure mode that produced
 * the "old version flashes for 1–3s" and "0 changes after publish"
 * incidents. Those are hard failures.
 *
 * Runs against the production origin (or TEST_BASE_URL) and cache-busts
 * every request so a HIT here is a real regression, not a stale local
 * copy.
 *
 * Run:
 *   TEST_BASE_URL=https://phlabs.co.uk bunx playwright test \
 *     e2e/cf-cache-status.spec.ts --project=chromium
 */
import { test, expect, type APIResponse } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";
const ATTEMPTS = Number(process.env.CF_CACHE_ATTEMPTS || "3");

// HTML routes that must never be served from the CF HTML cache.
// Kept in sync with e2e/html-no-store.spec.ts — if you add a route here,
// add it there too.
const HTML_ROUTES = [
  "/",
  "/products",
  "/compound",
  "/research",
  "/resources",
  "/about",
  "/contact",
  "/peptide-calculator",
  "/downloads",
  "/landing/phlabs",
];

// Values that mean "origin served this response" — acceptable.
const ALLOWED_CF_STATUS = new Set([
  "DYNAMIC",
  "BYPASS",
  "MISS",
  "EXPIRED",
  "NONE/UNKNOWN",
  "", // some edges omit the header entirely on truly dynamic paths
]);

// Values that mean "CF replayed a cached HTML shell" — forbidden.
const FORBIDDEN_CF_STATUS = new Set(["HIT", "STALE", "REVALIDATED", "UPDATING"]);

function bust(path: string, attempt: number): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${sep}__cf_status_check=${Date.now()}-${attempt}-${Math.random().toString(36).slice(2, 8)}`;
}

async function probe(
  request: import("@playwright/test").APIRequestContext,
  path: string,
  attempt: number,
) {
  const res: APIResponse = await request.get(bust(path, attempt), {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "phlabs-cf-cache-status-guard/1.0",
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const h = res.headers();
  return {
    status: res.status(),
    cfStatus: (h["cf-cache-status"] || "").toUpperCase(),
    age: Number(h["age"] || "0") || 0,
    contentType: h["content-type"] || "",
    cacheControl: (h["cache-control"] || "").toLowerCase(),
  };
}

test.describe(`CF-Cache-Status on HTML routes · ${BASE}`, () => {
  for (const path of HTML_ROUTES) {
    test(`origin-served (not HIT/STALE) on ${path}`, async ({ request }) => {
      // Multiple cache-busted probes — a single-shot MISS could mask a
      // rule that starts caching after warm-up. If any attempt trips
      // the forbidden set, fail the whole test.
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const r = await probe(request, path, attempt);

        expect(r.status, `status for ${path} (attempt ${attempt})`).toBe(200);
        expect(r.contentType, `content-type for ${path} (attempt ${attempt})`).toMatch(
          /text\/html/,
        );

        expect(
          FORBIDDEN_CF_STATUS.has(r.cfStatus),
          `cf-cache-status must not indicate a cached-shell replay on ${path} ` +
            `(attempt ${attempt}, got "${r.cfStatus}", cache-control="${r.cacheControl}")`,
        ).toBe(false);

        expect(
          ALLOWED_CF_STATUS.has(r.cfStatus),
          `cf-cache-status on ${path} must be one of DYNAMIC/BYPASS/MISS/EXPIRED/NONE-UNKNOWN ` +
            `(attempt ${attempt}, got "${r.cfStatus}")`,
        ).toBe(true);

        // Age must be 0 — anything else means CF served an aged cached copy.
        expect(
          r.age,
          `age must be 0 on ${path} (attempt ${attempt}, was ${r.age}, cf="${r.cfStatus}")`,
        ).toBe(0);
      }
    });
  }
});
