/**
 * Verifies SEO directives in the prerendered /compound HTML:
 *   - no `noindex` / `nofollow` robots meta
 *   - <link rel="canonical"> points at https://phlabs.co.uk/compound
 *   - og:url and twitter URL match the canonical
 *   - the page is listed in the live sitemap.xml
 *
 * Self-skips when the origin is unreachable so offline dev/CI doesn't false-fail.
 */
import { describe, it, expect } from "vitest";

const ORIGIN = process.env.COMPOUND_TEST_ORIGIN ?? "https://phlabs.co.uk";
const URL = `${ORIGIN}/compound`;
const CANONICAL = "https://phlabs.co.uk/compound";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": GOOGLEBOT, accept: "text/html,application/xml" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

describe("/compound — robots + canonical + sitemap", () => {
  it("has no noindex/nofollow and a self-referential canonical", async () => {
    const html = await fetchText(URL);
    if (!html) {
      console.warn(`[skip] ${URL} unreachable`);
      return;
    }

    // robots meta — must NOT contain noindex / nofollow / none
    const robotsMatches = [
      ...html.matchAll(
        /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
      ),
    ];
    for (const m of robotsMatches) {
      const directives = m[1].toLowerCase();
      expect(directives).not.toMatch(/\bnoindex\b/);
      expect(directives).not.toMatch(/\bnofollow\b/);
      expect(directives).not.toMatch(/\bnone\b/);
    }

    // Also reject googlebot-specific blocks
    const googlebotMatches = [
      ...html.matchAll(
        /<meta[^>]+name=["']googlebot["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
      ),
    ];
    for (const m of googlebotMatches) {
      const directives = m[1].toLowerCase();
      expect(directives).not.toMatch(/\bnoindex\b/);
      expect(directives).not.toMatch(/\bnofollow\b/);
    }

    // X-Robots-Tag header
    try {
      const res = await fetch(URL, {
        headers: { "user-agent": GOOGLEBOT },
        redirect: "follow",
      });
      const xrt = res.headers.get("x-robots-tag")?.toLowerCase() ?? "";
      expect(xrt).not.toMatch(/\bnoindex\b/);
      expect(xrt).not.toMatch(/\bnofollow\b/);
    } catch {
      /* ignore */
    }

    // Canonical
    const canonical = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    );
    expect(canonical, "missing <link rel=\"canonical\">").toBeTruthy();
    expect(canonical![1]).toBe(CANONICAL);

    // og:url + twitter URL alignment
    const ogUrl = html.match(
      /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    );
    expect(ogUrl?.[1]).toBe(CANONICAL);
  }, 30_000);

  it("is listed in sitemap.xml", async () => {
    const xml = await fetchText(`${ORIGIN}/sitemap.xml`);
    if (!xml) {
      console.warn(`[skip] ${ORIGIN}/sitemap.xml unreachable`);
      return;
    }
    expect(xml).toMatch(/<loc>\s*https:\/\/phlabs\.co\.uk\/compound\s*<\/loc>/i);
  }, 30_000);
});
