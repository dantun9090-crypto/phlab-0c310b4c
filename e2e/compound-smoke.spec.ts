/**
 * Smoke E2E: /compound landing page (prerendered).
 *
 * Loads the page through a real browser and asserts the hero H1, both
 * "For Research Use Only. Not for Human Consumption." disclaimers, and
 * the "Back to homepage" CTA are visible.
 *
 * Targets COMPOUND_BASE_URL || TEST_BASE_URL || production phlabs.co.uk.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("/compound landing page", () => {
  test("hero, both disclaimers, and CTA are visible", async ({ page }) => {
    const res = await page.goto(`${BASE}/compound`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.ok(), `GET /compound returned ${res?.status()}`).toBeTruthy();

    // Hero H1
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/Premium Research Compounds/i);

    // Two disclaimers (top bar + footer/legal section)
    const disclaimer = page.getByText(
      /For Research Use Only\.\s*Not for Human Consumption\./i,
    );
    await expect
      .poll(async () => await disclaimer.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    await expect(disclaimer.first()).toBeVisible();
    await expect(disclaimer.last()).toBeVisible();

    // CTA back to homepage
    const cta = page.getByRole("link", { name: /Back to homepage/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/");
  });
});
