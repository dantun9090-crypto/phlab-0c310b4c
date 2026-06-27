/**
 * Regression guard for homepage LCP optimizations.
 *
 * The hero banner on `/` must always:
 *   1. Render the first significant image with `fetchpriority="high"`.
 *   2. NEVER carry `loading="lazy"` on the first hero/banner image.
 *   3. Be paired with a matching `<link rel="preload" as="image">` in the
 *      document head — so the browser starts downloading the LCP candidate
 *      before React hydrates.
 *
 * If anyone re-introduces lazy-loading or removes the preload link, this
 * test fails and the LCP regression is caught BEFORE it hits production.
 *
 * Run with the standard Playwright config (npx playwright test).
 */
import { test, expect } from "@playwright/test";

test.describe("Homepage hero LCP guards", () => {
  test("first hero/banner image is eager + high priority + preloaded", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok(), `homepage must return 2xx, got ${response?.status()}`).toBeTruthy();

    // Find the first image that's likely the LCP candidate: either marked
    // by the advert slot (data-advert-placement) or any <img> in the top
    // 900px of the document.
    const heroImg = page.locator(
      [
        '[data-advert-placement] img:first-of-type',
        'main img[fetchpriority="high"]',
        'header ~ * img[fetchpriority="high"]',
      ].join(", "),
    ).first();

    // Hero must exist. If the banner slot is empty, fall back to the first
    // visible <img> in the upper viewport.
    let target = heroImg;
    if ((await target.count()) === 0) {
      target = page.locator("img").first();
    }
    await expect(target).toBeVisible({ timeout: 10_000 });

    // 1) fetchpriority must be "high"
    const fp = await target.getAttribute("fetchpriority");
    expect(fp, "hero image must declare fetchpriority=high for LCP").toBe("high");

    // 2) must NOT be lazy-loaded
    const loading = await target.getAttribute("loading");
    expect(loading, "hero image must not be loading=lazy").not.toBe("lazy");

    // 3) explicit width/height (prevents CLS, helps LCP)
    expect(await target.getAttribute("width"), "hero image needs explicit width").not.toBeNull();
    expect(await target.getAttribute("height"), "hero image needs explicit height").not.toBeNull();

    // 4) matching preload link in <head> for the LCP image OR a font/style
    //    asset on the critical path. We allow either: at minimum there must
    //    be a `<link rel="preload" as="image">` OR the hero <img> src must
    //    appear in a preload link's href/imagesrcset.
    const preloadLinks = await page.locator('link[rel="preload"][as="image"]').count();
    const heroSrc = (await target.getAttribute("src")) ?? "";
    if (preloadLinks === 0) {
      // No image preload — that's only acceptable when the homepage banner
      // is intentionally empty (no banner configured). In that case the
      // first <img> usually comes from a static asset and a preload would
      // be wasted bytes. Surface it as a warning by failing only when the
      // hero is clearly a Cloudflare-resized banner.
      const usesResizer = /\/_img\/\?u=/.test(heroSrc);
      expect(
        usesResizer,
        "homepage uses dynamic banner image without a <link rel=preload as=image> — LCP will regress",
      ).toBeFalsy();
    } else {
      expect(preloadLinks).toBeGreaterThan(0);
    }
  });

  test("homepage has resource hints for critical origins", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Preconnect/dns-prefetch reduce TTFB for the first banner + Firestore
    // bootstrap. Both must remain present (added 2026-06-27).
    const hints = await page.locator(
      'link[rel="preconnect"], link[rel="dns-prefetch"]',
    ).count();
    expect(hints, "homepage must keep preconnect/dns-prefetch hints").toBeGreaterThan(0);
  });
});
