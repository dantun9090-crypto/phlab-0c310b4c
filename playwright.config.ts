import { defineConfig } from "@playwright/test";

/**
 * Smoke E2E config for Wallid payment flow.
 *
 * These tests target a live deployment (preview or production) — they
 * exercise the real webhook + sync endpoints rather than a local dev server.
 *
 * Required env vars to actually run anything meaningful:
 *   TEST_BASE_URL              — defaults to the preview lovable URL
 *   WALLID_WEBHOOK_SECRET      — same secret configured on the server, used
 *                                to sign synthetic webhook requests
 *
 * Optional (only for test 3 — manual sync):
 *   TEST_STUCK_ORDER_ID        — Firestore order id seeded to pending_payment
 *   ADMIN_BEARER_TOKEN         — Firebase ID token of an admin user
 *
 * Tests that lack their required env vars `test.skip()` themselves — running
 * `bunx playwright test` with no vars should report all 3 as skipped, not fail.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL:
      process.env.TEST_BASE_URL ||
      "https://id-preview--1f12c255-a30a-4bea-bbab-28d9e6f70804.lovable.app",
    extraHTTPHeaders: { "user-agent": "phlabs-wallid-smoke/1.0" },
  },
});
