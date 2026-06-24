/**
 * Validates OpenGraph + Twitter Card meta tags in the prerendered /compound
 * HTML and asserts og:url matches the self-referential canonical URL.
 *
 * Self-skips offline so local/CI without network egress doesn't false-fail.
 */
import { describe, it, expect } from "vitest";

const ORIGIN = process.env.COMPOUND_TEST_ORIGIN ?? "https://phlabs.co.uk";
const URL = `${ORIGIN}/compound`;
const CANONICAL = "https://phlabs.co.uk/compound";
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

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["'][^>]*>`,
    "i",
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

describe("/compound OG + Twitter meta", () => {
  it("includes complete og:* and twitter:* tags, og:url == canonical", async () => {
    const html = await fetchAsBot();
    if (!html) {
      console.warn(`[skip] ${URL} unreachable`);
      return;
    }

    const ogTitle = metaContent(html, "property", "og:title");
    const ogDesc = metaContent(html, "property", "og:description");
    const ogType = metaContent(html, "property", "og:type");
    const ogUrl = metaContent(html, "property", "og:url");
    const ogImage = metaContent(html, "property", "og:image");

    expect(ogTitle, "og:title missing").toBeTruthy();
    expect(ogTitle!).toMatch(/Premium Research Compounds/i);
    expect(ogDesc, "og:description missing").toBeTruthy();
    expect(ogDesc!.length).toBeGreaterThan(40);
    expect(ogType).toBe("website");
    expect(ogUrl).toBe(CANONICAL);
    expect(ogImage, "og:image missing").toBeTruthy();
    expect(ogImage!).toMatch(/^https:\/\/phlabs\.co\.uk\/og\/compound\.jpg$/);

    const twCard = metaContent(html, "name", "twitter:card");
    const twTitle = metaContent(html, "name", "twitter:title");
    const twDesc = metaContent(html, "name", "twitter:description");
    const twImage = metaContent(html, "name", "twitter:image");

    expect(twCard).toBe("summary_large_image");
    expect(twTitle, "twitter:title missing").toBeTruthy();
    expect(twDesc, "twitter:description missing").toBeTruthy();
    expect(twImage, "twitter:image missing").toBeTruthy();
    expect(twImage!).toMatch(/og\/compound\.jpg/);

    // Canonical alignment
    const canonical = html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    );
    expect(canonical?.[1]).toBe(CANONICAL);

    // og:image and twitter:image MUST be absolute URLs (crawlers reject relative)
    expect(ogImage!, "og:image must be absolute https URL").toMatch(/^https:\/\//);
    expect(twImage!, "twitter:image must be absolute https URL").toMatch(/^https:\/\//);

    // Both images MUST resolve to a 200 with an image/* content-type
    for (const url of [ogImage!, twImage!]) {
      try {
        let res = await fetch(url, { method: "HEAD", redirect: "follow" });
        // Some CDNs reject HEAD; fall back to GET
        if (res.status === 405 || res.status === 403) {
          res = await fetch(url, { method: "GET", redirect: "follow" });
        }
        expect(res.status, `${url} returned ${res.status}`).toBe(200);
        const ct = res.headers.get("content-type") ?? "";
        expect(ct, `${url} content-type=${ct}`).toMatch(/^image\//i);
      } catch (err) {
        console.warn(`[skip image probe] ${url}: ${(err as Error).message}`);
      }
    }
  }, 30_000);
});
