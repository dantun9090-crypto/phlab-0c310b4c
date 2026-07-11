/**
 * Cache-Control header sanity test for public marketing pages.
 *
 * Goal: prevent the "endless client-side refresh" failure mode by asserting
 * that:
 *   - /compound and /research do not return long-lived HTML caching, and
 *   - the browser/CDN must revalidate or refetch the HTML on every visit.
 *
 * Self-skips offline (CI may run without network egress).
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";

const BASE =
  process.env.TEST_BASE_URL ||
  process.env.COMPOUND_BASE_URL ||
  "https://phlabs.co.uk";

const PATHS = ["/compound", "/research"];

async function probe(url: string) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "phlabs-cache-header-test/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: true as const,
      status: res.status,
      cacheControl: res.headers.get("cache-control") ?? "",
      cdnCacheControl: res.headers.get("cdn-cache-control") ?? "",
      surrogate: res.headers.get("surrogate-control") ?? "",
    };
  } catch (err) {
    return { ok: false as const, error: err };
  }
}

function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}=(\\d+)`));
  return m ? Number(m[1]) : null;
}

describe("Cache-Control headers for marketing routes", () => {
  for (const path of PATHS) {
    test(`${path} returns sane cache headers (no infinite refresh)`, async () => {
      const result = await probe(`${BASE}${path}`);
      if (!result.ok) {
        console.warn(`[skip] ${path} unreachable:`, result.error);
        return;
      }
      expect(result.status, `${path} should be 200`).toBe(200);

      const cc = result.cacheControl.toLowerCase();
      expect(cc, `${path} must set Cache-Control`).not.toBe("");

      const maxAge = parseDirective(cc, "max-age") ?? 0;
      const sMaxAge = parseDirective(cc, "s-maxage") ?? 0;
      const cdn = result.cdnCacheControl.toLowerCase();
      const surrogate = result.surrogate.toLowerCase();

      expect(cc, `${path} must force browser revalidation`).toContain("no-cache");
      expect(cc, `${path} must not cache HTML in the browser`).toContain("no-store");
      expect(cc, `${path} must require revalidation`).toContain("must-revalidate");
      expect(maxAge, `${path} browser HTML max-age must be 0`).toBe(0);
      expect(sMaxAge, `${path} shared HTML s-maxage must be 0`).toBe(0);

      if (cdn) expect(cdn, `${path} CDN HTML cache must be disabled`).toMatch(/\bno-store\b/);
      if (surrogate) expect(surrogate, `${path} surrogate HTML cache must be disabled`).toMatch(/\bno-store\b/);
    });
  }
});
