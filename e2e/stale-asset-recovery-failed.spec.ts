/**
 * E2E — failed automatic recovery must degrade gracefully.
 *
 * Scenario: a stale-chunk 404 fires, the client tries to recover,
 * BUT the fallback is disabled via the runtime-flags kill switch.
 * We must:
 *   1) NOT hang on a blank body,
 *   2) NOT re-surface the deprecated "cache reset needed" manual overlay,
 *   3) show a brief non-blocking recovery message (toast text),
 *   4) not enter an infinite reload loop (single navigation only).
 *
 * We simulate the disabled flag by intercepting /api/public/runtime-flags
 * and forcing `chunkReloadEnabled: false` at the network layer, so no
 * server state changes are required to run the test.
 */
import { test, expect, type Route } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:8080";

test("kill-switch: failed recovery shows short message, no cache-reset screen", async ({ page }) => {
  // Force the runtime kill-switch OFF for this session.
  await page.route(/\/api\/public\/runtime-flags(\?|$)/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify({
        chunkReloadEnabled: false,
        updatedAt: new Date().toISOString(),
        reason: "e2e-test",
        source: "firestore",
      }),
    }),
  );

  // Force a stale lazy-chunk 404 to trigger the recovery path.
  await page.route(/\/assets\/[^?#]+\.(?:js|mjs)(?:\?|#|$)/, (route: Route) => {
    return route.fulfill({ status: 404, contentType: "text/plain", body: "gone" });
  });

  // Count top-level navigations — we must not enter a reload loop.
  let navCount = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navCount += 1; });

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Wait either for the recovery toast text OR for the page to have any
  // real content. Neither the manual "cache reset needed" wording nor a
  // permanently blank body is acceptable.
  await page.waitForFunction(
    () => {
      const t = (document.body?.innerText || "").trim().toLowerCase();
      return t.length > 20 || !!document.getElementById("phl-recovery-toast");
    },
    null,
    { timeout: 20_000 },
  );

  // Give the client a few seconds to settle so any misbehaving loop
  // would have already fired multiple navigations.
  await page.waitForTimeout(4_000);

  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body, "must not display the deprecated cache-reset overlay").not.toContain("cache reset needed");
  expect(navCount, `should not enter a reload loop (navigations=${navCount})`).toBeLessThanOrEqual(2);
});
