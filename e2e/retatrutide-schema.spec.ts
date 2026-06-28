/**
 * Runtime check: load the Retatrutide PDP and confirm the FAQ + HowTo
 * JSON-LD blobs are present in <head> with the targeted misspellings inside
 * the description / mainEntity payload.
 *
 * Complements `src/lib/retatrutide-schema.test.ts` (static source check) by
 * exercising the client-side injection path that runs in useEffect.
 */
import { test, expect } from '@playwright/test';

const REQUIRED = ['retatrtide', 'retatrutife', 'retatrutidw', 'retatide'];
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

test('retatrutide PDP injects FAQ + HowTo JSON-LD with misspellings', async ({ page }) => {
  await page.goto(`${BASE}/products/retatrutide-research-peptide`, {
    waitUntil: 'domcontentloaded',
  });

  // The product page injects schemas on mount; allow up to 10s for hydration.
  await page.waitForSelector('script#faq-schema', { timeout: 10_000 });
  await page.waitForSelector('script#howto-schema', { timeout: 10_000 });

  const faqText = (await page.locator('script#faq-schema').textContent()) ?? '';
  const howToText = (await page.locator('script#howto-schema').textContent()) ?? '';

  const faqJson = JSON.parse(faqText);
  const howToJson = JSON.parse(howToText);

  expect(faqJson['@type']).toBe('FAQPage');
  expect(howToJson['@type']).toBe('HowTo');

  const combined = (faqText + ' ' + howToText).toLowerCase();
  for (const typo of REQUIRED) {
    expect(combined, `missing "${typo}" in rendered schemas`).toContain(typo);
  }

  // HowTo description in particular must reference the misspelling cluster.
  const desc = String(howToJson.description ?? '').toLowerCase();
  for (const typo of REQUIRED) {
    expect(desc, `missing "${typo}" in HowTo.description`).toContain(typo);
  }
});
