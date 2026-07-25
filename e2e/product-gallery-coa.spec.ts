import { test, expect } from '@playwright/test';

/**
 * Stage 2 — public product gallery + COA visibility.
 *
 * Verifies the customer-facing side only (admin editor is auth-gated):
 *  - multi-image products expose thumbnails that switch the main image
 *  - the COA button renders and opens the certificate modal when visible
 */

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

test('product page gallery switches images and exposes the COA control', async ({ page }) => {
  await page.goto(`${BASE}/products`, { waitUntil: 'domcontentloaded' });

  const firstProduct = page.locator('a[href^="/product/"]').first();
  await firstProduct.waitFor({ state: 'visible', timeout: 30_000 });
  await firstProduct.click();

  await page.waitForURL(/\/product\//, { timeout: 30_000 });

  // COA control is always rendered (enabled when a certificate is published).
  const coa = page.getByRole('button', { name: /Certificate of Analysis/i }).first();
  await expect(coa).toBeVisible({ timeout: 30_000 });

  // Thumbnails only exist for multi-image products — exercise them when present.
  const thumbs = page.getByRole('button', { name: /View .* image \d+$/ });
  const count = await thumbs.count();
  if (count > 1) {
    await thumbs.nth(1).click();
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');
  }

  // Open the certificate modal when this product has one published.
  if (await coa.isEnabled()) {
    await coa.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  }
});
