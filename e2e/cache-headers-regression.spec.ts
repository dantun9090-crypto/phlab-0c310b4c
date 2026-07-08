/**
 * Cache-headers regression suite.
 *
 * Runs on every deploy (post-deploy workflow) and asserts that each
 * dynamic route CATEGORY still emits the expected cache-control /
 * cdn-cache-control / cf-cache-status. This is the last line of defence
 * against the "blank page after publish" regression: the origin can emit
 * the right headers but a Cloudflare cache-rule change (or the
 * phlabs-prerender Worker) can silently rewrite them at the edge.
 *
 * Categories under test (mirrors src/server.ts):
 *   1. html-shell          — top-level pages that render the SPA.
 *                            MUST be uncacheable on browser AND CDN.
 *   2. dynamic-asset       — /downloads/*, /robots.txt, /sitemap*.xml.
 *                            Browser may soft-cache; CDN MUST be no-store.
 *   3. sensitive           — /admin*, /auth*, /api/auth*, /api/admin*.
 *                            Strict no-store everywhere; never HIT on CF.
 *   4. immutable-asset     — hashed build output (/assets/*, /_build/*).
 *                            MUST be public + long max-age + immutable.
 *
 * BASE URL:
 *   TEST_BASE_URL env (defaults to https://phlabs.co.uk). Post-deploy CI
 *   sets it to the just-published origin so we're probing the live edge.
 *
 * How to run locally:
 *   TEST_BASE_URL=https://phlabs.co.uk bunx playwright test \
 *     e2e/cache-headers-regression.spec.ts --project=chromium
 */
import { test, expect, type APIResponse } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

