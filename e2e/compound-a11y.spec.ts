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

    // Outline order: no level skips greater than +1 from previous heading.
    // $$eval executes exactly once — on the dev server it can land inside
    // the CSR-remount window (SSR DOM already wiped, React tree not yet
    // committed) and see ZERO headings even though the h1 count assertion
    // above already passed. toPass() retries the read until the outline
    // actually exists.
    let levels: number[] = [];
    await expect(async () => {
      levels = await page.$$eval(
        "h1, h2, h3, h4, h5, h6",
        (els) => els.map((el) => Number(el.tagName.substring(1))),
      );
      expect(levels.length).toBeGreaterThan(1);
    }).toPass({ timeout: 15_000 });
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
    // Assert visibility+scroll inside ONE retrying closure: a bare
    // toBeVisible() → scrollIntoViewIfNeeded() sequence can still race the
    // CSR remount (visibility resolves on the SSR node, the React takeover
    // detaches it, and the scroll then dies with "Element is not attached
    // to the DOM"). toPass() re-runs the whole block with freshly-resolved
    // locators until the page is stable.
    await expect(async () => {
      await expect(legal).toBeVisible({ timeout: 2_000 });
      await legal.scrollIntoViewIfNeeded();
    }).toPass({ timeout: 15_000 });

    // Back to homepage CTA reachable + visible + correct href
    const cta = page.getByRole("link", { name: /Back to homepage/i });
    await expect(async () => {
      await expect(cta).toBeVisible({ timeout: 2_000 });
      await cta.scrollIntoViewIfNeeded();
    }).toPass({ timeout: 15_000 });
    await expect(cta).toHaveAttribute("href", "/");

    // CTA must be keyboard-focusable
    await cta.focus();
    expect(await cta.evaluate((el) => el === document.activeElement)).toBe(true);
  });
});
