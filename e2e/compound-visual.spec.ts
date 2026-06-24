/**
 * Visual regression for /compound (prerendered).
 *
 * Uses Playwright's built-in snapshot comparison. The reference image is
 * generated on the first run (commit the resulting *-snapshots/ folder) and
 * subsequent runs fail when meaningful pixel diffs appear.
 *
 * Tuning:
 *   - maxDiffPixelRatio: 1% — tolerates font subpixel + minor antialiasing
 *   - threshold: 0.2 per-pixel — Playwright default; resilient to JPEG noise
 *   - animations: 'disabled' — kills CSS transitions for determinism
 *
 * Run with `bunx playwright test e2e/compound-visual.spec.ts --update-snapshots`
 * to refresh the baseline after an intentional design change.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("/compound visual regression", () => {
  test.use({ viewport: { width: 1280, height: 1800 } });

  test("matches reference screenshot", async ({ page }) => {
    await page.goto(`${BASE}/compound`, { waitUntil: "networkidle" });

    // Wait for hero H1 to be painted before snapping
    await expect(page.locator("h1")).toBeVisible();

    // Collapse any open <details> for determinism
    await page.evaluate(() => {
      document.querySelectorAll("details[open]").forEach((d) =>
        d.removeAttribute("open"),
      );
    });

    await expect(page).toHaveScreenshot("compound.png", {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    });
  });
});
