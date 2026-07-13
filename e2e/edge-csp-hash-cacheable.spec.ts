/**
 * Edge CSP/no-placeholder + no-cache — public HTML routes.
 *
 * Verifies the phlabs-prerender Worker/browser path:
 *   1. No `__CSP_NONCE__` placeholder leaks in the CSP header or body.
 *   2. The CSP carries strict-dynamic script protection.
 *   3. Public HTML shells stay no-store and are not replayed from edge cache.
 *
 * Production-only. Skipped when TEST_BASE_URL is not the prod host.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "https://phlabs.co.uk";
const isProd = /(^|\/\/)phlabs\.co\.uk/i.test(BASE);

test.describe("Edge CSP — public HTML no-cache routes", () => {
  test.skip(!isProd, "Edge worker tests run against production phlabs.co.uk");

  for (const path of ["/", "/products", "/compound"]) {
    test(`${path} — no placeholder and never edge-cached`, async ({ request }) => {
      const r2 = await request.get(`${BASE}${path}`);

      expect(r2.status()).toBe(200);
      const csp = r2.headers()["content-security-policy"] ?? "";
      const body = await r2.text();

      // Nonce placeholder must NEVER leak to the client.
      expect(csp).not.toContain("__CSP_NONCE__");
      expect(body).not.toContain("__CSP_NONCE__");

      // strict-dynamic must remain in script-src(-elem).
      expect(csp).toContain("'strict-dynamic'");

      const cacheControl = (r2.headers()["cache-control"] ?? "").toLowerCase();
      expect(cacheControl, `Expected no-store for ${path}`).toContain("no-store");
      const cfStatus = (r2.headers()["cf-cache-status"] ?? "").toUpperCase();
      const phlCache = (r2.headers()["x-phl-cache"] ?? "").toUpperCase();
      expect(["HIT", "REVALIDATED", "STALE", "UPDATING"], `cf-cache-status=${cfStatus}`).not.toContain(cfStatus);
      expect(phlCache.startsWith("HIT"), `x-phl-cache=${phlCache}`).toBe(false);
    });
  }
});
