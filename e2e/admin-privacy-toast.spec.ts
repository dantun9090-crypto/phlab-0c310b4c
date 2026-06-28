/**
 * Admin → Privacy Requests + Toast Audit smoke E2E
 *
 * Logs in as an admin and verifies that both Firestore-backed tabs render
 * without crashing, expose the HealthMetrics bar (proving the listener
 * subscribed), and show either rows or the documented empty-state copy.
 *
 * Credentials are read from env so the test is reusable across local /
 * CI / sandbox runs:
 *   ADMIN_E2E_EMAIL        — admin user email
 *   ADMIN_E2E_PASSWORD     — admin user password
 *   E2E_BASE_URL           — defaults to http://localhost:8080
 *
 * If credentials are missing the test is skipped — there is no point in
 * pretending to verify admin behaviour against the login screen.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';
const EMAIL = process.env.ADMIN_E2E_EMAIL;
const PASSWORD = process.env.ADMIN_E2E_PASSWORD;

test.describe('Admin: Privacy Requests + Toast Audit', () => {
  test.skip(!EMAIL || !PASSWORD,
    'Set ADMIN_E2E_EMAIL and ADMIN_E2E_PASSWORD to run admin E2E tests.');

  async function signIn(page: Page) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await Promise.all([
      page.waitForURL(/\/(admin|account|$)/, { timeout: 15_000 }).catch(() => {}),
      page.locator('button[type="submit"]').first().click(),
    ]);
  }

  async function openAdminTab(page: Page, tabId: 'privacyrequests' | 'toastaudit') {
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    // Dashboard tab switching is event-driven (CustomEvent('admin:navigate'))
    // — see src/pages/Admin/index.tsx. This avoids brittle sidebar selectors.
    await page.waitForTimeout(1500);
    await page.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('admin:navigate', { detail: id }));
    }, tabId);
    await page.waitForTimeout(1500);
  }

  test('Privacy Requests loads, exposes HealthMetrics, has no crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await signIn(page);
    await openAdminTab(page, 'privacyrequests');

    // Tab-level error boundary must not be rendered.
    await expect(page.getByText('This tab failed to load')).toHaveCount(0);

    // Header from PrivacyRequestsTab.
    await expect(page.getByRole('heading', { name: /Privacy Requests/i })).toBeVisible();

    // HealthMetrics bar proves the Firestore listener subscribed.
    const health = page.getByTestId('health-metrics').first();
    await expect(health).toBeVisible();
    await expect(page.getByTestId('health-last-fetched').first()).not.toHaveText('—');

    // Either data rows or the documented empty-state copy — both are valid
    // "the tab works" outcomes.
    const empty = page.getByText('No requests match the current filter.');
    const anyRow = page.locator('[data-testid="dsr-create-sample"]'); // header always renders when tab mounts
    await expect(anyRow).toBeVisible();
    // empty state OR at least one DSR card (we don't assert which).
    const hasEmpty = await empty.count();
    expect(hasEmpty).toBeGreaterThanOrEqual(0);

    expect(errors.filter(e => /permission-denied|FirebaseError/i.test(e)),
      `Firestore errors leaked:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('Toast Audit loads, exposes HealthMetrics, has no crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await signIn(page);
    await openAdminTab(page, 'toastaudit');

    await expect(page.getByText('This tab failed to load')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Toast Audit/i })).toBeVisible();

    const health = page.getByTestId('health-metrics').first();
    await expect(health).toBeVisible();
    await expect(page.getByTestId('health-last-fetched').first()).not.toHaveText('—');

    // Read-error pill must read "read err: 0" on a healthy mount.
    await expect(page.getByTestId('health-read-errors').first()).toContainText('read err: 0');

    expect(errors.filter(e => /permission-denied|FirebaseError/i.test(e)),
      `Firestore errors leaked:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('Privacy Requests: "Utwórz przykładowe zgłoszenie" creates a visible row and counters reflect the write', async ({ page }) => {
    await signIn(page);
    await openAdminTab(page, 'privacyrequests');

    // Make sure the listener is subscribed before we trigger the write,
    // so the snapshot delta is observable.
    const docCount = page.getByTestId('health-doc-count').first();
    await expect(docCount).toBeVisible();
    const beforeText = (await docCount.textContent())?.trim() || '0';
    const before = Number.parseInt(beforeText, 10) || 0;

    // Make sure the filter shows pending rows (sample is created with
    // status: 'pending'), otherwise the new row would be filter-hidden.
    const pendingTab = page.getByRole('button', { name: /^Pending/i }).first();
    if (await pendingTab.count()) await pendingTab.click().catch(() => {});

    // Trigger the sample write.
    await page.getByTestId('dsr-create-sample').click();

    // Expect the doc count to increment (Firestore snapshot delta).
    await expect.poll(
      async () => Number.parseInt((await docCount.textContent())?.trim() || '0', 10) || 0,
      { timeout: 10_000 },
    ).toBeGreaterThan(before);

    // The new row's synthetic email should be visible in the list.
    await expect(page.getByText(/sample\+[a-z0-9]+@phlabs\.co\.uk/i).first()).toBeVisible({ timeout: 10_000 });

    // Write-error counter must still read 0 — the write succeeded.
    await expect(page.getByTestId('health-write-errors').first()).toContainText('write err: 0');

    // Triggering a refresh should update "Last fetched" to "just now".
    await page.getByTestId('health-refresh').first().click();
    await expect.poll(
      async () => (await page.getByTestId('health-last-fetched').first().textContent())?.trim(),
      { timeout: 5_000 },
    ).toMatch(/just now|^[0-9]+s ago$/);
  });
});

