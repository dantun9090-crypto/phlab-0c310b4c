/**
 * Refresh-resilience guard for /admin/*.
 *
 * Historical bug: refreshing a deep admin subpath returned 404 because
 * the Worker SPA fallback regressed. `admin` is whitelisted in
 * src/lib/known-roots.ts so EVERY `/admin/...` URL — including subpaths
 * the router doesn't recognise — must serve the SPA shell (HTTP 200,
 * text/html) and AdminSpaFallbackBanner must stay green.
 *
 * This spec does NOT need an admin session: the gate may redirect to
 * /login, but the SPA shell still has to render and the banner probe
 * still runs against the original /admin/* URL.
 *
 * Failure capture: playwright.config.ts already sets
 *   trace:      'retain-on-failure'
 *   video:      'retain-on-failure'
 *   screenshot: 'only-on-failure'
 * so when an assertion below fails, the trace/video/screenshot land in
 * `playwright-report/` and `test-results/` automatically. CI uploads
 * that folder as an artifact.
 *
 * In addition to status/content-type, we now assert that:
 *   - No uncaught page errors fire during load.
 *   - No console.error messages fire during load (allowlist for known noisy
 *     third-party warnings that aren't admin regressions).
 *   - No /admin/* request returns >=500 or a hard network failure.
 */
import { test, expect, type ConsoleMessage, type Request, type Response } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

const ADMIN_ROUTES = [
  '/admin',
  '/admin/health-monitor',
  '/admin/compound-queries',
  '/admin/compound-negatives-audit',
  '/admin/merchant-feed-editor',
  '/admin/__spa_probe-e2e-manual',
];

// Known-noisy console messages we don't want to fail the refresh guard on.
// Keep this list short and document each entry.
const CONSOLE_ERROR_ALLOWLIST: RegExp[] = [
  /ResizeObserver loop/i,           // browser scheduling noise, not an admin bug
  /Failed to load resource.*favicon/i, // favicon 404 isn't a refresh regression
  /clarity\.ms/i,                   // 3rd-party analytics console noise
  /taboola/i,                       // 3rd-party pixel console noise
];

function isAllowedConsoleError(msg: ConsoleMessage): boolean {
  if (msg.type() !== 'error') return true;
  const text = msg.text();
  return CONSOLE_ERROR_ALLOWLIST.some((re) => re.test(text));
}

for (const path of ADMIN_ROUTES) {
  test(`refreshing ${path} serves SPA shell, no console/network errors`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isAllowedConsoleError(msg)) {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('requestfailed', (req: Request) => {
      // Ignore failed third-party beacons; only flag same-origin admin assets.
      const url = req.url();
      if (url.includes('/admin') || url.startsWith(BASE)) {
        failedRequests.push(`${req.method()} ${url} :: ${req.failure()?.errorText ?? 'unknown'}`);
      }
    });
    page.on('response', (res: Response) => {
      if (res.status() >= 500) {
        failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
      }
    });

    // Direct navigation == "refresh" from the user's perspective.
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    expect(res, `no response object for ${path}`).not.toBeNull();
    const status = res!.status();
    const ct = res!.headers()['content-type'] ?? '';

    expect.soft(status, `${path} responded ${status}`).toBeLessThan(400);
    expect.soft(ct, `${path} content-type was ${ct}`).toContain('text/html');

    // Sentinel 404 page should NOT be present. We tolerate the auth gate
    // redirecting to /login, but never the "Page not found" shell.
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Page not found/i)).toHaveCount(0);

    // Attach diagnostics to the run so the HTML report and any failure
    // artifact contain the full noise trail next to the trace/video.
    if (consoleErrors.length) {
      await testInfo.attach(`console-errors-${path.replace(/\W+/g, '_')}.txt`, {
        body: consoleErrors.join('\n'),
        contentType: 'text/plain',
      });
    }
    if (pageErrors.length) {
      await testInfo.attach(`page-errors-${path.replace(/\W+/g, '_')}.txt`, {
        body: pageErrors.join('\n'),
        contentType: 'text/plain',
      });
    }
    if (failedRequests.length) {
      await testInfo.attach(`failed-requests-${path.replace(/\W+/g, '_')}.txt`, {
        body: failedRequests.join('\n'),
        contentType: 'text/plain',
      });
    }

    expect.soft(consoleErrors, `console.error during ${path}:\n${consoleErrors.join('\n')}`).toEqual([]);
    expect.soft(pageErrors, `uncaught page error during ${path}:\n${pageErrors.join('\n')}`).toEqual([]);
    expect.soft(failedRequests, `failed/5xx requests during ${path}:\n${failedRequests.join('\n')}`).toEqual([]);
  });
}

test('AdminSpaFallbackBanner reports OK on /admin (green state)', async ({ page }) => {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  // The banner mounts inside the admin shell; if the gate redirects to
  // /login the banner won't render and there is nothing to assert. Only
  // fail when the banner explicitly reports a regression.
  await page.waitForTimeout(2000);
  const failBanner = page.getByTestId('admin-spa-fallback-banner-fail');
  await expect(failBanner, 'SPA fallback banner is reporting a regression').toHaveCount(0);
});
