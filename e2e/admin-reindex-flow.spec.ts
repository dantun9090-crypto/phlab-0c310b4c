/**
 * E2E: sign in as admin, open the Fast Reindex tab, click Trigger,
 * assert that an IndexNow status + at least one GSC URL Inspector
 * deep-link render with no console / network errors.
 *
 * Skipped unless ADMIN_EMAIL + ADMIN_PASSWORD are exposed to the
 * runner (Firebase Auth — the project does not use Supabase auth, so
 * the managed Lovable browser session helper does not apply).
 */
import { test, expect, type ConsoleMessage, type Request } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

test.use({ trace: 'retain-on-failure', video: 'retain-on-failure', screenshot: 'only-on-failure' });

test('admin Fast Reindex returns IndexNow + GSC links without errors', async ({ page }, testInfo) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'ADMIN_EMAIL / ADMIN_PASSWORD not provided to runner');

  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore well-known noise from CSP reports + third-party pixels.
      if (/csp-report|gtag|googletagmanager|clarity|recaptcha/i.test(text)) return;
      consoleErrors.push(text);
    }
  });
  page.on('requestfailed', (req: Request) => {
    const url = req.url();
    if (/gtag|googletagmanager|google-analytics|clarity|doubleclick|prerender/i.test(url)) return;
    failedRequests.push(`${req.method()} ${url} :: ${req.failure()?.errorText ?? '?'}`);
  });

  // 1. Sign in.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email/i }).fill(ADMIN_EMAIL!);
  await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD!);
  await page.getByRole('button', { name: /sign in|log ?in/i }).click();
  await page.waitForURL(/\/(account|admin|$)/, { timeout: 15_000 });

  // 2. Open the Fast Reindex tab. The admin SPA uses a hash/query param
  //    `?tab=reindexhook` registered in src/pages/Admin/index.tsx.
  await page.goto(`${BASE}/admin?tab=reindexhook`, { waitUntil: 'domcontentloaded' });
  const trigger = page.getByTestId('reindex-trigger');
  await expect(trigger).toBeVisible({ timeout: 15_000 });

  // 3. Click Trigger and wait for the server response.
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/_serverFn/') && res.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await trigger.click();
  const res = await responsePromise;
  expect([200, 429]).toContain(res.status());

  if (res.status() === 200) {
    // 4. Result block + at least one GSC inspector link.
    const result = page.getByTestId('reindex-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    const list = page.getByTestId('gsc-inspector-list');
    await expect(list).toBeVisible();
    const links = list.locator('a[href*="search.google.com/search-console/inspect"]');
    expect(await links.count()).toBeGreaterThan(0);
    await expect(result).toContainText(/IndexNow/i);
  }

  // 5. No unrelated console / network errors during the flow.
  if (consoleErrors.length || failedRequests.length) {
    await testInfo.attach('console-errors.json', {
      body: JSON.stringify({ consoleErrors, failedRequests }, null, 2),
      contentType: 'application/json',
    });
  }
  expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  expect(failedRequests, `unexpected request failures:\n${failedRequests.join('\n')}`).toEqual([]);
});
