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
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
    });
    await page.addStyleTag({ content: KILL_MOTION_CSS });
    await expect(page).toHaveScreenshot("compound-premium-only.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      threshold: 0.25,
    });
  });
});
