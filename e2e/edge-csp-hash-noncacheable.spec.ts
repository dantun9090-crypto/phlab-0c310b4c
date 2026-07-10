/**
 * Edge CSP hash + cacheability — non-cacheable routes.
 *
 * Authenticated / payment / admin paths must:
 *   1. Emit a CSP with no `__CSP_NONCE__` placeholder leaks.
 *   2. Carry `Cache-Control: no-store` (or equivalent private/no-cache).
 *   3. Never serve from `cf-cache-status: HIT` and never carry a Worker
 *      `x-phl-cache: HIT` marker.
 *
 * Production-only.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "https://phlabs.co.uk";
const isProd = /(^|\/\/)phlabs\.co\.uk/i.test(BASE);

test.describe("Edge CSP hash — non-cacheable (auth/payment/admin) routes", () => {
  test.skip(!isProd, "Edge worker tests run against production phlabs.co.uk");

  for (const path of ["/login", "/checkout", "/account", "/admin"]) {
    test(`${path} — no placeholder, never edge-cached`, async ({ request }) => {
      const r1 = await request.get(`${BASE}${path}`, { maxRedirects: 0 });
      const csp1 = r1.headers()["content-security-policy"] ?? "";
      expect(csp1).not.toContain("__CSP_NONCE__");

      const cacheControl = (r1.headers()["cache-control"] ?? "").toLowerCase();
      expect(
        /no-store|private|no-cache/.test(cacheControl),
        `Expected non-cacheable Cache-Control for ${path}, got "${cacheControl}"`,
      ).toBeTruthy();

      const cfStatus = (r1.headers()["cf-cache-status"] ?? "").toUpperCase();
      const phlCache = (r1.headers()["x-phl-cache"] ?? "").toUpperCase();
      expect(cfStatus).not.toBe("HIT");
      expect(phlCache.startsWith("HIT")).toBe(false);
    });
  }
});
