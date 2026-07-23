/**
 * Verifies the focus trap inside the Orders detail modal.
 * Uses the `/e2e/orders-modal` harness which mirrors the production wrapper
 * markup and the same focus-trap effect used in `OrdersTab.tsx`.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

test('Tab + Shift+Tab cycle stays inside the dialog while open', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/e2e/orders-modal`, { waitUntil: 'domcontentloaded' });

  const trigger = page.getByTestId('orders-modal-open');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const panel = page.getByTestId('orders-modal-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('orders-modal-close')).toBeFocused();

  // Walk forward through every focusable inside the dialog; confirm focus
  // never escapes outside the panel.
  const focusedTestId = async () =>
    page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid || '');
  const insidePanel = async () =>
    page.evaluate(() => {
      const panel = document.querySelector('[data-testid="orders-modal-panel"]');
      return !!(panel && document.activeElement && panel.contains(document.activeElement));
    });

  // close → action → link → (wrap) close
  await page.keyboard.press('Tab');
  expect(await focusedTestId()).toBe('orders-modal-action');
  expect(await insidePanel()).toBe(true);

  await page.keyboard.press('Tab');
  expect(await focusedTestId()).toBe('orders-modal-link');
  expect(await insidePanel()).toBe(true);

  // Forward Tab from the last item must wrap back to the first focusable.
  await page.keyboard.press('Tab');
  expect(await focusedTestId()).toBe('orders-modal-close');
  expect(await insidePanel()).toBe(true);

  // Shift+Tab from the first item must wrap to the last.
  await page.keyboard.press('Shift+Tab');
  expect(await focusedTestId()).toBe('orders-modal-link');
  expect(await insidePanel()).toBe(true);

  // Crucially: the outside-the-modal trigger is never reached while open.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await insidePanel()).toBe(true);
    const tid = await focusedTestId();
    expect(['orders-modal-close', 'orders-modal-action', 'orders-modal-link']).toContain(tid);
  }
});
