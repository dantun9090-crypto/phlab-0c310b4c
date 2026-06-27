/**
 * Admin tabs render guard. We can't sign in as admin from CI, so we
 * navigate to /admin and only assert that:
 *   - the document doesn't render the per-tab error-boundary panel
 *     ("This tab failed to load"), and
 *   - no uncaught client error matching the historical crash
 *     `expiryDate.toDate is not a function` was thrown.
 *
 * This pins the Marketing/Promo Codes/Badges expiryDate regression: even
 * if the gate redirects us to /login, the bug used to surface during
 * module evaluation, so we'd still catch it.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

test('admin route loads without expiryDate.toDate crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Error boundary text must NOT be present.
  await expect(page.getByText('This tab failed to load')).toHaveCount(0);

  // Historical crash signature must not appear in console errors either.
  const offending = errors.filter((e) => /expiryDate\.toDate is not a function/i.test(e));
  expect(offending, `crash signature reappeared:\n${offending.join('\n')}`).toHaveLength(0);
});
