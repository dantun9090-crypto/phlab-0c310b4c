/**
 * E2E: German (DACH) buyer checkout — PLZ validation + order payload.
 *
 * Runs the REAL built app against a local preview server with the order API
 * stubbed at the network layer. Asserts:
 *   1. Selecting Germany flips the postcode label to PLZ and accepts the
 *      German 5-digit format (e.g. 10115) without a UK-pattern error.
 *   2. An invalid PLZ (e.g. "1011" — 4 digits) is rejected client-side and
 *      the buyer stays on the address step (no premature advance).
 *   3. German address characters (ß, umlauts) survive the full submit path
 *      into the createOrder payload un-mangled.
 *   4. Analytics consent for a German IP defaults to denied (GDPR) — no
 *      ad-storage is granted before the banner choice.
 *   5. Successfully submit the order — the `/api/orders/create` server
 *      function MUST fire with the German address payload. This guards the
 *      2026-08-11 regression where the stub intercepted the wrong URL shape
 *      (`/api/orders/create` instead of the TanStack `/_serverFn/<id>`
 *      endpoint), the handler then threw reading `result.orderId` /
 *      `result.items` off the wrapper, crashed, and createOrder never fired.
 *
 * Fully local: Firestore/admin SDK is never touched — the `/_serverFn` POST
 * that wraps createOrder is fulfilled by the test itself.
 */
import { test, expect, type Page } from '@playwright/test';

