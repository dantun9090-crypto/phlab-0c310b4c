/**
 * Regression guard for the blank watchdog.
 *
 * A slow customer device/network can leave the root shell empty for a few
 * seconds while scripts initialise. The watchdog must NOT force navigation in
 * that state; forced `location.replace()` was the source of the cache/reload
 * loop that blocked customers from entering the store.
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

test("blank watchdog shows manual fallback only and does not auto-reload", async ({ page }) => {
  let documentNavigations = 0;
  page.on("request", (req) => {
    if (req.isNavigationRequest() && req.resourceType() === "document") documentNavigations += 1;
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __phlBlankWatchdog?: { forceFallback?: () => void } }).__phlBlankWatchdog?.forceFallback),
  );

  await page.evaluate(() => {
    document.body.innerHTML = "";
    try {
      delete (window as unknown as { __PHL_REACT_READY__?: boolean }).__PHL_REACT_READY__;
    } catch {
      (window as unknown as { __PHL_REACT_READY__?: boolean }).__PHL_REACT_READY__ = false;
    }
    const watchdog = (window as unknown as { __phlBlankWatchdog?: { forceFallback?: () => void } }).__phlBlankWatchdog;
    watchdog?.forceFallback?.();
  });

  await expect(page.getByText(/Taking longer than usual/i)).toBeVisible();
  await page.waitForTimeout(3_500);

  expect(documentNavigations, "watchdog must not auto-navigate/reload").toBe(1);
  expect(new URL(page.url()).searchParams.has("__fresh"), "watchdog must not add recovery query params").toBe(false);
});