/** Cache-buster so we never assert against a previously-cached response. */
function bust(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${sep}__cache_check=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

interface Headers {
  status: number;
  cacheControl: string;
  cdn: string;
  surrogate: string;
  cfStatus: string;
  age: number;
  contentType: string;
  buildId: string;
}

async function head(request: import("@playwright/test").APIRequestContext, path: string): Promise<Headers> {
  // GET (not HEAD) — some CF workers only run on GET and we want the exact
  // headers a real browser would receive.
  const res: APIResponse = await request.get(bust(path), {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const h = res.headers();
  return {
    status: res.status(),
    cacheControl: h["cache-control"] || "",
    cdn: h["cdn-cache-control"] || h["cloudflare-cdn-cache-control"] || "",
    surrogate: h["surrogate-control"] || "",
    cfStatus: (h["cf-cache-status"] || "").toUpperCase(),
    age: Number(h["age"] || "0") || 0,
    contentType: h["content-type"] || "",
    buildId: h["x-build-id"] || "",
  };
}

function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

function isUncacheable(header: string): boolean {
  if (!header) return false;
  const h = header.toLowerCase();
  if (/\bno-store\b/.test(h)) return true;
  const ma = parseDirective(h, "max-age") ?? -1;
  return ma === 0 && /must-revalidate/.test(h);
}

const NEVER_CF_HIT = ["HIT", "REVALIDATED", "STALE", "UPDATING"];

// ---------------------------------------------------------------------------
// 1. HTML shells — must never be edge-cached.
// ---------------------------------------------------------------------------
const HTML_SHELLS = [
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

test.describe("cache headers · HTML shells (must not edge-cache)", () => {
  for (const path of HTML_SHELLS) {
    test(`shell ${path}`, async ({ request }) => {
      const h = await head(request, path);
      expect(h.status, `status for ${path}`).toBe(200);
      expect(h.contentType, `content-type for ${path}`).toMatch(/text\/html/);

      // Browser tier: must be no-store or max-age=0+must-revalidate.
      expect(isUncacheable(h.cacheControl), `cache-control uncacheable (${h.cacheControl})`).toBe(true);

      // CDN tier: must contain no-store, else CF holds the shell across a
      // deploy and serves it against evicted hashed chunks.
      const cdnHeader = h.cdn || h.surrogate;
      expect(cdnHeader, `cdn-cache-control present for ${path}`).not.toBe("");
      expect(cdnHeader.toLowerCase(), `cdn-cache-control no-store (${cdnHeader})`).toContain("no-store");

      // No s-maxage anywhere.
      expect(parseDirective(h.cacheControl, "s-maxage") ?? 0).toBe(0);
      expect(parseDirective(h.cdn, "s-maxage") ?? 0).toBe(0);

      // CF must not be replaying a cached shell.
      expect(NEVER_CF_HIT, `cf-cache-status not HIT-like (${h.cfStatus})`).not.toContain(h.cfStatus);
      expect(h.age, `age must be 0 (was ${h.age})`).toBe(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Dynamic assets — /downloads/*, /robots.txt, /sitemap*.xml.
//     Browser may soft-cache (5 min, must-revalidate); CDN MUST be no-store.
// ---------------------------------------------------------------------------
const DYNAMIC_ASSETS = [
  "/downloads/protocol-library.pdf",
  "/downloads/PH-Labs-Research-Catalogue.pdf",
  "/robots.txt",
  "/sitemap.xml",
];

test.describe("cache headers · dynamic assets (CDN no-store)", () => {
  for (const path of DYNAMIC_ASSETS) {
    test(`dynamic-asset ${path}`, async ({ request }) => {
      const h = await head(request, path);
      expect([200, 301, 302], `status for ${path} (was ${h.status})`).toContain(h.status);
      if (h.status !== 200) return;

      // CDN MUST be no-store — otherwise a stale PDF/sitemap survives
      // across content updates.
      const cdnHeader = h.cdn || h.surrogate;
      expect(cdnHeader, `cdn-cache-control present for ${path}`).not.toBe("");
      expect(cdnHeader.toLowerCase(), `cdn-cache-control no-store (${cdnHeader})`).toContain("no-store");

      // Browser tier may cache briefly but must revalidate — no immutable,
      // no s-maxage>0.
      expect(h.cacheControl.toLowerCase(), `no immutable on ${path}`).not.toContain("immutable");
      expect(parseDirective(h.cacheControl, "s-maxage") ?? 0).toBe(0);
      const browserMaxAge = parseDirective(h.cacheControl, "max-age") ?? 0;
      expect(browserMaxAge, `browser max-age <= 300 (was ${browserMaxAge})`).toBeLessThanOrEqual(300);

      // CF must not be replaying a cached object.
      expect(NEVER_CF_HIT, `cf-cache-status (${h.cfStatus})`).not.toContain(h.cfStatus);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Sensitive routes — strict no-store on every tier.
// ---------------------------------------------------------------------------
const SENSITIVE = [
  "/admin",
  "/auth",
  "/api/auth/callback",
  "/api/admin/health",
];

test.describe("cache headers · sensitive routes (strict no-store)", () => {
  for (const path of SENSITIVE) {
    test(`sensitive ${path}`, async ({ request }) => {
      const h = await head(request, path);
      // Any status is fine (401/403/404 legit); headers are what we assert.
      for (const [name, value] of [
        ["cache-control", h.cacheControl],
        ["cdn-cache-control", h.cdn],
        ["surrogate-control", h.surrogate],
      ] as const) {
        if (value) {
          expect(isUncacheable(value), `${name} uncacheable on ${path} ("${value}")`).toBe(true);
        }
      }
      expect(parseDirective(h.cacheControl, "s-maxage") ?? 0).toBe(0);
      expect(NEVER_CF_HIT, `cf-cache-status (${h.cfStatus}) on ${path}`).not.toContain(h.cfStatus);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Hashed immutable build assets — MUST be aggressively cached forever.
//     We discover one asset from the home-page HTML rather than hard-coding a
//     path that would drift on every deploy.
// ---------------------------------------------------------------------------
test("cache headers · hashed build asset is immutable", async ({ request }) => {
  const homeRes = await request.get(bust("/"), {
    headers: { "cache-control": "no-cache" },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(homeRes.status()).toBe(200);
  const html = await homeRes.text();

  // Grab the first hashed /assets/*.js or /_build/*.js reference.
  const match = html.match(/\/(?:assets|_build)\/[A-Za-z0-9._/-]+\.(?:js|css)/);
  test.skip(!match, "no hashed asset URL found in home HTML");
  const assetPath = match![0];

  const h = await head(request, assetPath);
  expect(h.status, `status for ${assetPath}`).toBe(200);

  const cc = h.cacheControl.toLowerCase();
  expect(cc, `cache-control has 'public' (${h.cacheControl})`).toContain("public");
  expect(cc, `cache-control has 'immutable' (${h.cacheControl})`).toContain("immutable");
  const maxAge = parseDirective(h.cacheControl, "max-age") ?? 0;
  expect(maxAge, `max-age >= 31536000 (was ${maxAge})`).toBeGreaterThanOrEqual(31536000);
});
