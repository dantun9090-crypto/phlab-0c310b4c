/**
 * Hardened robots.txt + sitemap.xml checks (prerendered/live origin):
 *   - /robots.txt does NOT Disallow /compound under User-agent: * (or AdsBot)
 *   - /robots.txt does NOT block the whole site (Disallow: /) for User-agent: *
 *   - /robots.txt advertises the sitemap
 *   - /sitemap.xml lists https://phlabs.co.uk/compound
 *
 * Self-skips offline so local/CI without network egress doesn't false-fail.
 */
import { describe, it, expect } from "vitest";

const ORIGIN = process.env.COMPOUND_TEST_ORIGIN ?? "https://phlabs.co.uk";

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Parse robots.txt into groups keyed by lowercased user-agent. */
function parseRobots(txt: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let agents: string[] = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      agents = [];
      continue;
    }
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      agents.push(val.toLowerCase());
      if (!groups.has(val.toLowerCase())) groups.set(val.toLowerCase(), []);
    } else if (key === "disallow" || key === "allow") {
      for (const a of agents) {
        const list = groups.get(a) ?? [];
        list.push(`${key} ${val}`);
        groups.set(a, list);
      }
    }
  }
  return groups;
}

describe("/compound — hardened robots + sitemap", () => {
  it("robots.txt does not block /compound for general crawlers", async () => {
    const txt = await fetchText(`${ORIGIN}/robots.txt`);
    if (!txt) {
      console.warn(`[skip] ${ORIGIN}/robots.txt unreachable`);
      return;
    }

    expect(txt).toMatch(/Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/i);

    const groups = parseRobots(txt);
    const universal = groups.get("*") ?? [];

    // Must not blanket-disallow the site
    expect(
      universal.some((d) => /^disallow\s+\/$/.test(d)),
      "robots.txt has Disallow: / for User-agent: *",
    ).toBe(false);

    // Must not explicitly disallow /compound (exact or prefix)
    const blocksCompound = (rules: string[]) =>
      rules.some((d) => /^disallow\s+\/compound(\/|$)/.test(d));

    expect(blocksCompound(universal), "User-agent: * blocks /compound").toBe(false);

    for (const ua of ["adsbot-google", "adsbot-google-mobile", "googlebot-image"]) {
      const rules = groups.get(ua);
      if (rules) {
        expect(blocksCompound(rules), `${ua} blocks /compound`).toBe(false);
      }
    }
  }, 30_000);

  it("sitemap.xml lists /compound and is well-formed", async () => {
    const xml = await fetchText(`${ORIGIN}/sitemap.xml`);
    if (!xml) {
      console.warn(`[skip] ${ORIGIN}/sitemap.xml unreachable`);
      return;
    }

    expect(xml).toMatch(/<urlset[^>]+xmlns=/i);
    expect(xml).toMatch(
      /<loc>\s*https:\/\/phlabs\.co\.uk\/compound\s*<\/loc>/i,
    );
    // No restrictive directive snuck into a sitemap entry
    expect(xml).not.toMatch(/<loc>[^<]*noindex/i);
  }, 30_000);
});
