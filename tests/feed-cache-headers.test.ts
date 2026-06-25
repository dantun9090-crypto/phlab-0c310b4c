/**
 * Regression: XML feeds must declare correct Cache-Control,
 * Surrogate-Control and TTL.
 *
 * Spec:
 *  - /sitemap.xml          → public, max-age=3600 (+ s-maxage=3600), Surrogate-Control max-age=3600
 *  - /bing-feed.xml        → public, max-age=3600, s-maxage=3600, Surrogate-Control max-age=3600
 *  - /google-merchant-feed.xml → no-store on Cache-Control AND Surrogate-Control
 *                            (Google fetches manually; must never serve cached HTML)
 *
 * Runs against TEST_BASE_URL (defaults to production). Skips gracefully
 * if the host is unreachable so local `vitest` runs don't false-fail.
 */
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";
const REQUIRED_TTL = 3600;

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
  describe.each([
    { path: "/sitemap.xml", label: "sitemap" },
    { path: "/bing-feed.xml", label: "bing merchant feed" },
  ])("$label ($path) — cacheable, TTL ≥ 3600s", ({ path }) => {
    it("declares Cache-Control with required TTL", async () => {
      const res = await head(path);
      if (!res) return; // host unreachable — skip
      expect(res.status, `unexpected status for ${path}`).toBe(200);
      const cc = res.headers.get("cache-control");
      expect(cc, `missing Cache-Control on ${path}`).toBeTruthy();
      expect(isNoStore(cc), `${path} must be cacheable`).toBe(false);
      const ttl = Math.max(
        parseMaxAge(cc, "max-age") ?? 0,
        parseMaxAge(cc, "s-maxage") ?? 0,
      );
      expect(
        ttl,
        `${path} Cache-Control TTL must be ≥ ${REQUIRED_TTL}s, got ${ttl}`,
      ).toBeGreaterThanOrEqual(REQUIRED_TTL);
    });

    it("declares Surrogate-Control with required TTL", async () => {
      const res = await head(path);
      if (!res) return;
      const sc = res.headers.get("surrogate-control");
      expect(sc, `missing Surrogate-Control on ${path}`).toBeTruthy();
      expect(isNoStore(sc), `${path} Surrogate-Control must not be no-store`).toBe(false);
      const ttl = parseMaxAge(sc, "max-age") ?? 0;
      expect(
        ttl,
        `${path} Surrogate-Control TTL must be ≥ ${REQUIRED_TTL}s, got ${ttl}`,
      ).toBeGreaterThanOrEqual(REQUIRED_TTL);
    });
  });

  describe("google merchant feed (/google-merchant-feed.xml) — always fresh", () => {
    const path = "/google-merchant-feed.xml";

    it("Cache-Control is no-store", async () => {
      const res = await head(path);
      if (!res) return;
      expect(res.status).toBe(200);
      const cc = res.headers.get("cache-control");
      expect(cc, "missing Cache-Control").toBeTruthy();
      expect(isNoStore(cc), `Cache-Control must be no-store, got "${cc}"`).toBe(true);
    });

    it("Surrogate-Control is no-store", async () => {
      const res = await head(path);
      if (!res) return;
      const sc = res.headers.get("surrogate-control");
      expect(sc, "missing Surrogate-Control").toBeTruthy();
      expect(isNoStore(sc), `Surrogate-Control must be no-store, got "${sc}"`).toBe(true);
    });

    it("CDN-Cache-Control is no-store (defense in depth)", async () => {
      const res = await head(path);
      if (!res) return;
      const cdn =
        res.headers.get("cdn-cache-control") ||
        res.headers.get("cloudflare-cdn-cache-control");
      expect(cdn, "missing CDN-Cache-Control").toBeTruthy();
      expect(isNoStore(cdn), `CDN-Cache-Control must be no-store, got "${cdn}"`).toBe(true);
    });
  });
});
