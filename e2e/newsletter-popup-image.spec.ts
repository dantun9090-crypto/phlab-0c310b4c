/**
 * Regression guard for newsletter popup image performance.
 *
 * The popup image must:
 *  1. Appear (naturalWidth > 0) within TARGET_MS of the modal opening.
 *  2. Be small enough that it doesn't reintroduce the 2000×1142 / ~300 KB
 *     source that caused the "image loads slowly after popup opens" flash.
 *
 * We force-open the popup via `?newsletter=preview` (bypasses cooldown,
 * subscribed checks, and enabled flag — see NewsletterPopup readDebugFlags).
 *
 * NOTE: `?newsletter=preview` also cache-busts the image URL (adds `_cb`),
 * so this test measures cold fetch + decode — the worst case. Real users
 * benefit from the preloader warming the cache during the delay window,
 * so their perceived time is lower than what this test asserts.
 */
import { test, expect } from "@playwright/test";

// Cold fetch + decode budget. Firebase Storage TTFB is ~250-400 ms from
// UK/EU; the optimised popup image is ~12 KB, so total should stay well
// under 2 s even on a slow CI runner. Bumped above raw measurements to
// absorb CI network jitter without becoming a flaky test.
const TARGET_MS = 2_000;

// Hard ceiling on the popup image transfer size. The pre-optimisation
// source was ~306 KB; the resized WebP is ~12 KB. 80 KB gives room for
// a future higher-quality upload without regressing back to a full-res
// original by mistake.
const MAX_TRANSFER_BYTES = 80 * 1024;

test.describe("Newsletter popup image performance", () => {
  test(`popup image becomes visible within ${TARGET_MS}ms of modal opening`, async ({ page }) => {
    // Force-open the popup regardless of cooldown / subscribed state.
    const response = await page.goto("/?newsletter=preview", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok(), `homepage must return 2xx, got ${response?.status()}`).toBeTruthy();

    // Wait for the modal shell to mount. Selector matches NewsletterPopup's
    // dialog: role="dialog" aria-labelledby="newsletter-popup-title".
    const dialog = page.locator('[role="dialog"][aria-labelledby="newsletter-popup-title"]');
    await expect(dialog, "newsletter popup must open in debug mode").toBeVisible({
      timeout: 10_000,
    });
    const modalOpenedAt = Date.now();

    // The popup only renders an <img> when config.imageUrl is set. If
    // the admin has cleared it, skip the perf assertions rather than
    // fail — there's nothing to measure.
    const img = dialog.locator("img").first();
    const hasImage = (await img.count()) > 0;
    test.skip(!hasImage, "popup has no image configured — nothing to measure");

    // Poll until the image reports naturalWidth > 0 (decoded + painted).
    const deadline = modalOpenedAt + TARGET_MS + 500;
    let visibleAt = 0;
    let lastState: { complete: boolean; nw: number } = { complete: false, nw: 0 };
    while (Date.now() < deadline) {
      lastState = await img.evaluate((el: HTMLImageElement) => ({
        complete: el.complete,
        nw: el.naturalWidth,
      }));
      if (lastState.complete && lastState.nw > 0) {
        visibleAt = Date.now();
        break;
      }
      await page.waitForTimeout(50);
    }

    expect(
      visibleAt > 0,
      `popup image never became visible within ${TARGET_MS}ms (state=${JSON.stringify(lastState)})`,
    ).toBeTruthy();

    const elapsed = visibleAt - modalOpenedAt;
    expect(
      elapsed,
      `popup image took ${elapsed}ms to become visible (budget ${TARGET_MS}ms)`,
    ).toBeLessThanOrEqual(TARGET_MS);

    // Guard against a large source image sneaking back in. transferSize
    // may be 0 when the cross-origin server doesn't send
    // Timing-Allow-Origin; in that case fall back to decodedBodySize,
    // and if both are 0 (cache hit / opaque), skip this assertion rather
    // than assert on nothing.
    const perf = await img.evaluate((el: HTMLImageElement) => {
      const src = el.currentSrc || el.src;
      const entry = performance.getEntriesByName(src)[0] as
        | PerformanceResourceTiming
        | undefined;
      return {
        src,
        transferSize: entry?.transferSize ?? 0,
        decodedBodySize: entry?.decodedBodySize ?? 0,
        duration: entry ? Math.round(entry.duration) : null,
      };
    });
    const size = perf.transferSize || perf.decodedBodySize;
    if (size > 0) {
      expect(
        size,
        `popup image is ${size} bytes — exceeds ${MAX_TRANSFER_BYTES} byte budget; re-optimise the upload`,
      ).toBeLessThanOrEqual(MAX_TRANSFER_BYTES);
    }

    // Sanity: the image must render at the size the popup expects (360×480
    // slot). Anything wildly larger means the source is oversized again.
    const natural = await img.evaluate((el: HTMLImageElement) => ({
      w: el.naturalWidth,
      h: el.naturalHeight,
    }));
    expect(
      natural.w,
      `popup image is ${natural.w}px wide — should be ≤800px (rendered at 360px)`,
    ).toBeLessThanOrEqual(800);
  });
});
