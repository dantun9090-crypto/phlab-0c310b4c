/**
 * @vitest-environment node
 *
 * Regression: XML feeds and sitemaps must carry the cache policy that
 * src/server.ts (applyDynamicAssetCacheHeaders) and the bing-feed route
 * deliberately implement:
 *
 *  - /sitemap.xml              → browser: public, max-age=300, must-revalidate
 *                                edge/surrogate: no-store (never pin a stale copy)
 *  - /google-merchant-feed.xml → browser: public, max-age=300, must-revalidate
 *    /google-merchant-feed-free.xml  edge: public, max-age=900 + SWR 3600
 *                                (short edge HIT keeps Google fetches cheap;
 *                                fresh publishes evict via scoped purge)
 *  - /bing-feed.xml            → public, max-age=3600, s-maxage=3600,
 *                                Surrogate-Control max-age=3600 (set by the
 *                                route handler itself)
 *
 * Runs against TEST_BASE_URL (defaults to production). Skips gracefully
 * if the host is unreachable so local `vitest` runs don't false-fail.
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

function parseMaxAge(header: string | null, key: string): number | null {
  if (!header) return null;
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${key}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

function isNoStore(header: string | null): boolean {
  return !!header && /\bno-store\b/i.test(header);
}

async function head(path: string): Promise<Response | null> {
  try {
    return await fetch(`${BASE}${path}`, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "phlabs-feed-cache-regression/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return null;
  }
}

describe("XML feed cache headers", () => {
  describe("/sitemap.xml — short browser cache, no edge pin", () => {
    it("Cache-Control is public with max-age <= 300 and revalidation", async () => {
      const res = await head("/sitemap.xml");
      if (!res) return; // unreachable — skip
      const cc = res.headers.get("cache-control");
      expect(cc).toMatch(/public/i);
      const maxAge = parseMaxAge(cc, "max-age");
      expect(maxAge).not.toBeNull();
      expect(maxAge!).toBeLessThanOrEqual(300);
      expect(cc).toMatch(/must-revalidate|stale-while-revalidate/i);
    });

    it("CDN-Cache-Control is no-store (edge must not pin stale XML)", async () => {
      const res = await head("/sitemap.xml");
      if (!res) return;
      expect(isNoStore(res.headers.get("cdn-cache-control"))).toBe(true);
    });

    it("Surrogate-Control is no-store (defense in depth)", async () => {
      const res = await head("/sitemap.xml");
      if (!res) return;
      expect(isNoStore(res.headers.get("surrogate-control"))).toBe(true);
    });
  });

  describe.each([
    { path: "/google-merchant-feed.xml" },
    { path: "/google-merchant-feed-free.xml" },
  ])("$path — short edge cache, never long-pinned", ({ path }) => {
    it("browser Cache-Control is public, max-age <= 300", async () => {
      const res = await head(path);
      if (!res) return;
      const cc = res.headers.get("cache-control");
      expect(cc).toMatch(/public/i);
      const maxAge = parseMaxAge(cc, "max-age");
      expect(maxAge).not.toBeNull();
      expect(maxAge!).toBeLessThanOrEqual(300);
    });

    it("CDN cache is bounded (<= 900s) — Google must see fresh prices", async () => {
      const res = await head(path);
      if (!res) return;
      const cdn =
        res.headers.get("cloudflare-cdn-cache-control") || res.headers.get("cdn-cache-control");
      const maxAge = parseMaxAge(cdn, "max-age");
      // Either no CDN pin at all, or a short one. 31-day / immutable pins
      // are the regression this guards (stale prices → GMC disapprovals).
      if (maxAge !== null) expect(maxAge).toBeLessThanOrEqual(900);
      expect(cdn || "").not.toMatch(/immutable/i);
    });
  });

  describe("/bing-feed.xml — 1h cache set by the route", () => {
    // NOTE: the browser-facing `cache-control` on this path is rewritten by
    // the edge-html layer (outside this repo) to a long TTL. The route's own
    // contract that must survive is Surrogate-Control: max-age=3600 — that is
    // what keeps downstream caches bounded. Assert the invariants the route
    // controls, and that nothing marks the feed immutable.
    it("Surrogate-Control is max-age=3600 (bounded downstream cache)", async () => {
      const res = await head("/bing-feed.xml");
      if (!res) return;
      expect(parseMaxAge(res.headers.get("surrogate-control"), "max-age")).toBe(3600);
    });

    it("is XML, noindexed, and never immutable", async () => {
      const res = await head("/bing-feed.xml");
      if (!res) return;
      expect(res.headers.get("content-type") || "").toMatch(/xml/i);
      expect(res.headers.get("x-robots-tag") || "").toMatch(/noindex/i);
      const cc = res.headers.get("cache-control") || "";
      expect(cc).not.toMatch(/immutable/i);
    });
  });
});
