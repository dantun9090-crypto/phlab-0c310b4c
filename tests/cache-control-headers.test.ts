/**
 * Cache-Control header sanity test for the prerendered marketing pages.
 *
 * Goal: prevent the "endless client-side refresh" failure mode by asserting
 * that:
 *   - /compound and /research return a finite TTL (max-age > 0 OR
 *     s-maxage > 0) so the browser/CDN actually cache the HTML, AND
 *   - either `stale-while-revalidate` is set OR the TTL is short enough
 *     (<= 10 minutes) that a stale build cannot pin the user indefinitely.
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

      // Forbid no-store on prerendered marketing HTML — that disables the
      // edge cache entirely and is what causes the refresh-loop symptom.
      expect(cc).not.toMatch(/\bno-store\b/);

      const maxAge = parseDirective(cc, "max-age") ?? 0;
      const sMaxAge = parseDirective(cc, "s-maxage") ?? 0;
      const swr = parseDirective(cc, "stale-while-revalidate") ?? 0;

      // Must cache somewhere with a finite, non-zero TTL.
      expect(
        Math.max(maxAge, sMaxAge) > 0,
        `${path} must have a non-zero TTL (got "${cc}")`,
      ).toBe(true);

      // Either set stale-while-revalidate, or keep the TTL short enough
      // (<= 10 min) that a stale build can't trap the user.
      const ttl = Math.max(maxAge, sMaxAge);
      expect(
        swr > 0 || ttl <= 600,
        `${path}: need stale-while-revalidate OR ttl <= 600s (got max-age=${maxAge}, s-maxage=${sMaxAge}, swr=${swr})`,
      ).toBe(true);

      // Hard ceiling — never let a stale HTML response sit at the edge for
      // more than 1 hour without revalidation, even with SWR.
      expect(
        ttl <= 3600,
        `${path}: TTL ${ttl}s exceeds 1h ceiling`,
      ).toBe(true);
    });
  }
});
