import { test, expect } from '@playwright/test';

/**
 * Stage 4 — advert pop-up module.
 *
 * The pop-up is optional (it only renders when an active `popup` advert is
 * scheduled), so these checks are conditional. What must always hold:
 *  1. The homepage never renders a pop-up that cannot be closed.
 *  2. Closing it hides it immediately (no reload) and records the 7-day
 *     dismissal in localStorage.
 *  3. After dismissal it does not come back on the next visit.
 */
test.describe('advert pop-up', () => {
  test('pop-up is dismissible and stays hidden for the cooldown', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const confirm = page.getByRole('button', { name: /I Confirm/i });
    if (await confirm.count()) await confirm.first().click();

    const dialog = page.getByRole('dialog', { name: /special offer|advert/i });
    // Give the client-only pop-up its post-hydration delay.
    await page.waitForTimeout(3000);

    if (!(await dialog.count())) {
      test.info().annotations.push({ type: 'note', description: 'no active popup advert configured' });
      return;
    }

    await expect(dialog.first()).toBeVisible();

    const close = dialog.first().getByRole('button', { name: /close/i });
    await expect(close.first()).toBeVisible();
    await close.first().click();

    // Hidden immediately, without a reload.
    await expect(dialog.first()).toBeHidden();

    const keys = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.startsWith('phlabs_advert_dismissed_')),
    );
    expect(keys.length).toBeGreaterThan(0);

    // Does not return on the next visit.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page.getByRole('dialog', { name: /special offer|advert/i })).toHaveCount(0);
  });
});
