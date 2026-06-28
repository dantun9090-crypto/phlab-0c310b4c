/**
 * E2E: POST /api/public/hooks/reindex
 *
 * Asserts:
 *   1. Without the shared secret header, the endpoint rejects with 401.
 *   2. With the secret + a sample URL list, the response includes
 *      `submittedUrls`, `indexNow`, `prerender.desktop`, `prerender.mobile`,
 *      and `gscInspectorLinks[].inspector` pointing at the GSC URL Inspector.
 *      The authenticated leg is skipped when PRERENDER_TOKEN is not exposed
 *      to the test runner (typical for outside-CI dev sandboxes); the
 *      unauthenticated leg always runs so the contract stays guarded.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const ENDPOINT = `${BASE}/api/public/hooks/reindex`;
const TOKEN = process.env.PRERENDER_TOKEN;

const SAMPLE_URLS = ['/compound', '/peptide-calculator'];

test.describe('reindex hook contract', () => {
  test('rejects without x-recache-secret', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: { urls: SAMPLE_URLS },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(String(json.error)).toMatch(/unauthorized/i);
  });

  test('returns IndexNow + GSC inspector deep-links when authenticated', async ({ request }) => {
    test.skip(!TOKEN, 'PRERENDER_TOKEN not available to test runner');

    const res = await request.post(ENDPOINT, {
      headers: { 'x-recache-secret': TOKEN! },
      data: { urls: SAMPLE_URLS },
      failOnStatusCode: false,
    });

    // 429 cooldown is acceptable if a previous test pulse fired within 30s.
    if (res.status() === 429) {
      const j = await res.json();
      expect(j.error).toBe('cooldown');
      test.info().annotations.push({ type: 'note', description: 'cooldown hit — contract not exercised' });
      return;
    }

    expect(res.status()).toBe(200);
    const json = await res.json();

    // Shape assertions — these are the contract the admin UI depends on.
    expect(Array.isArray(json.submittedUrls)).toBe(true);
    expect(json.submittedUrls.length).toBe(SAMPLE_URLS.length);
    for (const u of json.submittedUrls) {
      expect(u).toMatch(/^https:\/\/phlabs\.co\.uk\//);
    }

    expect(json.indexNow).toBeDefined();
    expect(typeof json.indexNow.status).toBe('number');
    expect(typeof json.indexNow.submitted).toBe('number');

    expect(json.prerender?.desktop).toBeDefined();
    expect(json.prerender?.mobile).toBeDefined();
    expect(typeof json.prerender.desktop.status).toBe('number');
    expect(typeof json.prerender.mobile.status).toBe('number');

    expect(Array.isArray(json.gscInspectorLinks)).toBe(true);
    expect(json.gscInspectorLinks.length).toBe(SAMPLE_URLS.length);
    for (const link of json.gscInspectorLinks) {
      expect(link.url).toMatch(/^https:\/\/phlabs\.co\.uk\//);
      expect(link.inspector).toMatch(
        /^https:\/\/search\.google\.com\/search-console\/inspect\?resource_id=sc-domain%3Aphlabs\.co\.uk&id=https/,
      );
    }
  });
});
