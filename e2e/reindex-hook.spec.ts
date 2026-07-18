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
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const ENDPOINT = `${BASE}/api/public/hooks/reindex`;
const TOKEN = process.env.PRERENDER_TOKEN;

const SAMPLE_URLS = ['/compound'];

// Capture trace+video for every test in this file so a CI failure ships
// reindex JSON, network log, and screenshot artifacts.
test.use({ trace: 'retain-on-failure', video: 'retain-on-failure' });

function attachJsonOnFailure(testInfo: import('@playwright/test').TestInfo, name: string, payload: unknown) {
  try {
    const dir = testInfo.outputDir;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.json`);
    writeFileSync(file, JSON.stringify(payload, null, 2));
    testInfo.attachments.push({ name: `${name}.json`, path: file, contentType: 'application/json' });
  } catch {
    /* ignore artifact write errors */
  }
}

test.describe('reindex hook contract', () => {
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      // Mark for CI artifact upload — see .github/workflows/reindex-hook.yml
      testInfo.annotations.push({ type: 'artifact', description: 'reindex hook failure bundle attached' });
    }
  });

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

  test('returns IndexNow + GSC inspector deep-links when authenticated', async ({ request }, testInfo) => {
    test.skip(!TOKEN, 'PRERENDER_TOKEN not available to test runner');

    const res = await request.post(ENDPOINT, {
      headers: { 'x-recache-secret': TOKEN! },
      data: { urls: SAMPLE_URLS },
      failOnStatusCode: false,
    });

    const status = res.status();
    let json: Record<string, unknown> = {};
    try { json = await res.json(); } catch { /* non-json body */ }
    // Always attach for forensic value; CI uploads the run's output dir.
    attachJsonOnFailure(testInfo, `reindex-response-${status}`, { status, body: json });

    // 429 cooldown is acceptable if a previous test pulse fired within 30s.
    if (status === 429) {
      expect(json.error).toBe('cooldown');
      testInfo.annotations.push({ type: 'note', description: 'cooldown hit — contract not exercised' });
      return;
    }

    expect(status).toBe(200);

    // Shape assertions — these are the contract the admin UI depends on.
    const submitted = json.submittedUrls as unknown;
    expect(Array.isArray(submitted)).toBe(true);
    expect((submitted as string[]).length).toBe(SAMPLE_URLS.length);
    for (const u of submitted as string[]) {
      expect(u).toMatch(/^https:\/\/phlabs\.co\.uk\//);
    }

    const indexNow = json.indexNow as Record<string, unknown> | undefined;
    expect(indexNow).toBeDefined();
    expect(typeof indexNow!.status).toBe('number');
    expect(typeof indexNow!.submitted).toBe('number');

    const prerender = json.prerender as { desktop?: Record<string, unknown>; mobile?: Record<string, unknown> } | undefined;
    expect(prerender?.desktop).toBeDefined();
    expect(prerender?.mobile).toBeDefined();
    expect(typeof prerender!.desktop!.status).toBe('number');
    expect(typeof prerender!.mobile!.status).toBe('number');

    const links = json.gscInspectorLinks as Array<{ url: string; inspector: string }>;
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBe(SAMPLE_URLS.length);
    for (const link of links) {
      expect(link.url).toMatch(/^https:\/\/phlabs\.co\.uk\//);
      expect(link.inspector).toMatch(
        /^https:\/\/search\.google\.com\/search-console\/inspect\?resource_id=sc-domain%3Aphlabs\.co\.uk&id=https/,
      );
    }
  });

  test('rejects invalid payload with structured 400', async ({ request }, testInfo) => {
    test.skip(!TOKEN, 'PRERENDER_TOKEN not available to test runner');
    const res = await request.post(ENDPOINT, {
      headers: { 'x-recache-secret': TOKEN! },
      data: { urls: ['https://evil.example.com/x', ''] },
      failOnStatusCode: false,
    });
    const json = await res.json();
    attachJsonOnFailure(testInfo, 'reindex-invalid-payload', { status: res.status(), body: json });
    // Either 400 (validated) or 429 (cooldown raced); both are valid.
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      expect(json.ok).toBe(false);
      expect(json.error).toBe('invalid_payload');
      expect(Array.isArray(json.issues)).toBe(true);
      expect(json.issues.length).toBeGreaterThan(0);
    }
  });
});
