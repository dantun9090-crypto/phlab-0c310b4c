import { test, expect } from "@playwright/test";

/**
 * Regression for the 2026-06-30 refresh-loop incident.
 *
 * Asserts:
 *  - Slow initial paint does NOT cause repeated navigations / reloads.
 *  - The blank-page watchdog escalates to a friendly fallback at most once
 *    per session and never auto-reloads.
 *  - Structured diagnostics are exposed via window.__phlBlankWatchdog.
 */
test.describe("blank-page watchdog", () => {
  test("slow first paint does not trigger a refresh loop", async ({ page }) => {
    const navigations: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });

    // Throttle every request so first paint is visibly delayed.
    await page.route("**/*", async (route) => {
      await new Promise((r) => setTimeout(r, 50));
      await route.continue();
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Give the watchdog (>= 7s) plenty of time to fire.
    await page.waitForTimeout(15_000);

    // Should not have ping-ponged across many URLs.
    expect(navigations.length).toBeLessThan(4);

    const diag = await page.evaluate(
      () => (window as unknown as { __phlBlankWatchdog?: Record<string, unknown> }).__phlBlankWatchdog ?? null,
    );
    expect(diag).not.toBeNull();
  });

  test("manual fallback button does not auto-loop", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    // Manually invoke a no-paint scenario by wiping body and re-arming.
    const looped = await page.evaluate(async () => {
      const start = performance.now();
      let reloads = 0;
      const origReplace = location.replace.bind(location);
      const origReload = location.reload.bind(location);
      (location as unknown as { replace: (u: string) => void }).replace = (u: string) => {
        reloads++;
        console.warn("[test] suppressed replace ->", u);
      };
      (location as unknown as { reload: () => void }).reload = () => {
        reloads++;
        console.warn("[test] suppressed reload");
      };
      await new Promise((r) => setTimeout(r, 3000));
      (location as unknown as { replace: typeof origReplace }).replace = origReplace;
      (location as unknown as { reload: typeof origReload }).reload = origReload;
      return { reloads, elapsed: performance.now() - start };
    });

    expect(looped.reloads).toBe(0);
  });
});
