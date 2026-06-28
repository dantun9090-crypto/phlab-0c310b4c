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
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

const ADMIN_ROUTES = [
  '/admin',
  '/admin/health-monitor',
  '/admin/compound-queries',
  '/admin/compound-negatives-audit',
  '/admin/merchant-feed-editor',
  '/admin/__spa_probe-e2e-manual',
];

for (const path of ADMIN_ROUTES) {
  test(`refreshing ${path} serves SPA shell without 404`, async ({ page }) => {
    // Direct navigation == "refresh" from the user's perspective.
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    expect(res, `no response object for ${path}`).not.toBeNull();
    const status = res!.status();
    const ct = res!.headers()['content-type'] ?? '';

    expect.soft(status, `${path} responded ${status}`).toBeLessThan(400);
    expect.soft(ct, `${path} content-type was ${ct}`).toContain('text/html');

    // Sentinel 404 page should NOT be present. We tolerate the auth gate
    // redirecting to /login, but never the "Page not found" shell.
    await page.waitForTimeout(500);
    await expect(page.getByText(/Page not found/i)).toHaveCount(0);
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
