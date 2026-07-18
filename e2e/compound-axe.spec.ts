/**
 * Automated WCAG 2.1 AA accessibility audit for /compound using axe-core.
 *
 * Fails the test if any 'critical' or 'serious' violation is detected.
 * Tags scanned: wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice.
 *
 * Disabled rules (intentional, noisy on prerendered marketing pages):
 *   - region: top disclaimer bar + footer divs are not landmark regions
 *     by design; the page already has a single <main>.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("/compound axe-core a11y audit", () => {
  // Live /compound cold-boot occasionally exceeds the global 30s test
  // timeout on Cloudflare cache-miss + Prerender.io warm-up. Raise this
  // spec's own timeout so a slow first byte on the live edge doesn't fail
  // the a11y audit — the audit itself is unchanged.
  test.setTimeout(90_000);

  test("has no critical or serious WCAG violations", async ({ page }) => {
    // `networkidle` never resolves against the live domain because GTM +
    // Firestore long-polling keep at least one connection open. Wait for
    // DOM ready, then for the H1 the audit relies on.
    await page.goto(`${BASE}/compound`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.locator("h1")).toBeVisible({ timeout: 30_000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .disableRules(["region"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    if (blocking.length > 0) {
      const summary = blocking
        .map(
          (v) =>
            `  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
              v.nodes.length === 1 ? "" : "s"
            })\n    ${v.helpUrl}`,
        )
        .join("\n");
      console.error(`\n${blocking.length} blocking a11y violation(s):\n${summary}\n`);
    }

    expect(
      blocking,
      `${blocking.length} critical/serious axe violation(s) — see console`,
    ).toEqual([]);
  });
});
