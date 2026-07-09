/**
 * End-to-end coverage for the Germany checkout flow.
 *
 * Verifies that a German shopper can:
 *   1. Select "Germany" in the country dropdown.
 *   2. See the postcode field switch to "PLZ (Postleitzahl)" with a
 *      numeric-only input constrained to 5 digits.
 *   3. Be blocked with a clear error when the PLZ / address is invalid.
 *   4. Advance past Step 2 (address) once a valid German address is entered.
 *   5. Successfully submit the order — the `/api/orders/create` server
 *      function is intercepted so the test does not touch Firestore, and we
 *      assert the outbound payload carries `country: "Germany"` +
 *      `postcode: "10115"` before returning a canned success response.
 *
 * The cart is seeded via `localStorage['php_cart']` so the suite does not
 * depend on live product data or a working "Add to cart" button.
 */
import { test, expect, type Page } from '@playwright/test';

const DE_CART_ITEM = {
  id: 'e2e-de-item',
  name: 'BPC-157 Research Peptide',
  variantId: null,
  variantName: null,
  dosage: '5mg',
  price: '£19.99',
  priceNum: 19.99,
  quantity: 1,
  image: '',
  stock: 50,
};

async function seedCart(page: Page) {
  await page.addInitScript((item) => {
    try {
      window.localStorage.setItem('php_cart', JSON.stringify([item]));
    } catch {
      /* ignore — private mode */
    }
  }, DE_CART_ITEM);
}

async function fillContactStep(page: Page) {
  await page.getByLabel(/first name/i).fill('Hans');
  await page.getByLabel(/last name/i).fill('Müller');
  await page.getByLabel(/^email/i).fill('hans.mueller@example.de');
  // Phone is optional — leave blank to prove non-UK numbers are not required.
  // Advance to the address step.
  await page.getByRole('button', { name: /continue|next/i }).first().click();
}

test.describe('Checkout — Germany', () => {
  test.beforeEach(async ({ page }) => {
    await seedCart(page);
  });

  test('country dropdown exposes Germany and switches the postcode field', async ({ page }) => {
    await page.goto('/checkout');
    await fillContactStep(page);

    const country = page.locator('select#country');
    await expect(country).toBeVisible();
    await expect(country.locator('option', { hasText: /Germany/i })).toHaveCount(1);

    await country.selectOption({ label: 'Germany (Deutschland)' });

    // Label flips to PLZ, placeholder becomes a German example.
    const postcode = page.locator('input#postcode');
    await expect(page.locator('label[for="postcode"]')).toContainText(/PLZ/i);
    await expect(postcode).toHaveAttribute('placeholder', '10115');
    await expect(postcode).toHaveAttribute('inputmode', 'numeric');

    // Non-digit characters are stripped, length is capped at 5.
    await postcode.fill('SW1A 1AA');
    await expect(postcode).toHaveValue('11');
    await postcode.fill('1234567');
    await expect(postcode).toHaveValue('12345');
  });

  test('invalid German address is blocked with a clear error', async ({ page }) => {
    await page.goto('/checkout');
    await fillContactStep(page);

    await page.locator('select#country').selectOption({ label: 'Germany (Deutschland)' });
    await page.getByLabel(/street|address/i).first().fill('Musterstraße 12');
    await page.getByLabel(/city/i).fill('Berlin');
    await page.locator('input#postcode').fill('123'); // too short
    // Try to advance — should be blocked with a PLZ error.
    await page.getByRole('button', { name: /continue|next/i }).first().click();

    await expect(page.getByText(/valid German postcode|5 digits|PLZ/i)).toBeVisible();
    // We must NOT have advanced to the review / payment step.
    await expect(page.getByRole('heading', { name: /confirm|review|payment|age/i })).toHaveCount(0);
  });

  test('valid German address advances and submits with Germany + PLZ payload', async ({ page }) => {
    // Intercept the order-creation server function so the test does not
    // hit Firestore or real payment providers. Assert the payload shape.
    const orderPayloads: Array<Record<string, unknown>> = [];
    await page.route('**/_serverFn/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'POST' && /create-?[Oo]rder|createOrder/.test(url)) {
        try {
          const body = req.postDataJSON();
          orderPayloads.push(body);
        } catch { /* ignore */ }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              ok: true,
              orderId: 'PHP-E2E-DE-1',
              bankTransferReference: 'PHP-E2E-DE-1-BT',
              subtotal: 19.99,
              discount: 0,
              shippingCost: 4.99,
              totalAmount: 24.98,
              couponCode: null,
              paymentToken: null,
            },
          }),
        });
      }
      return route.continue();
    });
    // Also stub cart validation so unknown seeded productId doesn't hard-fail.
    await page.route('**/_serverFn/**', async (route) => {
      const url = route.request().url();
      if (/validate-?[Cc]art|validateCartPrices/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              ok: true,
              items: [{ productId: DE_CART_ITEM.id, variantId: null, unitPrice: DE_CART_ITEM.priceNum }],
              subtotal: DE_CART_ITEM.priceNum,
              discount: 0,
              shippingDiscount: 0,
              coupon: null,
              errors: [],
            },
          }),
        });
      }
      return route.fallback();
    });

    await page.goto('/checkout');
    await fillContactStep(page);

    await page.locator('select#country').selectOption({ label: 'Germany (Deutschland)' });
    await page.getByLabel(/street|address/i).first().fill('Musterstraße 12');
    await page.getByLabel(/city/i).fill('Berlin');
    await page.locator('input#postcode').fill('10115');
    // Pick standard shipping.
    await page.getByText(/Standard 1–3 Day Delivery/i).first().click();
    await page.getByRole('button', { name: /continue|next/i }).first().click();

    // Step 3 — confirm 18+ and Terms, then pay.
    await page.getByLabel(/18 or older|18\+/i).check();
    await page.getByLabel(/terms|research use/i).check();
    await page.getByRole('button', { name: /pay|place order|continue to payment/i }).first().click();

    // Wait for the order-create call to be observed.
    await expect.poll(() => orderPayloads.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const payload = orderPayloads[0] as { data?: { customer?: Record<string, string> } };
    const customer = payload?.data?.customer ?? (payload as any)?.customer;
    expect(customer?.country).toBe('Germany');
    expect(customer?.postcode).toBe('10115');
    expect(customer?.city).toBe('Berlin');
    expect(customer?.address).toMatch(/Musterstraße\s*12/);
  });
});
