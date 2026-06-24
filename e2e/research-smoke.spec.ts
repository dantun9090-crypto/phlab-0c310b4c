/**
 * Browser-level smoke for /research: confirms the prerendered page renders
 * the hero H1, both disclaimers, and a working Back-to-homepage CTA.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("/research landing page", () => {
  test("hero, disclaimers, and CTA are visible", async ({ page }) => {
    const res = await page.goto(`${BASE}/research`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.ok(), `GET /research returned ${res?.status()}`).toBeTruthy();

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText(/Research Compounds/i);

    const disclaimer = page.getByText(
      /For Research Use Only\.\s*Not for Human Consumption\./i,
    );
    await expect
      .poll(async () => await disclaimer.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);

    const cta = page.getByRole("link", { name: /Back to homepage/i });
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/");
  });
});