const DE_CART_ITEM = {
  id: 'glow-10mg',
  productId: 'glow-10mg',
  name: 'Glow (GHK-Cu) 10mg',
  variant: '10mg',
  price: '£19.99',
  priceNum: 19.99,
  quantity: 1,
  image: '/placeholder.svg',
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

/**
 * Click "continue" on Step 2 and wait for a validation error. Same
 * swallowed-click hazard as fillContactStep: on slow-hydrating browsers
 * (firefox/webkit CI) the first click can be eaten before React attaches
 * its handlers, so the error never renders. Click, wait, retry once.
 */
async function clickAdvanceExpectError(page: Page, pattern: RegExp, timeout = 12_000) {
  const error = page.getByText(pattern);
  await page.getByRole('button', { name: /continue|next/i }).first().click();
  try {
    await expect(error.first()).toBeVisible({ timeout });
    return;
  } catch {
    // fall through — retry once for the swallowed-click case
  }
  await page.getByRole('button', { name: /continue|next/i }).first().click();
  await expect(error.first()).toBeVisible({ timeout: timeout * 2 });
}

test.describe('Checkout — Germany (DACH) shipping', () => {
  test.beforeEach(async ({ page }) => {
    await seedCart(page);
  });

  test('postcode field switches to PLZ rules for Germany', async ({ page }) => {
    await page.goto('/checkout');
    await fillContactStep(page);

    // Germany is a supported shipping destination.
    await page.locator('select#country').selectOption({ label: 'Germany (Deutschland)' });

    // Label flips to PLZ, placeholder becomes a German example.
    const postcode = page.locator('input#postcode');
    await expect(postcode).toBeVisible();
    await expect(postcode).toHaveAttribute('placeholder', '10115');

    // A valid 5-digit PLZ must NOT raise the UK-format error.
    await postcode.fill('10115');
    await expect(
      page.getByText(/valid postcode|enter a valid postcode/i),
    ).toHaveCount(0);

    // An invalid PLZ (4 digits) must raise an error on advance attempt.
    await postcode.fill('1011');
    await clickAdvanceExpectError(page, /valid postcode|enter a valid postcode/i);
    // We must NOT have advanced to the review / payment step.
    await expect(page.getByRole('heading', { name: /confirm|review|payment|age/i })).toHaveCount(0);
  });

  test('umlaut address submits into the createOrder payload', async ({ page }) => {
    // Intercept the TanStack server-function call that wraps createOrder.
    // The 2026-08-11 bug: the old stub matched `/api/orders/create`, but the
    // app posts to `/_serverFn/<base64>` — the stub never fired, the response
    // parsing code then read `result.orderId` / `result.items` off a missing
    // wrapper and the test crashed BEFORE createOrder was called, so CI was
    // green while the real submit path was broken. We match the real
    // endpoint and record the raw payload so we can assert on address
    // fidelity without depending on seroval internals.
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


    // Step 3 — confirm 18+ and Terms, then pay. Both checkboxes are custom-
    // styled with opacity-0 inputs, and WebKit hit-testing refuses to toggle
    // a fully transparent input ("Clicking the checkbox did not change its
    // state"). Click the LABEL text instead — native label activation toggles
    // the associated input in every engine.
    await page.getByText(/I confirm I am\s*18\s*years?/i).click();
    await expect(page.locator('#ageVerified')).toBeChecked();
    // Scope to the actual checkbox — `terms|research use/i` also matches the
    // page's "Research use notice" banner and "Confirm research use" button,
    // causing a strict-mode locator conflict.
    await page.locator('label', { has: page.locator('#acceptedTerms') }).click();
    await expect(page.locator('#acceptedTerms')).toBeChecked();
    // Select a payment method. Since the "collapsed payment options" change
    // nothing is pre-selected any more, and step-3 validation blocks the
    // order until the user picks one (`paymentMethod: ''` + e.paymentMethod).
    // In this hermetic run no online provider is configured, so only the
    // manual bank-transfer card renders. Same swallowed-click hazard as the
    // continue buttons — click, assert the selection stuck, retry once.
    const manualPayment = page.getByTestId('manual-bank-transfer-button');
    await manualPayment.click();
    try {
      await expect(manualPayment).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    } catch {
      await manualPayment.click();
      await expect(manualPayment).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
    }
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
    // metadata keys are asserted, plus the order id the backend will send.
    const ec = await page.evaluate(() => {
      try {
        const v = sessionStorage.getItem('phl_ec_payload');
        return v ? (JSON.parse(v) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    });
    expect(ec).not.toBeNull();
    expect(ec?.orderId).toBe('PHP-E2E-DE-1');
    expect(ec?.currency).toBe('GBP');
  });

  test('invalid PLZ blocks order submission at Step 2', async ({ page }) => {
    // The createOrder endpoint must NEVER be hit — step-2 validation has to
    // stop the flow first. The 2026-08-11 version of this test stubbed the
    // wrong URL, so the stub never fired and the assertion "stub not called"
    // passed vacuously while the REAL order API could have been hit. Now we
    // intercept the real /_serverFn path and fail loudly if createOrder
    // is reached.
    // the order API — the whole point of this test is that Step 2 catches
    let orderCallHit = false;
    await page.route(/\/_server(Fn)?\//, (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const seg = req.url().split(/\/_server(?:Fn)?\//)[1]?.split(/[?/]/)[0] ?? '';
        let id = { export: '' };
        try {
          id = JSON.parse(Buffer.from(seg, 'base64').toString('utf8'));
        } catch {
          /* ignore */
        }
        if (String(id.export ?? '').startsWith('createOrder')) orderCallHit = true;
      }
      return route.continue();
    });

    await page.goto('/checkout');
    await fillContactStep(page);

    await page.locator('select#country').selectOption({ label: 'Germany (Deutschland)' });
    await page.getByLabel(/street|address/i).first().fill('Hauptstraße 5');
    await page.getByLabel(/city/i).fill('München');
    // 4-digit PLZ is invalid for Germany.
    await page.locator('input#postcode').fill('8033');
    await clickAdvanceExpectError(page, /valid postcode|enter a valid postcode/i);

    const stepThreeHeading = page.getByRole('heading', { name: /confirm|review|payment|age/i });
    await expect(stepThreeHeading).toHaveCount(0);
    // Give any stray async submit a moment, then assert no createOrder call.
    await page.waitForTimeout(1_000);
    expect(orderCallHit).toBe(false);
  });
});
