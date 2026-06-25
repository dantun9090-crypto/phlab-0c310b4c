/**
 * Smoke test for /research.
 *
 * Asserts the route renders the canonical article-rich page from
 * src/pages/Research/index.tsx (Peptide Research & Comparative Science)
 * and that the previous Google-Ads landing overlay is NOT present.
 * If this test fails, somebody re-introduced a src/routes/research.tsx
 * (or similar) that hijacks the path.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.RESEARCH_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("/research = legacy article page only", () => {
  test("renders Peptide Research page, no Ads overlay", async ({ page }) => {
    const res = await page.goto(`${BASE}/research`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.ok(), `GET /research returned ${res?.status()}`).toBeTruthy();

    // Stable data marker emitted by src/pages/Research/index.tsx.
    await expect(page.locator('[data-source="legacy-research-page"]')).toBeVisible();

    // Canonical H1 from the article page.
    await expect(page.locator("h1")).toContainText(/Peptide Research/i);
    await expect(page.locator("h1")).toContainText(/Comparative Science/i);

    // Compound sections must be rendered (article-rich layout).
    await expect(page.locator("#incretin")).toBeAttached();
    await expect(page.locator("#peptides")).toBeAttached();
    await expect(page.locator("#nad")).toBeAttached();

    // Overlay must NOT be present.
    await expect(
      page.locator('[data-source="research-ads-landing"]'),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: /^\s*Research Compounds\b/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^Back to homepage$/i }),
    ).toHaveCount(0);
  });
});
