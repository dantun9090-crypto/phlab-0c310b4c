/**
 * Visual regression for /compound (prerendered).
 *
 * Hardened for determinism:
 *   - Locked viewport (1280x1800) + deviceScaleFactor=1 (playwright.config)
 *   - Reduced-motion forced (playwright.config)
 *   - All CSS animations / transitions / caret killed via injected stylesheet
 *   - Web fonts blocked at the route level — only system fonts render
 *   - All <details> collapsed
 *   - DOMContentLoaded + h1 visibility gate before snapping (not networkidle:
 *     live third-party beacons can keep the page busy indefinitely)
 *
 * Run with `bunx playwright test e2e/compound-visual.spec.ts --update-snapshots`
 * to refresh the baseline after an intentional design change.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.COMPOUND_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

const KILL_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important; }
`;

test.describe("/compound visual regression", () => {
  test.use({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });

  test("matches reference screenshot", async ({ page, context }) => {
    // Block all remote web fonts so screenshots use deterministic system fonts.
    await context.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) =>
      r.abort(),
    );

    // Inject the motion/transition kill switch before any stylesheet runs.
    await page.addInitScript((css) => {
      const apply = () => {
        const s = document.createElement("style");
        s.setAttribute("data-test", "kill-motion");
        s.textContent = css;
        document.documentElement.appendChild(s);
      };
      if (document.documentElement) apply();
      else document.addEventListener("DOMContentLoaded", apply);
    }, KILL_MOTION_CSS);

    await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => undefined);
    // Wait for the deferred full stylesheet (media="print" -> "all" swap)
    // before any measurement — otherwise the capture races the swap and the
    // page renders partially unstyled (wrong heights, pixel diffs).
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].every(
          (l) => l.media === "all" || l.media === "" || l.disabled,
        ),
      undefined,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(500);

    // Collapse any open <details> for determinism
    await page.evaluate(() => {
      document.querySelectorAll("details[open]").forEach((d) =>
        d.removeAttribute("open"),
      );
    });


    // Pre-warm lazy content before the capture: a fullPage screenshot
    // temporarily resizes the viewport to the document height, firing every
    // below-fold IntersectionObserver at once. Without a slow scroll pass
    // first, lazy sections expand DURING the capture and consecutive
    // screenshots oscillate in height ("Failed to take two consecutive
    // stable screenshots", observed as a 10235 <-> 11164px flip-flop).
    await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const step = Math.max(400, Math.floor(window.innerHeight / 2));
      for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await sleep(60);
      }
      window.scrollTo(0, 0);
      await sleep(300);
    });
    await page.waitForTimeout(500);

    // Belt-and-braces: re-inject the stylesheet after navigation in case the
    // app's CSS loaded after init.
    await page.addStyleTag({ content: KILL_MOTION_CSS });

    // Fixed-point viewport sizing before the capture: fullPage screenshots
    // temporarily resize the viewport to the document height, which changes
    // any vh-sized layout, which changes the document height — the exact
    // 9104 <-> 10235px flip-flop that made this suite non-deterministic.
    // Iterating to a fixed point FIRST means the capture itself never
    // triggers a resize, so baseline generation and CI runs converge to the
    // same height deterministically.
    {
      let lastHeight = 0;
      for (let i = 0; i < 4; i++) {
        const h = await page.evaluate(
          () => document.documentElement.scrollHeight,
        );
        if (h === lastHeight) break;
        lastHeight = h;
        await page.setViewportSize({ width: 1280, height: Math.min(h, 16384) });
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(300);
    }

    await expect(page).toHaveScreenshot("compound.png", { fullPage: true });
  });
});
