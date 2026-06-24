/**
 * Automated WCAG 2.1 AA accessibility audit for /research using axe-core.
 * Fails CI if any critical violation is detected; serious issues are still
 * logged for follow-up without blocking deploys.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("/research axe-core a11y audit", () => {
  test("has no critical WCAG violations", async ({ page }) => {
    await page.goto(`${BASE}/research`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .disableRules(["region"])
      .analyze();

    const blocking = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");

    if (blocking.length > 0) {
      const summary = blocking
        .map(
          (v) =>
            `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
              v.nodes.length === 1 ? "" : "s"
            })\n    ${v.helpUrl}`,
        )
        .join("\n");
      console.error(`\n${blocking.length} critical /research a11y violation(s):\n${summary}\n`);
    }

    if (serious.length > 0) {
      console.warn(
        `\n${serious.length} serious non-blocking /research a11y warning(s): ${serious
          .map((v) => v.id)
          .join(", ")}\n`,
      );
    }

    expect(
      blocking,
      `${blocking.length} critical axe violation(s) on /research — see console`,
    ).toEqual([]);
  });
});