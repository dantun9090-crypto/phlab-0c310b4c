/**
 * Regression: URLs carrying tracking / cache-buster query params
 * (?gclid=, ?utm_*, __cache_check) must reach window.prerenderReady === true
 * quickly. Before the 2026-07-18 fix, any unknown query param triggered a
 * ~15s blank page because the root inline watchdog waited 15s and the
 * pending hold from markPrerenderPending() had no auto-release.
 *
 * Contract:
 *  - prerenderReady flips true within 4s of navigationStart for every URL.
 *  - Query-param variants land in the same budget as the clean URL.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';

const CASES = [
  { name: '/compound ?gclid=', url: '/compound?gclid=test123' },
  { name: '/products ?utm_source=x', url: '/products?utm_source=x&utm_medium=cpc' },
  { name: '/ ?__cache_check=', url: '/?__cache_check=42' },
];

for (const c of CASES) {
  test(`prerenderReady flips within 4s for ${c.name}`, async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE + c.url, { waitUntil: 'domcontentloaded' });
    // Wait for the app-level flip. Hard-fail at 4500ms — the safety net
    // is 4000ms; anything above that is a regression.
    await page.waitForFunction(
      () => (window as unknown as { prerenderReady?: boolean }).prerenderReady === true,
      undefined,
      { timeout: 4500 },
    );
    const elapsed = Date.now() - start;
    // Log for the before/after report.
    // eslint-disable-next-line no-console
    console.log(`[prerender-ready] ${c.name} → ${elapsed}ms`);
    expect(elapsed).toBeLessThan(4500);
  });
}
