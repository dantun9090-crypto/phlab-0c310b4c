/**
 * Visual regression for /compound (prerendered).
 *
 * Hardened for determinism:
 *   - Locked viewport (1280x1800) + deviceScaleFactor=1 (playwright.config)
 *   - Reduced-motion forced (playwright.config)
 *   - All CSS animations / transitions / caret killed via injected stylesheet
 *   - Web fonts blocked at the route level — only system fonts render
 *   - All <details> collapsed
 *   - networkidle wait + h1 visibility gate before snapping
 *
 * Run with `bunx playwright test e2e/compound-visual.spec.ts --update-snapshots`
 * to refresh the baseline after an intentional design change.
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

test.describe("/compound visual regression", () => {
  test.use({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });

  test("matches reference screenshot", async ({ page, context }) => {
    // Block all remote web fonts so screenshots use deterministic system fonts.
    await context.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) =>
      r.abort(),
    );

    // Inject the motion/transition kill switch before any stylesheet runs.
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

    await page.goto(`${BASE}/compound`, { waitUntil: "networkidle" });

    await expect(page.locator("h1")).toBeVisible();

    // Collapse any open <details> for determinism
    await page.evaluate(() => {
      document.querySelectorAll("details[open]").forEach((d) =>
        d.removeAttribute("open"),
      );
    });

    // Belt-and-braces: re-inject the stylesheet after navigation in case the
    // app's CSS loaded after init.
    await page.addStyleTag({ content: KILL_MOTION_CSS });

    await expect(page).toHaveScreenshot("compound.png", { fullPage: true });
  });
});
