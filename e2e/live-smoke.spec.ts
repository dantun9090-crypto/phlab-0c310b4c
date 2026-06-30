/**
 * Live smoke test for https://phlabs.co.uk (override with SMOKE_BASE_URL).
 *
 * Fails if:
 *   • GET / returns non-2xx, or HTML body < 1KB,
 *   • the document is missing <title> or has no DOM rendered after boot,
 *   • the "Please refresh" / "Something went wrong" error screen is showing,
 *   • any uncaught JS error / unhandled rejection fires while the page loads.
 *
 * Run with:  bun run e2e/live-smoke.spec.ts          (via Playwright)
 *   or:      bunx playwright test e2e/live-smoke.spec.ts
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.SMOKE_BASE_URL || "https://phlabs.co.uk";

test.describe("live smoke", () => {
  test("homepage renders without JS errors or fallback screen", async ({ page }) => {
    const jsErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => jsErrors.push(`${err.name}: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    expect(res, "no response").not.toBeNull();
    expect(res!.status(), `HTTP ${res!.status()}`).toBeGreaterThanOrEqual(200);
    expect(res!.status()).toBeLessThan(400);

    const html = await res!.text();
    expect(html.length, `HTML too small: ${html.length} bytes`).toBeGreaterThan(1024);
    expect(html).toMatch(/<title>[^<]+<\/title>/i);

    // Wait for either the app shell or the fallback to settle.
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    // Fallback screens must NOT be visible.
    const fallbackTexts = [
      /Please refresh/i,
      /could not initialise cleanly/i,
      /Something went wrong/i,
      /Loading issue detected/i,
    ];
    for (const re of fallbackTexts) {
      const count = await page.getByText(re).count();
      expect(count, `fallback visible: ${re}`).toBe(0);
    }

    // The body must have rendered some real DOM (not just <body> empty).
    const bodyChildren = await page.evaluate(() => document.body?.children.length || 0);
    expect(bodyChildren, "empty <body>").toBeGreaterThan(0);

    const visibleText = (await page.evaluate(() => document.body?.innerText || "")).trim();
    expect(visibleText.length, "no visible text on page").toBeGreaterThan(50);

    // No uncaught JS errors during load.
    expect(jsErrors, `pageerror events:\n${jsErrors.join("\n")}`).toHaveLength(0);

    // Soft-warn on console errors so flaky 3rd-party noise doesn't fail the gate,
    // but fail on obvious React render crashes.
    const fatal = consoleErrors.filter((m) =>
      /Minified React error|Invariant failed|hydrat|Uncaught/i.test(m),
    );
    expect(fatal, `fatal console errors:\n${fatal.join("\n")}`).toHaveLength(0);
  });
});
