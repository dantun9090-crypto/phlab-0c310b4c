/**
 * Orders detail modal centering / a11y guard.
 *
 * Uses the `/__e2e/orders-modal` harness (not the real admin tab, which is
 * auth-walled) to exercise the same wrapper markup:
 *   - `fixed inset-0 z-[1000] flex items-center justify-center`, portalled to body.
 * If the page is scrolled and the modal positions at the bottom (the original
 * bug), `box.y` will be near the page bottom instead of near viewport center.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

test('orders modal stays centered after scroll and supports Escape + focus return', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/__e2e/orders-modal`, { waitUntil: 'domcontentloaded' });

  // Scroll the trigger button into view at the bottom of the long page.
  const trigger = page.getByTestId('orders-modal-open');
  await trigger.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(500);

  await trigger.click();

  const panel = page.getByTestId('orders-modal-panel');
  await expect(panel).toBeVisible();

  // Panel must be vertically centered in the viewport (not stuck at page bottom).
  const box = await panel.boundingBox();
  const vp = page.viewportSize()!;
  expect(box).not.toBeNull();
  const centerY = box!.y + box!.height / 2;
  // Center should land within 25% of viewport mid-line.
  expect(Math.abs(centerY - vp.height / 2)).toBeLessThan(vp.height * 0.25);
  // And the panel should start within the visible viewport.
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(vp.height);

  // Background scroll must be locked while modal is open.
  const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
  expect(bodyOverflow).toBe('hidden');

  // Close button must receive focus automatically.
  await expect(page.getByTestId('orders-modal-close')).toBeFocused();

  // Escape closes the modal.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // Focus returns to the trigger button.
  await expect(trigger).toBeFocused();
});
