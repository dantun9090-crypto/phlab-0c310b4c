/**
 * Visual alignment regression: the "Research Use Only" disclaimer must sit
 * inside the header brand block (under the logo), and the LiveSalesPopup
 * must be anchored to the left side, below the disclaimer / header, at
 * every common viewport width — verified against the freshly deployed site.
 *
 * Target URL is configurable via TEST_BASE_URL (defaults to production).
 */
import { test, expect, devices } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

const WIDTHS: Array<{ name: string; width: number; height: number }> = [
  { name: "mobile-360",  width: 360,  height: 780 },
  { name: "mobile-414",  width: 414,  height: 896 },
  { name: "tablet-768",  width: 768,  height: 1024 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "desktop-1536", width: 1536, height: 960 },
];

for (const vp of WIDTHS) {
  test(`disclaimer + popup aligned @ ${vp.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

    // Header + disclaimer must be visible inside the brand block.
    const disclaimer = page.locator("#phl-research-disclaimer");
    await expect(disclaimer).toBeVisible({ timeout: 10_000 });

    const disclaimerBox = await disclaimer.boundingBox();
    expect(disclaimerBox, "disclaimer must have a layout box").not.toBeNull();
    // Disclaimer should be near the top of the viewport (inside the sticky header).
    expect(disclaimerBox!.y).toBeLessThan(160);
    // Should be on the LEFT side of the page (sitting under the logo).
    expect(disclaimerBox!.x).toBeLessThan(vp.width / 2);

    // Wait for the popup to appear (it polls live orders; allow up to 25s).
    const popup = page.locator("#phl-live-sales-popup");
    await expect(popup).toBeVisible({ timeout: 25_000 });

    const popupBox = await popup.boundingBox();
    expect(popupBox, "popup must have a layout box").not.toBeNull();

    // Popup must be anchored to the left edge of the viewport.
    expect(popupBox!.x).toBeLessThan(Math.min(64, vp.width * 0.2));
    // Popup must sit BELOW the disclaimer / header (no overlap).
    expect(popupBox!.y).toBeGreaterThanOrEqual(disclaimerBox!.y + disclaimerBox!.height - 1);
    // And not pushed off-screen.
    expect(popupBox!.y).toBeLessThan(vp.height);

    await context.close();
  });
}
