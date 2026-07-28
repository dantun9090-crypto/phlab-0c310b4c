/**
 * Visual + structural regression for /compound.
 *
 * Asserts the route renders ONLY <PremiumLanding> (data-source="premium-landing")
 * and that none of the regression overlays — legacy article page, Ads landing,
 * or research compound articles — have leaked in on top of it.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

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

test.describe("/compound = PremiumLanding only", () => {
  test.use({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });
  // Cold dev-server compile of the landing route can take well over 30s.
  test.setTimeout(120_000);

  test("PremiumLanding renders, no overlay or article leakage", async ({ page, context }) => {
    await context.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) => r.abort());
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

    const res = await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });
    expect(res?.ok(), `GET /compound returned ${res?.status()}`).toBeTruthy();

    // Premium marker required.
    await expect(page.locator('[data-source="premium-landing"]')).toBeVisible();

    // None of the regression overlays may be present.
    await expect(page.locator('[data-source="legacy-research-page"]')).toHaveCount(0);
    await expect(page.locator('[data-source="research-ads-landing"]')).toHaveCount(0);

    // Article anchors from /research must NOT have leaked in.
    await expect(page.locator("#incretin")).toHaveCount(0);
    await expect(page.locator("#peptides")).toHaveCount(0);
    await expect(page.locator("#nad")).toHaveCount(0);

    // Compound H1 must not mention the research page title.
    await expect(page.locator("h1")).not.toContainText(/Peptide Research\s*&\s*Comparative Science/i);

    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);

    // --- Stabilisation (mirrors e2e/compound-visual.spec.ts) ---------------
    // The capture below used to race the app's deferred stylesheet swap,
    // lazy below-fold sections and cache-guard reloads, so consecutive
    // screenshots oscillated in height (10235 <-> 7189 <-> 1800px) and the
    // assertion never converged. Same cure as the sibling suite:
    // 1. warm second visit (first hit can trigger a cache-guard reload),
    // 2. wait for the media="print" -> "all" stylesheet swap,
    // 3. scroll pre-warm so IntersectionObserver sections expand BEFORE the
    //    fullPage capture resizes the viewport,
    // 4. iterate viewport height to a fixed point so the capture itself
    //    never triggers a resize.
    await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].every(
          (l) => l.media === "all" || l.media === "" || l.disabled,
        ),
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
    });
    await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const step = Math.max(400, Math.floor(window.innerHeight / 2));
      for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await sleep(60);
      }
      window.scrollTo(0, 0);
      await sleep(300);
    });
    await page.waitForTimeout(500);
    await page.addStyleTag({ content: KILL_MOTION_CSS });
    {
      let lastHeight = 0;
      for (let i = 0; i < 4; i++) {
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        if (h === lastHeight) break;
        lastHeight = h;
        await page.setViewportSize({ width: 1280, height: Math.min(h, 16384) });
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(300);
    }
    // -----------------------------------------------------------------------

    await expect(page).toHaveScreenshot("compound-premium-only.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      threshold: 0.25,
      timeout: 60_000,
    });
  });
});
