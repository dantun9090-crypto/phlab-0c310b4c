import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config.
 *
 * Hardened for deterministic visual regression on /compound:
 *   - Locked viewport (1280x1800) + deviceScaleFactor=1
 *   - Reduced-motion forced via emulation
 *   - Animations / transitions / caret killed via stylesheet injection
 *     (see e2e/compound-visual.spec.ts)
 *   - System fonts only (no Google Fonts) — set in the visual spec by
 *     blocking fonts.googleapis + fonts.gstatic at the route level
 *
 * Other suites still use the same baseURL / extraHTTPHeaders.
 *
 * Required env vars to actually exercise live endpoints:
 *   TEST_BASE_URL              — defaults to the preview lovable URL
 *   WALLID_WEBHOOK_SECRET      — same secret configured on the server
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    // Visual regression baseline tolerance — see compound-visual.spec.ts.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL:
      process.env.TEST_BASE_URL ||
      "https://id-preview--1f12c255-a30a-4bea-bbab-28d9e6f70804.lovable.app",
    extraHTTPHeaders: { "user-agent": "phlabs-wallid-smoke/1.0" },
    viewport: { width: 1280, height: 1800 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "Europe/London",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 },
    },
  ],
});
