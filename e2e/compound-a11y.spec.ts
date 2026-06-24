/**
 * Accessibility smoke test for /compound:
 *   - exactly one <h1>
 *   - heading outline never jumps more than +1 (no H1 → H3 jumps)
 *   - Legal Disclaimer section is reachable (in-DOM) and visible
 *   - "Back to homepage" CTA is reachable, visible, and links to /
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("/compound a11y smoke", () => {
  test("heading outline + legal disclaimer + CTA", async ({ page }) => {
    const res = await page.goto(`${BASE}/compound`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.ok()).toBeTruthy();

    // Exactly one H1
    await expect(page.locator("h1")).toHaveCount(1);

    // Outline order: no level skips greater than +1 from previous heading
    const levels = await page.$$eval(
      "h1, h2, h3, h4, h5, h6",
      (els) => els.map((el) => Number(el.tagName.substring(1))),
    );
    expect(levels.length).toBeGreaterThan(1);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      const jump = levels[i] - levels[i - 1];
      expect(
        jump,
        `Heading level jumps from H${levels[i - 1]} to H${levels[i]} at index ${i}`,
      ).toBeLessThanOrEqual(1);
    }

    // Legal Disclaimer heading reachable + visible
    const legal = page.getByRole("heading", { name: /Legal Disclaimer/i });
    await legal.scrollIntoViewIfNeeded();
    await expect(legal).toBeVisible();

    // Back to homepage CTA reachable + visible + correct href
    const cta = page.getByRole("link", { name: /Back to homepage/i });
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/");

    // CTA must be keyboard-focusable
    await cta.focus();
    expect(await cta.evaluate((el) => el === document.activeElement)).toBe(true);
  });
});
