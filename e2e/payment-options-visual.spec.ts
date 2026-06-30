/**
 * Visual + integration regression for the payment selector.
 *
 * Pairs with `payment-options-a11y.spec.ts`:
 *   - This file is the *visual / structural* baseline. It pins screenshots
 *     at common breakpoints (320, 360, 768, 1280) so any unintended layout
 *     drift in <PaymentMethodOptions> fails CI.
 *   - It also runs an integration smoke against the harness route to prove
 *     the component mounts with no console errors and that every interactive
 *     option is keyboard-reachable in tab order — no traps, no skips.
 *
 * Baselines are checked in under `e2e/payment-options-visual.spec.ts-snapshots/`.
 * Refresh deliberately with `bunx playwright test ... --update-snapshots` after
 * an intentional design change ships; CI never auto-updates them.
 *
 * Visual snapshots intentionally run on Chromium only — Firefox + WebKit
 * font hinting + sub-pixel layout produce noisy diffs even when the DOM
 * and computed styles are identical. The structural / keyboard checks below
 * still execute on all three engines via playwright.config.ts.
 */
import { test, expect, type Page } from "@playwright/test";

const HARNESS = "/__e2e/payment-options";

const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: "320w-mobile", width: 320, height: 900 },
  { name: "360w-mobile", width: 360, height: 900 },
  { name: "768w-tablet", width: 768, height: 1100 },
  { name: "1280w-desktop", width: 1280, height: 1100 },
];

/**
 * Settle the page before snapshotting so the screenshot is deterministic:
 *   - wait for the harness root
 *   - wait for fonts (avoids FOUT shifting baselines)
 *   - kill caret blink + remaining transitions belt-and-braces
 */
async function settle(page: Page) {
  await page.waitForSelector('[data-testid="harness-root"]');
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  await page.addStyleTag({
    content: `*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}`,
  });
}

test.describe("PaymentMethodOptions — integration smoke", () => {
  test("harness mounts with no console errors and options are reachable", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(HARNESS, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="harness-root"]');

    // Both option buttons must exist and be enabled+visible.
    for (const id of ["pay-by-bank-button", "manual-bank-transfer-button"]) {
      const opt = page.getByTestId(id);
      await expect(opt).toBeVisible();
      await expect(opt).toBeEnabled();
    }

    // Filter out known noisy network 4xx-not-found logs we don't own (the
    // harness route doesn't make real payment API calls but the app shell
    // can emit unrelated dev-time warnings on some preview builds).
    const meaningful = consoleErrors.filter(
      (msg) =>
        !/favicon|manifest|net::ERR_|workbox|preload/i.test(msg) &&
        !/Failed to load resource/i.test(msg),
    );

    expect(
      pageErrors,
      `Uncaught page errors:\n${pageErrors.join("\n")}`,
    ).toEqual([]);
    expect(
      meaningful,
      `Unexpected console errors:\n${meaningful.join("\n")}`,
    ).toEqual([]);
  });
});

test.describe("PaymentMethodOptions — keyboard focus order @ small viewports", () => {
  // 320px is the WCAG reflow lower bound; 360px is the most common Android
  // viewport. The selector must be fully reachable on both without focus
  // traps or skipped controls.
  for (const vw of [320, 360]) {
    test(`tab order reaches every option, no trap @ ${vw}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vw, height: 900 });
      await page.goto(HARNESS, { waitUntil: "domcontentloaded" });
      await settle(page);

      // Anchor focus at the document body, then Tab forward and record which
      // payment options the focus visits. Stop once we've seen every option
      // or after a generous bound (prevents infinite trap from hanging CI).
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.locator("body").focus();

      const expected = new Set([
        "pay-by-bank-button",
        "manual-bank-transfer-button",
      ]);
      const seen = new Set<string>();
      const order: string[] = [];

      for (let i = 0; i < 40 && seen.size < expected.size; i++) {
        await page.keyboard.press("Tab");
        const id = await page.evaluate(() =>
          (document.activeElement as HTMLElement | null)?.getAttribute(
            "data-testid",
          ),
        );
        if (id && expected.has(id) && !seen.has(id)) {
          seen.add(id);
          order.push(id);
        }
      }

      expect(
        [...seen].sort(),
        `Tab order at ${vw}px missed options. Visited: ${order.join(" → ")}`,
      ).toEqual([...expected].sort());

      // Focus ring must be visible (non-empty box-shadow or outline) on the
      // currently-focused option. We pick whichever option ended up focused.
      const focusedId = order[order.length - 1];
      const focused = page.getByTestId(focusedId);
      const ring = await focused.evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.boxShadow} | ${s.outline} | ${s.outlineWidth}`;
      });
      expect(
        ring,
        `No visible focus ring on ${focusedId} at ${vw}px (got: ${ring})`,
      ).not.toMatch(/^none\s*\|\s*none\s*\|\s*0/i);

      // Shift+Tab must escape backward too — proves no trap. Press it a few
      // times and confirm focus eventually leaves the radiogroup.
      for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+Tab");
      const stillInsideGroup = await page.evaluate(() => {
        const a = document.activeElement;
        return !!a?.closest('[role="radiogroup"]');
      });
      expect(
        stillInsideGroup,
        `Shift+Tab failed to escape the radiogroup at ${vw}px (focus trap)`,
      ).toBe(false);
    });
  }
});

test.describe("PaymentMethodOptions — visual regression", () => {
  // Visual snapshots only on Chromium — see file header for rationale.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Visual baselines pinned to Chromium",
  );

  for (const vp of VIEWPORTS) {
    test(`snapshot @ ${vp.name} — default (pay-by-bank selected)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(HARNESS, { waitUntil: "domcontentloaded" });
      await settle(page);

      await expect(page.getByTestId("harness-root")).toHaveScreenshot(
        `payment-options-${vp.name}-default.png`,
      );
    });

    test(`snapshot @ ${vp.name} — manual bank transfer selected`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(HARNESS, { waitUntil: "domcontentloaded" });
      await settle(page);

      await page.getByTestId("manual-bank-transfer-button").click();
      await expect(
        page.getByTestId("manual-bank-transfer-button"),
      ).toHaveAttribute("aria-checked", "true");
      await settle(page);

      await expect(page.getByTestId("harness-root")).toHaveScreenshot(
        `payment-options-${vp.name}-manual.png`,
      );
    });
  }
});
