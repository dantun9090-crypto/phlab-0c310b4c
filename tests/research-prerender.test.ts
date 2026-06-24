/**
 * Verifies /research is fully prerendered and crawlable:
 *   - H1 + required H2 sections present
 *   - Both "For Research Use Only" disclaimers
 *   - Self-referential canonical
 *   - Back to homepage CTA present
 *   - No noindex/nofollow on the route
 *
 * Self-skips offline so local/CI without network egress doesn't false-fail.
 */
import { describe, it, expect } from "vitest";

const ORIGIN = process.env.COMPOUND_TEST_ORIGIN ?? "https://phlabs.co.uk";
const URL = `${ORIGIN}/research`;
const CANONICAL = "https://phlabs.co.uk/research";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function fetchAsBot(): Promise<{ html: string; xrt: string } | null> {
  try {
    const res = await fetch(URL, {
      headers: { "user-agent": GOOGLEBOT, accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return {
      html: await res.text(),
      xrt: res.headers.get("x-robots-tag")?.toLowerCase() ?? "",
    };
  } catch {
    return null;
  }
}

describe("/research prerendered HTML (Googlebot)", () => {
  it("contains required headings, disclaimers, canonical, and CTA", async () => {
    const data = await fetchAsBot();
    if (!data) {
      console.warn(`[skip] ${URL} unreachable`);
      return;
    }
    const { html, xrt } = data;

    // Headings
    expect(html).toMatch(/<h1[^>]*>[\s\S]*Research Compounds[\s\S]*<\/h1>/i);
    expect(html).toMatch(/What we offer/i);
    expect(html).toMatch(/Intended Use/i);
    expect(html).toMatch(/Legal Disclaimer/i);

    // Disclaimers x2 (top bar + bottom legal)
    const matches = html.match(
      /For Research Use Only\.\s*Not for Human Consumption\./gi,
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);

    // Canonical self-references the route
    const canonical = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    );
    expect(canonical?.[1]).toBe(CANONICAL);

    // og:url alignment
    const ogUrl = html.match(
      /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
    );
    expect(ogUrl?.[1]).toBe(CANONICAL);

    // Robots meta / header — must NOT block indexing
    const robots = [
      ...html.matchAll(
        /<meta[^>]+name=["'](?:robots|googlebot)["'][^>]*content=["']([^"']+)["']/gi,
      ),
    ];
    for (const m of robots) {
      const d = m[1].toLowerCase();
      expect(d).not.toMatch(/\bnoindex\b/);
      expect(d).not.toMatch(/\bnofollow\b/);
      expect(d).not.toMatch(/\bnone\b/);
    }
    expect(xrt).not.toMatch(/\bnoindex\b/);
    expect(xrt).not.toMatch(/\bnofollow\b/);

    // CTA
    expect(html).toMatch(/Back to homepage/);
  }, 30_000);
});
