/**
 * Visual regression for /research (prerendered).
 *
 * Mirrors e2e/compound-visual.spec.ts. Pixel diff tolerance is intentionally
 * permissive (see playwright.config.ts → expect.toHaveScreenshot) so that
 * only meaningful layout/colour regressions fail CI — not anti-aliasing
 * noise, font hinting, or sub-pixel drift between Chromium builds.
 *
 * Refresh baseline with:
 *   bunx playwright test e2e/research-visual.spec.ts --update-snapshots
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.RESEARCH_BASE_URL ||
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

test.describe("/research visual regression", () => {
  test.use({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });

  test("matches reference screenshot", async ({ page, context }) => {
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

    await page.goto(`${BASE}/research`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      document.querySelectorAll("details[open]").forEach((d) =>
        d.removeAttribute("open"),
      );
    });

    await page.addStyleTag({ content: KILL_MOTION_CSS });

    await expect(page).toHaveScreenshot("research.png", {
      fullPage: true,
      // Per-call overrides — keep in sync with playwright.config.ts.
      maxDiffPixelRatio: 0.02,
      threshold: 0.25,
    });
  });
});
