/**
 * Visual + content regression for the compliant Semrush pillar:
 *   /resources/peptide-categories-uk-research
 *
 * Runs on Chromium + Firefox via the Playwright projects matrix
 * (visual snapshot is chromium-only — font hinting differs in Firefox).
 *
 * Refresh baselines with:
 *   bunx playwright test e2e/resources-peptide-categories-visual.spec.ts --update-snapshots
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE =
  process.env.RESOURCES_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

const SLUG = "peptide-categories-uk-research";
const PAGE_URL = `${BASE}/resources/${SLUG}`;

const KILL_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important; }
`;

test.describe("/resources/peptide-categories-uk-research", () => {
  test.use({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });

  test("renders article with correct SEO head + canonical class headings", async ({
    page,
    context,
  }) => {
    await context.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) =>
      r.abort(),
    );

    const res = await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    expect(res?.ok(), `GET returned ${res?.status()}`).toBeTruthy();

    // SEO head assertions (these are the regression catches for the new route).
    await expect(page).toHaveTitle(/Peptide Categories in UK Research/i);

    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description ?? "").toMatch(/seven peptide classes/i);

    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical).toBe(`https://phlabs.co.uk/resources/${SLUG}`);

    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute("content");
    expect(ogTitle ?? "").toMatch(/Peptide Categories/i);

    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute("content");
    expect(ogUrl).toBe(`https://phlabs.co.uk/resources/${SLUG}`);

    const ogType = await page
      .locator('meta[property="og:type"]')
      .getAttribute("content");
    expect(ogType).toBe("article");

    // og:image + twitter:image must be absolute https URLs on the canonical
    // host (relative URLs break Facebook/LinkedIn/Twitter card scrapers).
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogImage ?? "").toMatch(/^https:\/\/phlabs\.co\.uk\/.+\.(jpg|jpeg|png|webp)$/i);

    const twitterCard = await page
      .locator('meta[name="twitter:card"]')
      .getAttribute("content");
    expect(twitterCard).toBe("summary_large_image");

    const twitterImage = await page
      .locator('meta[name="twitter:image"]')
      .getAttribute("content");
    expect(twitterImage ?? "").toMatch(/^https:\/\/phlabs\.co\.uk\/.+\.(jpg|jpeg|png|webp)$/i);

    const twitterTitle = await page
      .locator('meta[name="twitter:title"]')
      .getAttribute("content");
    expect(twitterTitle ?? "").toMatch(/Peptide Categories/i);

    const twitterDescription = await page
      .locator('meta[name="twitter:description"]')
      .getAttribute("content");
    expect(twitterDescription ?? "").toMatch(/seven peptide classes/i);

    const twitterUrl = await page
      .locator('meta[name="twitter:url"]')
      .getAttribute("content");
    expect(twitterUrl).toBe(`https://phlabs.co.uk/resources/${SLUG}`);

    // Wait for the legacy SPA to hydrate the article body.
    await expect(page.locator("h1")).toContainText(/Peptide Categories/i, {
      timeout: 15_000,
    });
    // RUO compliance line must be present in the article body.
    await expect(page.getByText(/For Research Use Only/i).first()).toBeVisible();

    // All 7 class headings must render — guards against article body loss.
    for (const cls of [
      /Class 1:/i,
      /Class 2:/i,
      /Class 3:/i,
      /Class 4:/i,
      /Class 5:/i,
      /Class 6:/i,
      /Class 7:/i,
    ]) {
      await expect(page.getByText(cls).first()).toBeVisible();
    }
  });

  test("matches reference screenshot (chromium only)", async ({
    page,
    context,
    browserName,
  }, testInfo) => {
    testInfo.skip(
      browserName !== "chromium",
      "Visual baseline pinned to chromium font rendering",
    );

    await context.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) =>
      r.abort(),
    );
    await page.addInitScript((css) => {
      const apply = () => {
        const s = document.createElement("style");
        s.setAttribute("data-test", "kill-motion");
        s.textContent = css;
        document.documentElement.appendChild(s);
      };
      if (document.documentElement) apply();
      else document.addEventListener("DOMContentLoaded", apply);
    }, KILL_MOTION_CSS);

    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/Peptide Categories/i, {
      timeout: 15_000,
    });
    await page
      .waitForLoadState("load", { timeout: 10_000 })
      .catch(() => undefined);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document
        .querySelectorAll("details[open]")
        .forEach((d) => d.removeAttribute("open"));
    });
    await page.addStyleTag({ content: KILL_MOTION_CSS });

    await expect(page).toHaveScreenshot(
      "resources-peptide-categories-uk-research.png",
      { fullPage: true, maxDiffPixelRatio: 0.02, threshold: 0.25 },
    );
  });

  test("canonical, og:url and twitter:url exactly equal the canonical PAGE_URL", async ({
    page,
  }) => {
    const EXPECTED = `https://phlabs.co.uk/resources/${SLUG}`;
    const res = await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    expect(res?.ok(), `GET returned ${res?.status()}`).toBeTruthy();

    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    expect(canonical, "canonical href").toBe(EXPECTED);

    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute("content");
    expect(ogUrl, "og:url content").toBe(EXPECTED);

    const twitterUrl = await page
      .locator('meta[name="twitter:url"]')
      .getAttribute("content");
    expect(twitterUrl, "twitter:url content").toBe(EXPECTED);

    // All three must be byte-identical — crawlers treat any mismatch as a
    // canonicalisation signal pointing somewhere else.
    expect(new Set([canonical, ogUrl, twitterUrl]).size).toBe(1);
  });

  test("reachable from /resources index navigation", async ({ page }) => {
    const res = await page.goto(`${BASE}/resources`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.ok(), `GET /resources returned ${res?.status()}`).toBeTruthy();

    // Either a real <a href> or a title text match — covers both SPA Link
    // navigations and server-rendered anchors in the legacy index.
    const link = page
      .locator(`a[href*="/resources/${SLUG}"]`)
      .first();
    await expect(link).toBeVisible({ timeout: 15_000 });

    await Promise.all([
      page.waitForURL(new RegExp(`/resources/${SLUG}$`), { timeout: 15_000 }),
      link.click(),
    ]);
    await expect(page.locator("h1")).toContainText(/Peptide Categories/i);
  });

  test("appears in sitemap.xml", async ({ request }) => {
    const r = await request.get(`${BASE}/sitemap.xml`);
    expect(r.ok(), `sitemap returned ${r.status()}`).toBeTruthy();
    const xml = await r.text();
    expect(xml).toContain(
      `https://phlabs.co.uk/resources/${SLUG}`,
    );
  });

  test("has no critical axe WCAG violations", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/Peptide Categories/i, {
      timeout: 15_000,
    });
    await page
      .waitForLoadState("load", { timeout: 10_000 })
      .catch(() => undefined);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .disableRules(["region"])
      .analyze();

    const blocking = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");

    if (blocking.length > 0) {
      const summary = blocking
        .map(
          (v) =>
            `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
              v.nodes.length === 1 ? "" : "s"
            })\n    ${v.helpUrl}`,
        )
        .join("\n");
      console.error(
        `\n${blocking.length} critical /resources/${SLUG} a11y violation(s):\n${summary}\n`,
      );
    }
    if (serious.length > 0) {
      console.warn(
        `\n${serious.length} serious non-blocking a11y warning(s) on /resources/${SLUG}: ${serious
          .map((v) => v.id)
          .join(", ")}\n`,
      );
    }

    expect(
      blocking,
      `${blocking.length} critical axe violation(s) — see console`,
    ).toEqual([]);
  });

  test("emits Article JSON-LD with required fields", async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/Peptide Categories/i, {
      timeout: 15_000,
    });

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(blocks.length, "expected at least one JSON-LD block").toBeGreaterThan(0);

    const parsed = blocks
      .map((t) => {
        try {
          return JSON.parse(t);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .flatMap((node: any) => (Array.isArray(node) ? node : [node]));

    const article = parsed.find(
      (n: any) =>
        n &&
        (n["@type"] === "Article" ||
          (Array.isArray(n["@type"]) && n["@type"].includes("Article"))),
    );
    expect(article, "Article JSON-LD block not found").toBeTruthy();

    expect(typeof article.headline).toBe("string");
    expect(article.headline).toMatch(/Peptide Categories/i);

    expect(typeof article.description).toBe("string");
    expect(article.description.length).toBeGreaterThan(20);

    expect(article.url).toBe(`https://phlabs.co.uk/resources/${SLUG}`);

    const image = Array.isArray(article.image) ? article.image[0] : article.image;
    const imageUrl = typeof image === "string" ? image : image?.url;
    expect(imageUrl ?? "").toMatch(
      /^https:\/\/phlabs\.co\.uk\/.+\.(jpg|jpeg|png|webp)$/i,
    );
  });

  test("og:image and twitter:image return HTTP 200", async ({ page, request }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    const twitterImage = await page
      .locator('meta[name="twitter:image"]')
      .getAttribute("content");

    expect(ogImage, "og:image missing").toBeTruthy();
    expect(twitterImage, "twitter:image missing").toBeTruthy();

    for (const url of [ogImage!, twitterImage!]) {
      const r = await request.get(url);
      expect(
        r.ok(),
        `share image ${url} returned ${r.status()}`,
      ).toBeTruthy();
      const ct = r.headers()["content-type"] ?? "";
      expect(ct, `share image ${url} content-type ${ct}`).toMatch(/^image\//i);
    }
  });

  test("trailing-slash PAGE_URL normalizes and canonical/og:url/twitter:url still match", async ({
    page,
  }) => {
    const EXPECTED = `https://phlabs.co.uk/resources/${SLUG}`;
    // Hit the trailing-slash variant. The router may either redirect
    // (final PAGE_URL has no trailing slash) or serve the same document; in
    // both cases the canonical/og:url/twitter:url must point at the
    // canonical no-trailing-slash PAGE_URL — never at the slashed variant.
    const res = await page.goto(`${PAGE_URL}/`, { waitUntil: "domcontentloaded" });
    expect(res, "no response for trailing-slash PAGE_URL").toBeTruthy();
    expect(
      res!.status(),
      `trailing-slash PAGE_URL returned ${res!.status()}`,
    ).toBeLessThan(400);

    // Final PAGE_URL (after any normalization) must not keep a trailing slash
    // on the article path.
    const finalUrl = new URL(page.url());
    expect(
      finalUrl.pathname,
      `expected normalized pathname, got ${finalUrl.pathname}`,
    ).toBe(`/resources/${SLUG}`);

    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute("content");
    const twitterUrl = await page
      .locator('meta[name="twitter:url"]')
      .getAttribute("content");

    expect(canonical, "canonical href after trailing-slash hit").toBe(EXPECTED);
    expect(ogUrl, "og:url after trailing-slash hit").toBe(EXPECTED);
    expect(twitterUrl, "twitter:url after trailing-slash hit").toBe(EXPECTED);
    expect(
      new Set([canonical, ogUrl, twitterUrl]).size,
      "canonical/og:url/twitter:url must be byte-identical",
    ).toBe(1);
  });

  test("robots meta tag is index,follow (page must remain crawlable)", async ({
    page,
  }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });

    const robots = await page
      .locator('meta[name="robots"]')
      .getAttribute("content");

    // A missing robots meta defaults to index,follow — that's acceptable.
    // What we MUST NOT ship is noindex / nofollow / none on this pillar.
    if (robots !== null) {
      const tokens = robots
        .toLowerCase()
        .split(",")
        .map((t) => t.trim());
      expect(tokens, `robots tokens: ${robots}`).not.toContain("noindex");
      expect(tokens, `robots tokens: ${robots}`).not.toContain("nofollow");
      expect(tokens, `robots tokens: ${robots}`).not.toContain("none");
      // When the directive is present it should explicitly allow indexing.
      expect(
        tokens.includes("index") ||
          tokens.includes("all") ||
          // Bare "follow" with no index directive defaults to index — accept.
          tokens.includes("follow"),
        `robots tokens must permit indexing, got: ${robots}`,
      ).toBe(true);
    }

    // googlebot-specific meta, if present, must also not block indexing.
    const googlebot = await page
      .locator('meta[name="googlebot"]')
      .getAttribute("content");
    if (googlebot !== null) {
      const tokens = googlebot.toLowerCase().split(",").map((t) => t.trim());
      expect(tokens, `googlebot tokens: ${googlebot}`).not.toContain("noindex");
      expect(tokens, `googlebot tokens: ${googlebot}`).not.toContain("nofollow");
      expect(tokens, `googlebot tokens: ${googlebot}`).not.toContain("none");
    }
  });

  test("JSON-LD blocks declare @context schema.org and a recognised @type", async ({
    page,
  }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/Peptide Categories/i, {
      timeout: 15_000,
    });

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(blocks.length, "expected at least one JSON-LD block").toBeGreaterThan(0);

    const allNodes: any[] = [];
    for (const raw of blocks) {
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`JSON-LD block is not valid JSON: ${(e as Error).message}\n${raw.slice(0, 200)}`);
      }
      // @graph containers expand to their member nodes (site-wide graph
      // carries Organization without a top-level @type).
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
      const fromGraph = !Array.isArray(parsed) && Array.isArray(parsed["@graph"]);
      for (const n of nodes) {
        // Top-level nodes must declare schema.org as @context. @graph
        // members inherit the parent's context — only @type is checked.
        if (!fromGraph) {
          const ctx = n["@context"];
          const ctxStr = Array.isArray(ctx) ? ctx.join(",") : ctx;
          expect(
            typeof ctxStr === "string" && /schema\.org/i.test(ctxStr),
            `JSON-LD @context must reference schema.org, got ${JSON.stringify(ctx)}`,
          ).toBe(true);
        }
        // @type is required for crawler parsing.
        expect(n["@type"], "JSON-LD @type missing").toBeTruthy();
        allNodes.push(n);
      }
    }

    // At least one node must be Article-class for this pillar page.
    const articleLike = allNodes.find((n) => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.some((x: string) =>
        /^(Article|NewsArticle|BlogPosting|TechArticle|ScholarlyArticle)$/i.test(
          x,
        ),
      );
    });
    expect(articleLike, "expected an Article-class JSON-LD node").toBeTruthy();
  });
});


test.describe("/resources/peptide-categories-uk-research (mobile)", () => {
  // iPhone 12-ish viewport — catches responsive a11y issues like tap-target
  // size, horizontal scroll, and contrast at narrow widths.
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test("has no critical axe WCAG violations on mobile viewport", async ({
    page,
  }) => {
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/Peptide Categories/i, {
      timeout: 15_000,
    });
    await page
      .waitForLoadState("load", { timeout: 10_000 })
      .catch(() => undefined);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .disableRules(["region"])
      .analyze();

    const blocking = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");

    if (blocking.length > 0) {
      const summary = blocking
        .map(
          (v) =>
            `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
              v.nodes.length === 1 ? "" : "s"
            })\n    ${v.helpUrl}`,
        )
        .join("\n");
      console.error(
        `\n${blocking.length} critical mobile a11y violation(s):\n${summary}\n`,
      );
    }
    if (serious.length > 0) {
      console.warn(
        `\n${serious.length} serious non-blocking mobile a11y warning(s): ${serious
          .map((v) => v.id)
          .join(", ")}\n`,
      );
    }

    expect(
      blocking,
      `${blocking.length} critical mobile axe violation(s) — see console`,
    ).toEqual([]);
  });
});
