/**
 * Post-deploy regression test for phlabs.co.uk.
 *
 * Verifies after every publish that:
 *   1. Public pages return 200, have correct dark-theme background markup,
 *      reference content-hashed JS/CSS assets, and carry a `build-id` meta
 *      tag (cache-busting / version tracking).
 *   2. Public HTML carries a finite, non-zero cache TTL (no `no-store`).
 *   3. Sensitive paths (/admin, /cart, /checkout, /account, /login,
 *      /register, /payment, /vip) are ALWAYS served `no-store` and do
 *      NOT have a positive max-age, so a stale shell can never trap a
 *      logged-in user on a broken build.
 *
 * Self-skips offline. Configure target via TEST_BASE_URL
 * (defaults to https://phlabs.co.uk).
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

const PUBLIC_PATHS = ["/", "/products", "/compound", "/research", "/landing/phlabs"];
const SENSITIVE_PATHS = [
  "/admin",
  "/cart",
  "/checkout",
  "/account",
  "/login",
  "/register",
  "/payment",
  "/vip",
];

type Probe =
  | { ok: true; status: number; headers: Headers; body: string }
  | { ok: false; error: unknown };

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "phlabs-post-deploy-regression/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = res.status >= 200 && res.status < 300 ? await res.text() : "";
    return { ok: true, status: res.status, headers: res.headers, body };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}=(\\d+)`));
  return m ? Number(m[1]) : null;
}

function strongestCacheHeader(h: Headers): string {
  // Cloudflare may strip `cdn-cache-control` from the eyeball response, but
  // we still care about the browser-visible Cache-Control for regression.
  return (h.get("cache-control") || "").toLowerCase();
}

describe("Post-deploy regression — public pages", () => {
  for (const path of PUBLIC_PATHS) {
    test(`${path} renders, has dark bg, hashed assets, build-id meta, finite TTL`, async () => {
      const r = await probe(`${BASE}${path}`);
      if (!r.ok) {
        console.warn(`[skip] ${path} unreachable:`, r.error);
        return;
      }
      // 200 OR 301/302 to canonical apex are both acceptable for /
      expect([200, 301, 302]).toContain(r.status);
      if (r.status !== 200) return;

      // ── Layout / background sanity ──
      // The SPA mount point must exist.
      expect(r.body, `${path} should contain SPA root mount`).toMatch(/<div[^>]+id=["']root["']/);
      // Locked design system: slate-950 background must be present in the
      // server-rendered shell (either as a class on <html>/<body> or in an
      // inline style). Catches the "white flash / wrong theme" regression.
      expect(
        /(bg-slate-950|#020617|--background|class=["'][^"']*\bdark\b)/i.test(r.body),
        `${path} HTML must declare dark/slate-950 theme in shell`,
      ).toBe(true);

      // ── Asset versioning / cache-busting ──
      // Vite emits hashed filenames (e.g. /assets/index-Ab12Cd34.js). The
      // shell must reference at least one such hashed asset; otherwise the
      // bundle isn't cache-busted and we'd risk stale-chunk loops.
      const hashedAsset = /\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|mjs)/;
      expect(
        hashedAsset.test(r.body),
        `${path} must reference at least one content-hashed asset`,
      ).toBe(true);

      // build-id meta tag (injected by src/server.ts HTMLRewriter) is the
      // canonical version marker for cache invalidation.
      expect(r.body).toMatch(/<meta\s+name=["']build-id["']\s+content=["'][^"']+["']/i);
      expect(r.headers.get("x-build-id") || "").not.toBe("");

      // ── Cache TTL ──
      const cc = strongestCacheHeader(r.headers);
      expect(cc, `${path} must set Cache-Control`).not.toBe("");
      expect(cc, `${path} must NOT be no-store`).not.toMatch(/\bno-store\b/);
      const ttl = Math.max(
        parseDirective(cc, "max-age") ?? 0,
        parseDirective(cc, "s-maxage") ?? 0,
      );
      expect(ttl, `${path} must have positive TTL, got "${cc}"`).toBeGreaterThan(0);
      expect(ttl, `${path} TTL ${ttl}s exceeds 1h ceiling`).toBeLessThanOrEqual(3600);
    });
  }
});

describe("Post-deploy regression — sensitive paths must stay no-store", () => {
  for (const path of SENSITIVE_PATHS) {
    test(`${path} must be no-store (never edge-cached)`, async () => {
      const r = await probe(`${BASE}${path}`);
      if (!r.ok) {
        console.warn(`[skip] ${path} unreachable:`, r.error);
        return;
      }
      // Any reachable response (200, 302 to /login, 401, 403…) must still
      // forbid caching.
      const cc = strongestCacheHeader(r.headers);
      expect(cc, `${path} must set Cache-Control`).not.toBe("");
      expect(cc, `${path} MUST contain no-store (got "${cc}")`).toMatch(/\bno-store\b/);

      const maxAge = parseDirective(cc, "max-age") ?? 0;
      const sMaxAge = parseDirective(cc, "s-maxage") ?? 0;
      expect(maxAge, `${path} must have max-age=0`).toBe(0);
      expect(sMaxAge, `${path} must have s-maxage=0`).toBe(0);

      // CDN-level header — if present, must also be no-store.
      const cdn = (r.headers.get("cdn-cache-control") || "").toLowerCase();
      if (cdn) {
        expect(cdn, `${path} cdn-cache-control must be no-store`).toMatch(/\bno-store\b/);
      }
    });
  }
});
