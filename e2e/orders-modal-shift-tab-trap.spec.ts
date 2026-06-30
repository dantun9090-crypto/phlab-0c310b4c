/**
 * Shift+Tab focus-trap assertion for the Orders detail modal.
 *
 * Complements `orders-modal-focus-trap.spec.ts` (which walks forward) by
 * pressing Shift+Tab repeatedly and asserting focus never escapes the
 * dialog panel and never lands on the outside trigger / sibling button.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

test("Shift+Tab cycle stays trapped inside the Orders modal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/__e2e/orders-modal`, { waitUntil: "domcontentloaded" });

  const trigger = page.getByTestId("orders-modal-open");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const panel = page.getByTestId("orders-modal-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("orders-modal-close")).toBeFocused();

  const focusedTestId = async () =>
    page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid || "");
  const insidePanel = async () =>
    page.evaluate(() => {
      const p = document.querySelector('[data-testid="orders-modal-panel"]');
      return !!(p && document.activeElement && p.contains(document.activeElement));
    });

  // Shift+Tab from the first focusable (close) wraps to the last (link).
  await page.keyboard.press("Shift+Tab");
  expect(await focusedTestId()).toBe("orders-modal-link");
  expect(await insidePanel()).toBe(true);

  // Continue cycling backward — every step must stay inside the dialog and
  // never reach the outside trigger or sibling buttons.
  const allowed = ["orders-modal-close", "orders-modal-action", "orders-modal-link"];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await insidePanel()).toBe(true);
    const tid = await focusedTestId();
    expect(allowed).toContain(tid);
    expect(tid).not.toBe("orders-modal-open");
    expect(tid).not.toBe("outside-button");
  }
});
