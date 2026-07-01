/**
 * E2E — stale-asset auto-recovery.
 *
 * Simulates an old build whose lazy JS chunk no longer exists (the classic
 * "user's tab was open across a deploy" case) and verifies that the site:
 *   1) does NOT get stuck on a blank screen or the old "cache reset needed"
 *      manual-click overlay,
 *   2) shows the short recovery toast (or the auto-recovery screen served
 *      by src/server.ts.missingBuildAssetRecoveryResponse),
 *   3) automatically reloads and eventually renders the real home page.
 *
 * Target: BASE_URL env (defaults to http://localhost:8080 for dev; CI can
 * point at the live preview or production).
 */
import { test, expect, type Route } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:8080";

test("missing lazy chunk triggers automatic recovery (no manual click)", async ({ page }) => {
  // Fail the FIRST /assets/*.js request only, then let subsequent requests
  // pass so the recovery reload can succeed.
  let failed = false;
  await page.route(/\/assets\/[^?#]+\.(?:js|mjs)(?:\?|#|$)/, (route: Route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 404, contentType: "text/plain", body: "gone" });
    }
    return route.continue();
  });

  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err.message)));

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Recovery may either (a) reload the page and render the real content, or
  // (b) show the inline recovery card served by the server. Either is
  // acceptable — what we must NOT see is a permanent blank body.
  await page.waitForFunction(
    () => {
      const t = (document.body?.innerText || "").trim();
      return t.length > 30;
    },
    null,
    { timeout: 25_000 },
  );

  const body = (await page.locator("body").innerText()).toLowerCase();
  const recovered =
    /ph labs is refreshing|loading the newest version|open ph labs|research peptides|phlabs/.test(body);
  expect(recovered, `body after recovery must contain visible content, got: ${body.slice(0, 200)}`).toBe(true);

  // Manual-click "cache reset needed" wording must NEVER surface again.
  expect(body).not.toContain("cache reset needed");
});
