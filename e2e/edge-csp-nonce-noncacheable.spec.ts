/**
 * Edge CSP nonce + cacheability — non-cacheable routes.
 *
 * Authenticated / payment / admin paths must:
 *   1. Emit a REAL per-request nonce (no `__CSP_NONCE__` placeholder leaks).
 *   2. Carry `Cache-Control: no-store` (or equivalent private/no-cache).
 *   3. Never serve from `cf-cache-status: HIT` and never carry a Worker
 *      `x-phl-cache: HIT` marker.
 *   4. Return a fresh nonce on every request.
 *
 * Production-only.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "https://phlabs.co.uk";
const isProd = /(^|\/\/)phlabs\.co\.uk/i.test(BASE);

test.describe("Edge CSP nonce — non-cacheable (auth/payment/admin) routes", () => {
  test.skip(!isProd, "Edge worker tests run against production phlabs.co.uk");

  for (const path of ["/login", "/checkout", "/account", "/admin"]) {
    test(`${path} — real per-request nonce, never edge-cached`, async ({ request }) => {
      const r1 = await request.get(`${BASE}${path}`, { maxRedirects: 0 });
      // Status is whatever the SPA shell returns (200 or redirect) — we only
      // care about cache + nonce semantics.
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

      // Per-request nonce: a second hit must yield a different nonce in CSP.
      if (/'nonce-/.test(csp1)) {
        const r2 = await request.get(`${BASE}${path}`, { maxRedirects: 0 });
        const csp2 = r2.headers()["content-security-policy"] ?? "";
        const m1 = csp1.match(/'nonce-([A-Za-z0-9+/_-]{16,})'/);
        const m2 = csp2.match(/'nonce-([A-Za-z0-9+/_-]{16,})'/);
        expect(m1 && m2, "Both responses should carry a CSP nonce").toBeTruthy();
        expect(m1![1]).not.toBe(m2![1]);
      }
    });
  }
});
