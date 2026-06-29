/**
 * Edge CSP nonce + cacheability — cacheable routes.
 *
 * Verifies the Worker (`phlabs-prerender`) replaces every `__CSP_NONCE__`
 * placeholder emitted by the origin with a real nonce, AND that the response
 * for an anonymous cacheable route can populate the edge cache (HIT on the
 * second request).
 *
 * Production-only. Runs against the live phlabs.co.uk surface — skipped when
 * TEST_BASE_URL is not the prod host (e.g. local dev / Lovable preview).
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "https://phlabs.co.uk";
const isProd = /(^|\/\/)phlabs\.co\.uk/i.test(BASE);

test.describe("Edge CSP nonce — cacheable routes", () => {
  test.skip(!isProd, "Edge worker tests run against production phlabs.co.uk");

  for (const path of ["/", "/products", "/compound"]) {
    test(`${path} — nonce rewritten and edge-cacheable`, async ({ request }) => {
      // Prime then re-fetch so the second hit can show a cache HIT marker.
      const r1 = await request.get(`${BASE}${path}`, { headers: { "cache-control": "no-cache" } });
      const r2 = await request.get(`${BASE}${path}`);

      expect(r2.status()).toBe(200);
      const csp = r2.headers()["content-security-policy"] ?? "";
      const body = await r2.text();

      // Nonce placeholder must NEVER leak to the client.
      expect(csp).not.toContain("__CSP_NONCE__");
      expect(body).not.toContain('nonce="__CSP_NONCE__"');
      expect(body).not.toContain("nonce='__CSP_NONCE__'");

      // Real nonce present in CSP and reused on at least one inline script.
      const m = csp.match(/'nonce-([A-Za-z0-9+/_-]{16,})'/);
      expect(m, `CSP missing real nonce: ${csp}`).toBeTruthy();
      const nonce = m![1];
      expect(body).toContain(`nonce="${nonce}"`);

      // Cacheability: by the second hit we expect a HIT marker from either
      // Cloudflare's edge cache or the Worker's own caches.default layer.
      const cfStatus = (r2.headers()["cf-cache-status"] ?? "").toUpperCase();
      const phlCache = (r2.headers()["x-phl-cache"] ?? "").toUpperCase();
      const cached = cfStatus === "HIT" || phlCache === "HIT" || phlCache.startsWith("HIT");
      expect(
        cached,
        `Expected edge cache HIT for ${path}. cf-cache-status=${cfStatus} x-phl-cache=${phlCache}`,
      ).toBeTruthy();

      // First and second requests must carry DIFFERENT nonces in CSP — the
      // body is shared from cache, but the Worker rewrites the nonce on each
      // delivery so CSP enforcement stays per-request.
      const csp1 = r1.headers()["content-security-policy"] ?? "";
      const m1 = csp1.match(/'nonce-([A-Za-z0-9+/_-]{16,})'/);
      if (m1) expect(m1[1]).not.toBe(nonce);
      void r1;
    });
  }
});
