// @vitest-environment node
/**
 * Schema validation for the Retatrutide product page.
 *
 * The FAQ + HowTo JSON-LD blobs are injected client-side from
 * `src/lib/product-seo-overrides.ts` and `src/pages/ProductDetail/index.tsx`.
 * Both sources MUST mention the four primary misspellings we target so the
 * schema indexes against typo queries.
 *
 * This test re-parses the strings statically (no DOM) so it can run in CI
 * without spinning up the app, and complements the Playwright runtime check
 * in `e2e/retatrutide-schema.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRODUCT_SEO_OVERRIDES } from '@/lib/product-seo-overrides';

const REQUIRED_MISSPELLINGS = ['retatrtide', 'retatrutife', 'retatrutidw', 'retatide'];

describe('retatrutide FAQ schema (overrides)', () => {
  const entry = PRODUCT_SEO_OVERRIDES['retatrutide-research-peptide'];

  it('exists with FAQ entries', () => {
    expect(entry).toBeDefined();
    expect(Array.isArray(entry.faqs)).toBe(true);
    expect((entry.faqs ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('FAQ payload mentions every targeted misspelling', () => {
    const blob = JSON.stringify(entry.faqs ?? []).toLowerCase();
    for (const typo of REQUIRED_MISSPELLINGS) {
      expect(blob, `missing "${typo}" in FAQ payload`).toContain(typo);
    }
  });

  it('misspellings list covers the primary typo cluster', () => {
    const blob = JSON.stringify(entry.misspellings ?? []).toLowerCase();
    for (const typo of REQUIRED_MISSPELLINGS) {
      expect(blob, `missing "${typo}" in misspellings`).toContain(typo);
    }
  });
});

describe('retatrutide HowTo schema (ProductDetail)', () => {
  // Read the source file once and assert the inline JSON-LD object literal
  // contains the misspelling cluster in its description string.
  const src = readFileSync(
    resolve(process.cwd(), 'src/pages/ProductDetail/index.tsx'),
    'utf8',
  );

  it('declares a HowTo block gated to the retatrutide slug', () => {
    expect(src).toMatch(/product\.slug === 'retatrutide-research-peptide'/);
    expect(src).toMatch(/'@type': 'HowTo'/);
    expect(src).toMatch(/id = 'howto-schema'/);
  });

  it('HowTo description mentions every targeted misspelling', () => {
    // Pull the description string out of the source so the test still passes
    // if surrounding code is reorganised.
    const m = src.match(/'@type': 'HowTo'[\s\S]+?description:\s*'([^']+)'/);
    expect(m, 'HowTo description literal not found').not.toBeNull();
    const description = (m![1] ?? '').toLowerCase();
    for (const typo of REQUIRED_MISSPELLINGS) {
      expect(description, `missing "${typo}" in HowTo description`).toContain(typo);
    }
  });
});
