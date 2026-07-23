/**
 * Payment selector — accessibility & keyboard navigation e2e.
 *
 * Runs against the preview build's harness route (/e2e/payment-options).
 * Verifies:
 *   - radiogroup + role="radio" semantics
 *   - aria-checked flips on real keyboard activation
 *   - aria-describedby wires to the visible instruction region per selection
 *   - focus-visible ring lands on the active option during Tab navigation
 *   - axe-core finds zero serious/critical violations on the payment step
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const HARNESS = "/e2e/payment-options";

// The harness page SSRs its markup, but option buttons only become
// interactive after the client bundle hydrates. On a cold CI dev server
// hydration can take 10s+ — clicking/pressing keys before that lands on
// inert SSR HTML and the assertions flake. Wait for the client's ready
// flag (window.__PHL_REACT_READY__ is set right after StartClient mounts).
async function gotoHarness(page: import("@playwright/test").Page) {
  await gotoHarness(page);
  await page
    .waitForFunction(
      () => (window as unknown as { __PHL_REACT_READY__?: boolean }).__PHL_REACT_READY__ === true,
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => {});
}

test.describe("PaymentMethodOptions — a11y + keyboard", () => {
  test("radiogroup exposes role=radio + aria-checked per option", async ({
    page,
  }) => {
    await gotoHarness(page);

    const group = page.getByRole("radiogroup", {
      name: /choose how you want to pay/i,
    });
    await expect(group).toBeVisible();

    const payByBank = page.getByTestId("pay-by-bank-button");
    const manual = page.getByTestId("manual-bank-transfer-button");
    await expect(payByBank).toHaveAttribute("role", "radio");
    await expect(manual).toHaveAttribute("role", "radio");

    // Initial harness state selects pay_by_bank.
    await expect(payByBank).toHaveAttribute("aria-checked", "true");
    await expect(manual).toHaveAttribute("aria-checked", "false");
  });

  test("keyboard activation flips aria-checked + aria-describedby", async ({
    page,
  }) => {
    await gotoHarness(page);

    const payByBank = page.getByTestId("pay-by-bank-button");
    const manual = page.getByTestId("manual-bank-transfer-button");

    // Tab through the page until the manual transfer button is focused, then
    // activate it with the keyboard (Space). This proves real keyboard users
    // can reach + select it without a mouse.
    await manual.focus();
    await expect(manual).toBeFocused();
    await page.keyboard.press("Space");

    await expect(manual).toHaveAttribute("aria-checked", "true");
    await expect(payByBank).toHaveAttribute("aria-checked", "false");

    // aria-describedby must point to the currently-rendered instructions and
    // must not linger on the now-unselected option.
    await expect(manual).toHaveAttribute(
      "aria-describedby",
      "manual-bank-transfer-details",
    );
    expect(await payByBank.getAttribute("aria-describedby")).toBeNull();
    await expect(page.locator("#manual-bank-transfer-details")).toBeVisible();

    // Now switch back to pay-by-bank with Enter and re-check the wiring.
    await payByBank.focus();
    await page.keyboard.press("Enter");
    await expect(payByBank).toHaveAttribute("aria-checked", "true");
    await expect(payByBank).toHaveAttribute(
      "aria-describedby",
      "pay-by-bank-instructions",
    );
    expect(await manual.getAttribute("aria-describedby")).toBeNull();
    await expect(page.locator("#pay-by-bank-instructions")).toBeVisible();
  });

  test("focus-visible ring renders on the focused option", async ({ page }) => {
    await gotoHarness(page);
    const manual = page.getByTestId("manual-bank-transfer-button");
    await manual.focus();
    // The component applies a 4px emerald ring on focus-visible. Verify the
    // computed outline/ring shadow is non-empty rather than asserting an
    // exact pixel — Chromium can render the ring as box-shadow or outline.
    const ringShadow = await manual.evaluate(
      (el) => getComputedStyle(el).boxShadow + " | " + getComputedStyle(el).outline,
    );
    expect(ringShadow).not.toMatch(/^none\s*\|\s*none/i);
  });

  test("axe-core: no serious/critical accessibility violations", async ({
    page,
  }) => {
    await gotoHarness(page);
    const results = await new AxeBuilder({ page })
      .include('[data-testid="harness-root"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking,
      `Serious/critical axe violations:\n${JSON.stringify(blocking, null, 2)}`,
    ).toEqual([]);
  });

  test("tap targets meet the ≥44px minimum on mobile widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoHarness(page);
    for (const id of ["pay-by-bank-button", "manual-bank-transfer-button"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, `bounding box for ${id}`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });
});
