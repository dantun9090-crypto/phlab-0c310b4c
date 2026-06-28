/**
 * E2E: POST /api/public/hooks/reindex with malformed URL lists.
 *
 * Asserts the endpoint returns a structured 400 JSON envelope
 *   { ok: false, error: 'invalid_payload', issues: [{ path, message, code }, ...] }
 * for each shape of bad input (off-host URL, empty string, non-http scheme,
 * over-cap list, extra top-level key). 429 cooldown is tolerated because
 * tests may race within the 30s per-isolate window.
 */
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const ENDPOINT = `${BASE}/api/public/hooks/reindex`;
const TOKEN = process.env.PRERENDER_TOKEN;

test.use({ trace: 'retain-on-failure', video: 'retain-on-failure' });

function attach(testInfo: import('@playwright/test').TestInfo, name: string, payload: unknown) {
  try {
    const dir = testInfo.outputDir;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.json`);
    writeFileSync(file, JSON.stringify(payload, null, 2));
    testInfo.attachments.push({ name: `${name}.json`, path: file, contentType: 'application/json' });
  } catch { /* ignore */ }
}

async function postBad(request: import('@playwright/test').APIRequestContext, data: unknown) {
  return request.post(ENDPOINT, {
    headers: { 'x-recache-secret': TOKEN! },
    data: data as Record<string, unknown>,
    failOnStatusCode: false,
  });
}

function expectStructured400(json: any) {
  expect(json.ok).toBe(false);
  expect(json.error).toBe('invalid_payload');
  expect(Array.isArray(json.issues)).toBe(true);
  expect(json.issues.length).toBeGreaterThan(0);
  for (const issue of json.issues) {
    expect(typeof issue.path).toBe('string');
    expect(typeof issue.message).toBe('string');
    expect(typeof issue.code).toBe('string');
  }
}

test.describe('reindex hook — invalid payloads return structured 400', () => {
  test.skip(!TOKEN, 'PRERENDER_TOKEN not available to test runner');

  test('rejects off-host URL with structured Zod issues', async ({ request }, testInfo) => {
    const res = await postBad(request, { urls: ['https://evil.example.com/x'] });
    const json = await res.json().catch(() => ({}));
    attach(testInfo, 'off-host', { status: res.status(), body: json });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) expectStructured400(json);
  });

  test('rejects empty string in urls[]', async ({ request }, testInfo) => {
    const res = await postBad(request, { urls: [''] });
    const json = await res.json().catch(() => ({}));
    attach(testInfo, 'empty-string', { status: res.status(), body: json });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) expectStructured400(json);
  });

  test('rejects non-http(s) scheme', async ({ request }, testInfo) => {
    const res = await postBad(request, { urls: ['javascript:alert(1)'] });
    const json = await res.json().catch(() => ({}));
    attach(testInfo, 'bad-scheme', { status: res.status(), body: json });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) expectStructured400(json);
  });

  test('rejects over-cap (>200) URL list', async ({ request }, testInfo) => {
    const urls = Array.from({ length: 201 }, (_, i) => `/p/${i}`);
    const res = await postBad(request, { urls });
    const json = await res.json().catch(() => ({}));
    attach(testInfo, 'over-cap', { status: res.status(), body: json });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) expectStructured400(json);
  });

  test('rejects unknown top-level keys (strict schema)', async ({ request }, testInfo) => {
    const res = await postBad(request, { urls: ['/compound'], extraField: 'nope' });
    const json = await res.json().catch(() => ({}));
    attach(testInfo, 'extra-key', { status: res.status(), body: json });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) expectStructured400(json);
  });

  test('rejects malformed JSON body', async ({ request }, testInfo) => {
    const res = await request.post(ENDPOINT, {
      headers: { 'x-recache-secret': TOKEN!, 'content-type': 'application/json' },
      data: '{not-json',
      failOnStatusCode: false,
    });
    const json = await res.json().catch(() => ({}));
    attach(testInfo, 'bad-json', { status: res.status(), body: json });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      expect(json.ok).toBe(false);
      expect(json.error).toBe('invalid_json');
    }
  });
});
