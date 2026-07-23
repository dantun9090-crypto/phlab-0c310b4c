/**
 * Clicking the dark overlay (outside the panel) must close the Orders modal
 * and return focus to the trigger element. Uses the `/e2e/orders-modal`
 * harness which mirrors `OrdersTab.tsx`.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

test('clicking the overlay closes the modal and restores focus to the trigger', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/e2e/orders-modal`, { waitUntil: 'domcontentloaded' });

  const trigger = page.getByTestId('orders-modal-open');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const panel = page.getByTestId('orders-modal-panel');
  const overlay = page.getByTestId('orders-modal-overlay');
  await expect(panel).toBeVisible();

  // Click the overlay near the top-left corner so we don't accidentally hit
  // the centered panel.
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 8, box!.y + 8);

  await expect(panel).toHaveCount(0);

  // Body scroll lock must be released after close.
  const overflow = await page.evaluate(() => document.body.style.overflow);
  expect(overflow).toBe('');

  // Focus should return to the trigger button.
  await expect(trigger).toBeFocused();
});
