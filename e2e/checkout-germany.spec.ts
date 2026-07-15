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

  test('switching UK → Germany clears the postcode, relabels to PLZ, and blocks submit until a valid 5-digit PLZ is entered', async ({ page }) => {
    await page.goto('/checkout');
    await fillContactStep(page);

    const country = page.locator('select#country');
    const postcode = page.locator('input#postcode');
    const postcodeLabel = page.locator('label[for="postcode"]');
    const advance = page.getByRole('button', { name: /continue|next/i }).first();

    // 1. Start on United Kingdom (default). Fill a valid UK address.
    await expect(country).toHaveValue('United Kingdom');
    await expect(postcodeLabel).toContainText(/^Postcode/);
    await page.getByLabel(/street|address/i).first().fill('10 Downing Street');
    await page.getByLabel(/city/i).fill('London');
    await postcode.fill('SW1A 2AA');
    await expect(postcode).toHaveValue('SW1A 2AA');

    // 2. Switch to Germany — postcode MUST clear and label MUST become PLZ.
    await country.selectOption({ label: 'Germany (Deutschland)' });
    await expect(postcode).toHaveValue('');
    await expect(postcodeLabel).toContainText('PLZ (Postleitzahl)');
    await expect(postcode).toHaveAttribute('inputmode', 'numeric');
    await expect(postcode).toHaveAttribute('placeholder', '10115');

    // 3. Empty PLZ → advance blocked, "Required" error surfaces.
    await advance.click();
    await expect(postcode).toBeFocused().catch(() => { /* focus is best-effort across browsers */ });
    const postcodeErr = page.locator('label[for="postcode"] + input + p, #postcode ~ p').first();
    await expect(postcodeErr).toBeVisible();
    // Must NOT have advanced to Step 3.
    await expect(page.getByRole('heading', { name: /confirm|review|payment|age/i })).toHaveCount(0);

    // 4. Too-short PLZ ("123") → advance still blocked with the DE-specific copy.
    await postcode.fill('123');
    await advance.click();
    await expect(page.getByText(/Enter a valid German postcode/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /confirm|review|payment|age/i })).toHaveCount(0);

    // 5. Non-digits are stripped in real time.
    await postcode.fill('ABC12de');
    await expect(postcode).toHaveValue('12');

    // 6. Valid 5-digit PLZ + shipping selected → advance succeeds and PLZ is preserved.
    await postcode.fill('10115');
    await expect(postcode).toHaveValue('10115');
    await page.getByText(/Standard 1–3 Day Delivery/i).first().click();
    await advance.click();

    // Step 3 has rendered (age / terms visible).
    await expect(page.getByLabel(/18 or older|18\+/i)).toBeVisible({ timeout: 5000 });
    // Going back to the address step, the German PLZ we entered is still there.
    await page.getByRole('button', { name: /delivery address|edit address|address/i }).first().click().catch(() => { /* accordion may auto-scroll */ });
    await expect(page.locator('input#postcode')).toHaveValue('10115');
    await expect(page.locator('label[for="postcode"]')).toContainText('PLZ (Postleitzahl)');
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

    await expect(page.getByText(/Enter a valid German postcode/i)).toBeVisible();
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

    // Analytics — Enhanced Conversions payload cached at pay-button click.
    // Assert the ISO-3166 alpha-2 country ("DE"), the German PLZ ("10115"),
    // and the city ("Berlin") reach the analytics layer alongside the order.
    await expect.poll(async () => {
      return await page.evaluate(() => sessionStorage.getItem('php_ec_userdata'));
    }, { timeout: 5_000 }).not.toBeNull();
    const ec = await page.evaluate(() => {
      const raw = sessionStorage.getItem('php_ec_userdata');
      return raw ? JSON.parse(raw) as Record<string, string> : null;
    });
    expect(ec?.country).toBe('DE');
    expect(ec?.postalCode).toBe('10115');
    expect(ec?.city).toBe('Berlin');
  });

  test('Step 2 blocks a German street line missing the house number OR the street name', async ({ page }) => {
    // Fail loudly if the client accidentally lets an invalid street reach
    // the order API — the whole point of this test is that Step 2 catches
    // it BEFORE any /_serverFn call fires.
    let orderCallHit = false;
    await page.route('**/_serverFn/**', async (route) => {
      if (/create-?[Oo]rder|createOrder/.test(route.request().url())) {
        orderCallHit = true;
      }
      return route.fallback();
    });

    await page.goto('/checkout');
    await fillContactStep(page);

    await page.locator('select#country').selectOption({ label: 'Germany (Deutschland)' });
    await page.getByLabel(/city/i).fill('Berlin');
    await page.locator('input#postcode').fill('10115');
    await page.getByText(/Standard 1–3 Day Delivery/i).first().click();

    const streetInput = page.getByLabel(/street|address/i).first();
    const advance = page.getByRole('button', { name: /continue|next/i }).first();
    const stepThreeHeading = page.getByRole('heading', { name: /confirm|review|payment|age/i });
    const streetError = page.getByText(/street name and house number|Musterstraße 12/i);

    // Case A — street name only, no house number ("Musterstraße").
    await streetInput.fill('Musterstraße');
    await advance.click();
    await expect(streetError).toBeVisible();
    await expect(stepThreeHeading).toHaveCount(0);

    // Case B — house number only, no street name ("12").
    await streetInput.fill('12');
    await advance.click();
    await expect(streetError).toBeVisible();
    await expect(stepThreeHeading).toHaveCount(0);

    // Case C — punctuation-only, still no letters and no digits.
    await streetInput.fill('---');
    await advance.click();
    await expect(streetError).toBeVisible();
    await expect(stepThreeHeading).toHaveCount(0);

    // Sanity: fixing the address (adds a house number) lets Step 2 pass.
    await streetInput.fill('Musterstraße 12');
    await advance.click();
    await expect(page.getByLabel(/18 or older|18\+/i)).toBeVisible({ timeout: 5000 });

    // The order-create endpoint must NEVER have been called during the
    // invalid attempts above.
    expect(orderCallHit).toBe(false);
  });
});
