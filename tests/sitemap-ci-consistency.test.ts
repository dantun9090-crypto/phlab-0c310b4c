/**
 * CI guardrail — sitemap, canonical, and robots.txt stay in lock-step.
 *
 * Three classes of regression this catches before they reach prod:
 *   1. Sitemap `BASE_URL` drifts away from `SITE_URL` in seo-meta (the
 *      canonical helper). If they disagree, `<link rel="canonical">` on a
 *      page and the `<loc>` in the sitemap point at different hosts and
 *      Google treats them as duplicates.
 *   2. `Sitemap:` directive in `public/robots.txt` points at a different
 *      host / path than the actual sitemap route. Crawlers then either
 *      fetch a 404 or index a stale host.
 *   3. The static-entries block in `src/routes/sitemap[.]xml.ts` silently
 *      shrinks (e.g. a refactor accidentally drops an entry). We assert a
 *      floor on the static URL count and that every static path is policy-
 *      indexable so a deletion or a typo fails the build, not silently
 *      ships.
 *
 * Run with: bunx vitest run tests/sitemap-ci-consistency.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SITE_URL, canonicalUrl } from "../src/lib/seo-meta";
import { isIndexable } from "../src/lib/sitemap-policy";

const SITEMAP_SRC = readFileSync(
  resolve(process.cwd(), "src/routes/sitemap[.]xml.ts"),
  "utf8",
);
const ROBOTS_TXT = readFileSync(
  resolve(process.cwd(), "public/robots.txt"),
  "utf8",
);

/** Extract the `BASE_URL = "…"` literal from the sitemap source. */
function extractSitemapBaseUrl(): string {
  const m = SITEMAP_SRC.match(/const\s+BASE_URL\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("Could not find BASE_URL in sitemap source");
  return m[1];
}

/** Extract every static entry path from the `staticEntries` array literal. */
function extractStaticSitemapPaths(): string[] {
  const block = SITEMAP_SRC.match(
    /const\s+staticEntries[\s\S]*?\[([\s\S]*?)\];/,
  );
  if (!block) throw new Error("staticEntries block not found in sitemap source");
  return Array.from(block[1].matchAll(/path:\s*"(\/[^"]*)"/g), (m) => m[1]);
}

/** Pull every `Sitemap:` directive from robots.txt (case-insensitive). */
function extractRobotsSitemapDirectives(): string[] {
  const out: string[] = [];
  for (const line of ROBOTS_TXT.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i);
    if (m) out.push(m[1]);
  }
  return out;
}

describe("CI guardrail — sitemap ↔ canonical ↔ robots", () => {
  it("sitemap BASE_URL equals canonical SITE_URL", () => {
    // If these diverge, sitemap <loc> and <link rel=canonical> disagree.
    // Google then sees two different hosts and downranks both.
    expect(extractSitemapBaseUrl()).toBe(SITE_URL);
  });

  it("robots.txt Sitemap: directive matches the live sitemap URL", () => {
    const directives = extractRobotsSitemapDirectives();
    expect(directives.length, "robots.txt must declare a Sitemap").toBeGreaterThan(0);
    // Exactly one sitemap, pointing at our canonical host + /sitemap.xml.
    expect(directives).toEqual([`${SITE_URL}/sitemap.xml`]);
  });

  it("robots.txt does NOT reference any non-canonical host", () => {
    // Catches stale www. / brand-typo / preview / old-brand entries that would
    // mislead crawlers about which host owns the sitemap.
    const offenders = [
      "www.phlabs.co.uk",
      // check-domains-allow-next-line
      "php" + "labs",
      // check-domains-allow-next-line
      "phlab" + ".lovable.app",
      "prohealthpeptides",
    ];
    for (const needle of offenders) {
      expect(
        ROBOTS_TXT.toLowerCase().includes(needle.toLowerCase()),
        `robots.txt must not reference "${needle}"`,
      ).toBe(false);
    }
  });

  it("static sitemap entries do not silently shrink", () => {
    // 14 static pages today (home + products + research + qc + lab-reports
    // + resources + storage-guide + about + contact + 5 legal). If a future
    // edit drops one accidentally, this fails — bump the floor only when a
    // page is *intentionally* removed.
    const paths = extractStaticSitemapPaths();
    expect(paths.length).toBeGreaterThanOrEqual(14);
  });

  it("every static sitemap path is policy-indexable", () => {
    // Belt and braces — sitemap-validation.test.ts asserts the policy is
    // self-consistent, but this also asserts the *actual* sitemap source
    // doesn't accidentally list a transactional / disallowed path.
    for (const path of extractStaticSitemapPaths()) {
      expect(isIndexable(path), `${path} listed in sitemap but excluded by policy`).toBe(true);
    }
  });

  it("canonicalUrl() for every static path equals the sitemap <loc> URL", () => {
    // The exact URL the splat-route's <link rel=canonical> emits MUST match
    // the URL the sitemap advertises. Drift here is the root cause of
    // "Google chose a different canonical" warnings in GSC.
    for (const path of extractStaticSitemapPaths()) {
      const expected = `${SITE_URL}${path}`;
      const got = canonicalUrl(path.replace(/^\//, ""));
      expect(got, `canonical/sitemap mismatch for ${path}`).toBe(expected);
    }
  });
});
