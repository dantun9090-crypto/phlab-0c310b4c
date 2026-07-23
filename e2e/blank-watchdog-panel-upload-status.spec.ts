/**
 * Verifies the BlankWatchdogDiagnosticsPanel exposes the last upload method
 * (sendBeacon vs fetch fallback) and the retry/attempt count after the
 * watchdog captures a large DOM snapshot.
 *
 * Uses the `/e2e/watchdog-panel` harness which renders the panel with an
 * intentionally bulky DOM so the htmlSnapshot exceeds the 32KB cap.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

test("panel shows last upload method + attempts after a forced large-DOM snapshot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.goto(`${BASE}/e2e/watchdog-panel`, { waitUntil: "domcontentloaded" });

  // Wait for the real watchdog (installed by __root.tsx) to expose its hook.
  await page.waitForFunction(
    () => !!(window as unknown as { __phlBlankWatchdog?: { forceFallback?: () => void } }).__phlBlankWatchdog?.forceFallback,
    { timeout: 10_000 },
  );

  const uploadPromise = page.waitForRequest(
    (req) => req.url().includes("/api/public/error-monitor") && req.method() === "POST",
    { timeout: 15_000 },
  );

  await page.evaluate(() => {
    const w = window as unknown as { __phlBlankWatchdog?: { forceFallback?: () => void } };
    w.__phlBlankWatchdog?.forceFallback?.();
  });
  await uploadPromise;

  // The panel polls window.__phlBlankWatchdog every 2s — give it a tick.
  const method = page.getByTestId("upload-method");
  const attempts = page.getByTestId("upload-attempts");
  await expect(method).toBeVisible({ timeout: 8_000 });

  // Wait until the panel has refreshed past its initial empty state.
  await expect
    .poll(async () => (await method.textContent()) || "", { timeout: 8_000 })
    .toMatch(/sendBeacon|fetch/);

  const methodText = (await method.textContent()) || "";
  expect(methodText).toMatch(/sendBeacon|fetch/);

  // attempts must be a positive integer (beacon=1, or 1..3 for fetch retries).
  const attemptsText = ((await attempts.textContent()) || "").trim();
  const n = Number(attemptsText);
  expect(Number.isFinite(n)).toBe(true);
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(3);

  // With ~800 filler paragraphs the htmlSnapshot must have been truncated;
  // surface that via the dedicated indicator.
  const trunc = page.getByTestId("upload-html-truncated");
  await expect(trunc).toBeVisible();
  expect(((await trunc.textContent()) || "").toLowerCase()).toContain("yes");
});
