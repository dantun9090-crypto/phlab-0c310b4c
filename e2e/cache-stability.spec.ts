/**
 * End-to-end cache stability check.
 *
 * Reproduces the post-update / post-purchase failure mode where the site
 * "spins refresh all the time" until a manual edge purge is performed.
 *
 * Strategy:
 *   1. Open /compound (a stable prerendered marketing page).
 *   2. Count the number of full-document navigations (load events) and
 *      `beforeunload` fires over a 12-second observation window.
 *   3. Fail if more than ONE load happens (initial load only) — any extra
 *      load means the page is auto-refreshing.
 *   4. Confirm the final HTML is the latest content by asserting the hero
 *      H1 is still visible at the end of the window.
 *
 * This is a behavioural smoke test, not a unit test: it catches both the
 * stale-asset recovery loop and the chunk-reload watchdog mis-firing.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.CACHE_STABILITY_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

const OBSERVATION_MS = 12_000;

test.describe("cache stability — page must not auto-refresh", () => {
  for (const path of ["/compound", "/research", "/"]) {
    test(`${path} stays put for ${OBSERVATION_MS / 1000}s after load`, async ({ page }) => {
      let loadCount = 0;
      let unloadCount = 0;
      page.on("load", () => {
        loadCount += 1;
      });
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) unloadCount += 1;
      });

      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeVisible();

      // Watch for spontaneous reloads.
      await page.waitForTimeout(OBSERVATION_MS);

      // Initial nav counts as exactly one navigation + one load.
      expect(
        loadCount,
        `${path}: detected ${loadCount} load events (expected 1) — page is auto-refreshing`,
      ).toBeLessThanOrEqual(1);
      expect(
        unloadCount,
        `${path}: detected ${unloadCount} main-frame navigations (expected 1) — refresh loop`,
      ).toBeLessThanOrEqual(1);

      // After the observation window, the latest content must still be visible.
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }
});
