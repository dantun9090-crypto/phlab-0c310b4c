/**
 * Fetches the prerendered /compound HTML, extracts every
 * <script type="application/ld+json"> block, and validates the FAQPage
 * schema:
 *   - parses as valid JSON
 *   - @context == https://schema.org
 *   - @type == "FAQPage"
 *   - mainEntity is a non-empty array
 *   - every entry has @type=Question, non-empty name, and an
 *     acceptedAnswer with @type=Answer + non-empty text
 *
 * Self-skips when the origin is unreachable.
 */
import { describe, it, expect } from "vitest";

const ORIGIN = process.env.COMPOUND_TEST_ORIGIN ?? "https://phlabs.co.uk";
const URL = `${ORIGIN}/compound`;
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function extractJsonLdBlocks(html: string): string[] {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1].trim());
  return out;
}

describe("/compound — FAQPage JSON-LD validity", () => {
  it("contains a well-formed FAQPage schema", async () => {
    let html: string;
    try {
      const res = await fetch(URL, {
        headers: { "user-agent": GOOGLEBOT, accept: "text/html" },
        redirect: "follow",
      });
      if (!res.ok) {
        console.warn(`[skip] ${URL} returned ${res.status}`);
        return;
      }
      html = await res.text();
    } catch {
      console.warn(`[skip] ${URL} unreachable`);
      return;
    }

    const blocks = extractJsonLdBlocks(html);
    expect(blocks.length, "no JSON-LD blocks found").toBeGreaterThan(0);

    const parsed: unknown[] = [];
    for (const raw of blocks) {
      let json: unknown;
      expect(
        () => (json = JSON.parse(raw)),
        `invalid JSON in a JSON-LD block: ${raw.slice(0, 120)}…`,
      ).not.toThrow();
      parsed.push(json);
    }

    const faq = parsed.find(
      (b): b is Record<string, unknown> =>
        !!b && typeof b === "object" && (b as any)["@type"] === "FAQPage",
    );
    expect(faq, "no FAQPage JSON-LD block found").toBeTruthy();

    expect(faq!["@context"]).toBe("https://schema.org");
    expect(faq!["@type"]).toBe("FAQPage");

    const mainEntity = faq!["mainEntity"];
    expect(Array.isArray(mainEntity), "mainEntity must be an array").toBe(true);
    const items = mainEntity as Array<Record<string, unknown>>;
    expect(items.length, "mainEntity is empty").toBeGreaterThan(0);

    for (const [i, item] of items.entries()) {
      expect(item["@type"], `mainEntity[${i}].@type`).toBe("Question");

      const name = item["name"];
      expect(typeof name, `mainEntity[${i}].name type`).toBe("string");
      expect((name as string).trim().length, `mainEntity[${i}].name empty`).toBeGreaterThan(0);

      const answer = item["acceptedAnswer"] as Record<string, unknown> | undefined;
      expect(answer, `mainEntity[${i}].acceptedAnswer missing`).toBeTruthy();
      expect(answer!["@type"], `mainEntity[${i}].acceptedAnswer.@type`).toBe("Answer");

      const text = answer!["text"];
      expect(typeof text, `mainEntity[${i}].acceptedAnswer.text type`).toBe("string");
      expect(
        (text as string).trim().length,
        `mainEntity[${i}].acceptedAnswer.text empty`,
      ).toBeGreaterThan(0);
    }
  }, 30_000);
});
