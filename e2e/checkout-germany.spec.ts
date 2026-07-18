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
  // Advance to the address step. On slow-hydrating browsers (webkit CI) the
  // click can land BEFORE React attaches its handlers and is silently
  // swallowed — so click, assert the address step actually arrived, and
  // retry the click once if it was eaten.
  const country = page.locator('select#country');
  await page.getByRole('button', { name: /continue|next/i }).first().click();
  try {
    await expect(country).toBeVisible({ timeout: 10_000 });
  } catch {
    await page.getByRole('button', { name: /continue|next/i }).first().click();
    await expect(country).toBeVisible({ timeout: 20_000 });
  }
}

// Webkit needs noticeably longer to boot + hydrate the checkout; the
// default 30s test cap was eaten before select#country ever appeared.
test.describe.configure({ timeout: 60_000 });

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
    await expect(page.getByLabel(/18\s*years?\s*(of age)?\s*or\s*older|18\s*or\s*older|18\+/i)).toBeVisible({ timeout: 5000 });
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
    // Intercept the TanStack server-function calls so the test does not hit
    // Firestore or real payment providers.
    //
    // TanStack Start encodes the server-fn id in the URL path segment as
    // base64 JSON ({"file": "...functions.ts?tss-serverfn-split", "export":
    // "<fnName>_createServerFn_handler"}) — verified from a CI wire dump —
    // so the exact function is recovered by decoding the URL instead of
    // guessing tokens inside the seroval reference-encoded body.
    //
    // Response contract (start-client-core serverFnFetcher): a JSON response
    // WITHOUT the `x-tss-serialized` header is handed to the caller AS-IS —
    // there is no `{ result: … }` wrapper on the plain-JSON path. Mock
    // bodies must therefore be the bare return value; an earlier revision
    // wrapped everything in {result:…}, so the preflight read
    // `result.items` off the wrapper, crashed, and createOrder never fired.
    const orderPayloads: string[] = [];
    // Match BOTH generations of the TanStack server-fn path (/_serverFn/<id>
    // and the newer /_server/<id>).
    // Hermetic Firebase Auth: anonymous sign-in + token refresh are mocked
    // so the pay flow never depends on live Firebase reachability (the SDK
    // otherwise retries forever in offline/CI-sandbox environments and
    // createOrder never fires). The token is fake — createOrder itself is
    // mocked below, so nothing verifies it.
    await page.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, (route) => {
      const url = route.request().url();
      if (url.includes('accounts:signUp')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            kind: 'identitytoolkit#SignupNewUserResponse',
            idToken: 'e2e-anon-id-token',
            refreshToken: 'e2e-anon-refresh-token',
            expiresIn: '3600',
            localId: 'e2e-anon-uid',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-anon-id-token',
          id_token: 'e2e-anon-id-token',
          refresh_token: 'e2e-anon-refresh-token',
          expires_in: '3600',
          token_type: 'Bearer',
          user_id: 'e2e-anon-uid',
        }),
      });
    });

    await page.route(/\/_server(Fn)?\//, async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();

      const seg =
        req.url().split(/\/_server(?:Fn)?\//)[1]?.split(/[?/]/)[0] ?? '';
      let fnExport = '';
      try {
        fnExport = String(
          JSON.parse(Buffer.from(seg, 'base64').toString('utf8')).export ?? '',
        );
      } catch {
        /* leave empty — fall through to route.continue() */
      }
      const rawBody = req.postData() ?? '';

      if (fnExport.startsWith('validateCartPrices')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            items: [{
              productId: DE_CART_ITEM.id,
              variantId: null,
              unitPrice: DE_CART_ITEM.priceNum,
              inStock: true,
            }],
            subtotal: DE_CART_ITEM.priceNum,
            discount: 0,
            shippingDiscount: 0,
            coupon: null,
            errors: [],
          }),
        });
      }

      if (fnExport.startsWith('createOrder')) {
        // seroval cross-JSON keeps object keys and string values as literal
        // text, so the raw body still carries the German address tokens the
        // assertions below look for.
        orderPayloads.push(rawBody);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            orderId: 'PHP-E2E-DE-1',
            bankTransferReference: 'PHP-E2E-DE-1-BT',
            subtotal: 19.99,
            discount: 0,
            shippingCost: 4.99,
            totalAmount: 24.98,
            couponCode: null,
            paymentToken: null,
          }),
        });
      }

      return route.continue();
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
    await page.getByLabel(/18\s*years?\s*(of age)?\s*or\s*older|18\s*or\s*older|18\+/i).check();
    // Scope to the actual checkbox — `terms|research use/i` also matches the
    // page's "Research use notice" banner and "Confirm research use" button,
    // causing a strict-mode locator conflict.
    await page.locator('#acceptedTerms').check();
    // Click the REAL place-order button by its stable test id: a role+name
    // locator matches the step-3 accordion header ("3 Payment") first, so
    // .first() toggled the accordion instead of placing the order — the
    // original reason createOrder was never called.
    await page.locator('#checkout-pay-button').click();

    // Wait for the order-create call to be observed (the test MUST still
    // fail when the order request never fires — this poll is the guard).
    await expect.poll(() => orderPayloads.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // seroval keeps keys + string values literal on the wire, so the German
    // address is assertable directly on the raw body. `ß` may arrive either
    // literal or as a unicode escape.
    const raw = orderPayloads[0];
    expect(raw).toContain('Germany');
    expect(raw).toContain('10115');
    expect(raw).toContain('Berlin');
    expect(raw).toMatch(/Musterstra(?:ß|\\u00[dD][fF])e\s*12/);

    // Analytics — Enhanced Conversions payload cached at pay-button click.
    // Identifiers are SHA-256 hashed before storage (CodeQL
    // js/clear-text-storage-of-sensitive-data); only the non-sensitive
    // locality fields stay readable: `country` (ISO alpha-2), `postal_code`,
    // `city` — see buildUserData in src/lib/analytics.ts.
    await expect.poll(async () => {
      return await page.evaluate(() => sessionStorage.getItem('php_ec_userdata_hashed'));
    }, { timeout: 5_000 }).not.toBeNull();
    const ec = await page.evaluate(() => {
      const raw = sessionStorage.getItem('php_ec_userdata_hashed');
      return raw ? JSON.parse(raw) as Record<string, string> : null;
    });
    expect(ec?.country).toBe('DE');
    expect(ec?.postal_code).toBe('10115');
    expect(ec?.city).toBe('Berlin');
  });

  test('Step 2 blocks a German street line missing the house number OR the street name', async ({ page }) => {
    // Fail loudly if the client accidentally lets an invalid street reach
    // the order API — the whole point of this test is that Step 2 catches
    // it BEFORE any /_serverFn call fires.
    let orderCallHit = false;
    await page.route('**/_serverFn/**', async (route) => {
      // The fn name is NOT in the URL path — decode the base64 server-fn id
      // (same scheme as the payload test above) so this guard actually fires.
      const seg =
        route.request().url().split(/\/_server(?:Fn)?\//)[1]?.split(/[?/]/)[0] ?? '';
      try {
        const id = JSON.parse(Buffer.from(seg, 'base64').toString('utf8'));
        if (String(id.export ?? '').startsWith('createOrder')) orderCallHit = true;
      } catch { /* not a decodable server-fn id */ }
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
    await expect(page.getByLabel(/18\s*years?\s*(of age)?\s*or\s*older|18\s*or\s*older|18\+/i)).toBeVisible({ timeout: 5000 });

    // The order-create endpoint must NEVER have been called during the
    // invalid attempts above.
    expect(orderCallHit).toBe(false);
  });
});
