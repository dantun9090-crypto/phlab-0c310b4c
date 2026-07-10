/**
 * Edge CSP hash + cacheability — cacheable routes.
 *
 * Verifies the phlabs-prerender Worker's hash-at-cache-miss CSP path:
 *   1. No `__CSP_NONCE__` placeholder leaks in the CSP header or body.
 *   2. The CSP `script-src` (or `script-src-elem`) carries at least one
 *      `'sha256-...'` source and `'strict-dynamic'`.
 *   3. An anonymous cacheable route serves from an edge/Worker cache HIT
 *      on the second request.
 *
 * Production-only. Skipped when TEST_BASE_URL is not the prod host.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "https://phlabs.co.uk";
const isProd = /(^|\/\/)phlabs\.co\.uk/i.test(BASE);

test.describe("Edge CSP hash — cacheable routes", () => {
  test.skip(!isProd, "Edge worker tests run against production phlabs.co.uk");

  for (const path of ["/", "/products", "/compound"]) {
    test(`${path} — hash CSP and edge-cacheable`, async ({ request }) => {
      // Prime then re-fetch so the second hit can show a cache HIT marker.
      await request.get(`${BASE}${path}`, { headers: { "cache-control": "no-cache" } });
      const r2 = await request.get(`${BASE}${path}`);

      expect(r2.status()).toBe(200);
      const csp = r2.headers()["content-security-policy"] ?? "";
      const body = await r2.text();

      // Nonce placeholder must NEVER leak to the client.
      expect(csp).not.toContain("__CSP_NONCE__");
      expect(body).not.toContain("__CSP_NONCE__");

      // At least one sha256 source + strict-dynamic in script-src(-elem).
      expect(csp).toMatch(/'sha256-[A-Za-z0-9+/=]+'/);
      expect(csp).toContain("'strict-dynamic'");

      // Cacheability: by the second hit expect a HIT marker from either
      // Cloudflare's edge cache or the Worker's own caches.default layer.
      const cfStatus = (r2.headers()["cf-cache-status"] ?? "").toUpperCase();
      const phlCache = (r2.headers()["x-phl-cache"] ?? "").toUpperCase();
      const cached = cfStatus === "HIT" || phlCache === "HIT" || phlCache.startsWith("HIT");
      expect(
        cached,
        `Expected edge cache HIT for ${path}. cf-cache-status=${cfStatus} x-phl-cache=${phlCache}`,
      ).toBeTruthy();
    });
  }
});
