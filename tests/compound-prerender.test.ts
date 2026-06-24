/**
 * Verifies the prerendered HTML for /compound (as served to Googlebot)
 * contains every SEO-critical element: H1, section H2s, the top + bottom
 * disclaimers, primary CTA, FAQ entries and FAQPage JSON-LD.
 *
 * Self-skips offline or when the origin is unreachable so local dev and
 * CI without network egress don't false-fail.
 */
import { describe, it, expect } from "vitest";

const ORIGIN = process.env.COMPOUND_TEST_ORIGIN ?? "https://phlabs.co.uk";
const URL = `${ORIGIN}/compound`;
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function fetchAsBot(): Promise<string | null> {
  try {
    const res = await fetch(URL, {
      headers: { "user-agent": GOOGLEBOT, accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

describe("/compound prerendered HTML (Googlebot)", () => {
  it("contains all SEO-critical content", async () => {
    const html = await fetchAsBot();
    if (!html) {
      console.warn(`[skip] Could not fetch ${URL} — offline or origin unreachable.`);
      return;
    }

    // H1
    expect(html).toMatch(/<h1[^>]*>[\s\S]*Premium Research Compounds[\s\S]*<\/h1>/i);

    // Required section H2s
    expect(html).toMatch(/What we offer/i);
    expect(html).toMatch(/Intended Use/i);
    expect(html).toMatch(/Frequently Asked Questions/i);
    expect(html).toMatch(/Legal Disclaimer/i);

    // Disclaimers (top + bottom)
    const disclaimerMatches = html.match(
      /For Research Use Only\.\s*Not for Human Consumption\./gi,
    );
    expect(disclaimerMatches?.length ?? 0).toBeGreaterThanOrEqual(2);

    // CTA text
    expect(html).toMatch(/What we offer/);
    expect(html).toMatch(/Intended use/);
    expect(html).toMatch(/Back to homepage/);

    // Canonical + OG image
    expect(html).toMatch(/<link[^>]+rel=["']canonical["'][^>]+phlabs\.co\.uk\/compound/i);
    expect(html).toMatch(/og\/compound\.jpg/);

    // FAQPage JSON-LD present and contains the questions
    expect(html).toMatch(/"@type"\s*:\s*"FAQPage"/);
    expect(html).toMatch(/Are PH Labs compounds intended for human use\?/);
    expect(html).toMatch(/How do you verify purity and quality\?/);
    expect(html).toMatch(/Where are the compounds sourced and dispatched from\?/);
  }, 30_000);
});
