/**
 * Visual regression for /research — pinned to the article-rich legacy page.
 *
 * Baseline name intentionally changed to `research-articles.png` so any
 * leftover Ads-landing baseline cannot accidentally pass after the route
 * was restored. Refresh with:
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

test.describe("/research visual regression (article page)", () => {
  test.use({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });

  test("matches reference screenshot of the article-rich layout", async ({ page, context }) => {
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

    // Hard guard: this MUST be the legacy article page, not the Ads landing.
    await expect(page.locator('[data-source="legacy-research-page"]')).toBeVisible();
    await expect(page.locator("h1")).toContainText(/Peptide Research/i);

    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      document.querySelectorAll("details[open]").forEach((d) =>
        d.removeAttribute("open"),
      );
    });


    // Pre-warm lazy content before the capture: a fullPage screenshot
    // temporarily resizes the viewport to the document height, firing every
    // below-fold IntersectionObserver at once. Without a slow scroll pass
    // first, lazy sections expand DURING the capture and consecutive
    // screenshots oscillate in height ("Failed to take two consecutive
    // stable screenshots", observed as a 10235 <-> 11164px flip-flop).
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

    await expect(page).toHaveScreenshot("research-articles.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      threshold: 0.25,
    });
  });
});
