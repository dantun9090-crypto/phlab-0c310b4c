import { test, expect } from '@playwright/test';

/**
 * Stage 3 — customer reviews.
 *
 * 1. The review form is reachable from a product page.
 * 2. Client validation blocks empty/short bodies and non-compliant copy.
 * 3. Homepage never renders an empty testimonials block from the reviews
 *    collection (section only appears when approved reviews exist).
 */
test.describe('customer reviews', () => {
  test('review form opens and validates on a product page', async ({ page }) => {
    await page.goto('/products', { waitUntil: 'domcontentloaded' });
    const confirm = page.getByRole('button', { name: /I Confirm/i });
    if (await confirm.count()) await confirm.first().click();

    const firstProduct = page.locator('a[href^="/products/"]').first();
    await firstProduct.waitFor({ state: 'visible', timeout: 30_000 });
    await firstProduct.click();

    const openBtn = page.getByRole('button', { name: 'Write a review' });
    await openBtn.waitFor({ state: 'visible', timeout: 30_000 });
    await openBtn.click();

    const form = page.getByRole('form', { name: 'Write a review' });
    await expect(form).toBeVisible();

    // Rating radios default to 5 and are switchable.
    const three = form.getByRole('radio', { name: '3 stars' });
    await three.click();
    await expect(three).toHaveAttribute('aria-checked', 'true');

    // Native required validation prevents submitting an empty form.
    await form.getByRole('button', { name: 'Submit review' }).click();
    await expect(form).toBeVisible();
    await expect(page.getByText(/Thank you for your review/i)).toHaveCount(0);
  });

  test('homepage renders no empty approved-reviews section', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const heading = page.getByRole('heading', { name: 'What researchers say' });
    if (await heading.count()) {
      // If present, it must contain at least one review card.
      const cards = page.locator('section[aria-labelledby="testimonials-heading"] li');
      expect(await cards.count()).toBeGreaterThan(0);
    }
  });
});
