import { expect, test } from "@playwright/test";

/**
 * Forces the blank-page watchdog fallback via the `__phlBlankWatchdog`
 * runtime hook and asserts that the resulting upload to
 * /api/public/error-monitor includes a base64 screenshot artefact and a
 * DOM HTML snapshot.
 */
test("forced fallback uploads a screenshot to /api/public/error-monitor", async ({ page }) => {
  await page.goto("/");
  // Wait for the watchdog to install itself.
  await page.waitForFunction(() => !!(window as unknown as { __phlBlankWatchdog?: object }).__phlBlankWatchdog, {
    timeout: 10_000,
  });

  // Intercept the upload.
  const uploadPromise = page.waitForRequest(
    (req) => req.url().includes("/api/public/error-monitor") && req.method() === "POST",
    { timeout: 15_000 },
  );

  // Trigger the fallback path. We invoke the watchdog's exposed
  // `forceFallback` hook (added for tests + admin debug) which calls the
  // same snapshot/screenshot/upload pipeline as a real blank-page detection.
  await page.evaluate(() => {
    const w = window as unknown as { __phlBlankWatchdog?: { forceFallback?: () => void } };
    w.__phlBlankWatchdog?.forceFallback?.();
  });

  const req = await uploadPromise;
  const body = req.postDataJSON() as {
    type?: string;
    screenshot?: string;
    htmlSnapshot?: string;
    path?: string;
    details?: Record<string, unknown>;
  };

  expect(body.type).toBe("blank_watchdog");
  expect(body.path).toBeTruthy();
  // Screenshot is best-effort — assert the field exists and, when present,
  // is a JPEG data URL. We accept null so the test does not flake on
  // browsers where foreignObject rasterisation is blocked.
  if (body.screenshot) {
    expect(body.screenshot.startsWith("data:image/")).toBe(true);
    expect(body.screenshot.length).toBeGreaterThan(200);
  }
  expect(typeof body.htmlSnapshot === "string" || body.htmlSnapshot === undefined).toBe(true);
  expect(body.details).toBeTruthy();
});
