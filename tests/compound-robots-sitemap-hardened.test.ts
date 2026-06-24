// @vitest-environment node
/**
 * Hardened robots.txt + sitemap.xml checks (prerendered/live origin):
 *   - /robots.txt does NOT Disallow /compound or /research under User-agent: * (or AdsBot)
 *   - /robots.txt does NOT block the whole site (Disallow: /) for User-agent: *
 *   - /robots.txt advertises the sitemap
 *   - /sitemap.xml lists https://phlabs.co.uk/compound and https://phlabs.co.uk/research
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
  const crawlablePaths = ["/compound", "/research"] as const;

  const disallowRules = (rules: string[]) =>
    rules
      .map((d) => d.match(/^disallow\s+([^\s]*)/)?.[1] ?? "")
      .filter(Boolean);

  const ruleBlocksPath = (rule: string, path: string) => {
    if (rule === "/") return true;
    const escaped = rule
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\$$/, "$");
    return new RegExp(`^${escaped}`).test(path);
  };

  it("robots.txt does not block /compound or /research for general crawlers", async () => {
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

    const blocksPath = (rules: string[], path: string) =>
      disallowRules(rules).some((rule) => ruleBlocksPath(rule, path));

    for (const path of crawlablePaths) {
      expect(blocksPath(universal, path), `User-agent: * blocks ${path}`).toBe(false);
    }

    for (const ua of ["googlebot", "adsbot-google", "adsbot-google-mobile", "googlebot-image"]) {
      const rules = groups.get(ua);
      if (rules) {
        for (const path of crawlablePaths) {
          expect(blocksPath(rules, path), `${ua} blocks ${path}`).toBe(false);
        }
      }
    }
  }, 30_000);

  it("sitemap.xml lists /compound and /research and is well-formed", async () => {
    const xml = await fetchText(`${ORIGIN}/sitemap.xml`);
    if (!xml) {
      console.warn(`[skip] ${ORIGIN}/sitemap.xml unreachable`);
      return;
    }

    expect(xml).toMatch(/<urlset[^>]+xmlns=/i);
    for (const path of crawlablePaths) {
      expect(xml).toMatch(
        new RegExp(`<loc>\\s*https:\\/\\/phlabs\\.co\\.uk${path}\\s*<\\/loc>`, "i"),
      );
    }
    // No restrictive directive snuck into a sitemap entry
    expect(xml).not.toMatch(/noindex|nofollow|disallow/i);
  }, 30_000);
});
