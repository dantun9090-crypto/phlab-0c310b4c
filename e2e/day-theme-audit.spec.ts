/**
 * Day-theme audit suite.
 *
 * Verifies, on the main public pages, that:
 *  1. axe-core finds NO critical/serious WCAG violations in light mode.
 *     Re-runs the scan in dark mode on the home page as a control so the
 *     suite catches regressions on either theme.
 *  2. The header day/night toggle has the expected contract in BOTH themes:
 *       - night : aria-label "Switch to day mode", focus-visible ring visible
 *       - day   : aria-label "Switch to night mode", sun icon is computed
 *                 WHITE (rgb 255,255,255) on a solid slate-900 pill, and the
 *                 focus-visible ring is reachable by keyboard.
 *  3. The light theme stays MINIMAL — no element on the visible page paints
 *     a near-black background (the old "heavy gradient" regression).
 *  4. Visual regression snapshots are captured per page in light mode so
 *     unintended gradients / heavy effects fail the next run.
 *
 * Snapshots are tolerant (see playwright.config.ts toHaveScreenshot
 * defaults) so font hinting + sub-pixel drift never flake the suite.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE =
  process.env.DAY_THEME_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "http://localhost:8080";

const PAGES = ["/", "/products", "/compound"] as const;
// Extended routes — auth/account/admin shells must also stay minimal in
// light mode (admin chrome opts out via `.admin-dark` / `[data-keep-dark]`).
const EXTENDED_PAGES = ["/login", "/account", "/admin"] as const;
const STORAGE_KEY = "phlabs-theme-mode";

async function forceTheme(page: Page, mode: "light" | "dark") {
  await page.addInitScript(
    ([k, v]) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* ignore */
      }
    },
    [STORAGE_KEY, mode] as const,
  );
}

async function waitForTheme(page: Page, mode: "light" | "dark") {
  await page.waitForFunction(
    (expected) =>
      document.documentElement.getAttribute("data-theme-mode") === expected,
    mode,
  );
}

test.describe("Day theme — unified audit", () => {
  for (const path of PAGES) {
    test(`no critical/serious axe violations in light mode @ ${path}`, async ({
      page,
    }) => {
      await forceTheme(page, "light");
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await waitForTheme(page, "light");
      await expect(page.locator("main, h1").first()).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // top disclaimer + footer divs are decorative, not landmarks.
        .disableRules(["region"])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      if (blocking.length) {
        console.error(
          blocking
            .map(
              (v) =>
                `[${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)\n  ${v.helpUrl}`,
            )
            .join("\n"),
        );
      }
      expect(
        blocking,
        `${blocking.length} blocking a11y issue(s) in light mode — see console`,
      ).toEqual([]);
    });
  }

  test("dark mode home control still passes axe (no regression)", async ({
    page,
  }) => {
    await forceTheme(page, "dark");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "dark");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["region"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });

  test("toggle: night styling preserved + focus-visible ring reachable", async ({
    page,
  }) => {
    await forceTheme(page, "dark");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "dark");

    const btn = page
      .getByRole("button", { name: /switch to day mode/i })
      .first();
    await expect(btn).toBeVisible();

    // Keyboard focus must reach the toggle and show a ring.
    await btn.focus();
    const hasRing = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      // focus-visible ring is rendered via box-shadow on Tailwind's ring utility.
      return s.boxShadow !== "none" && s.boxShadow.length > 0;
    });
    expect(hasRing, "night-mode toggle must show a focus ring").toBe(true);
  });

  test("toggle: day mode sun icon is WHITE on slate-900 pill", async ({
    page,
  }) => {
    await forceTheme(page, "light");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "light");

    const btn = page
      .getByRole("button", { name: /switch to night mode/i })
      .first();
    await expect(btn).toBeVisible();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");

    const { bg, sunColor } = await btn.evaluate((el) => {
      const sun = el.querySelector("svg") as SVGElement | null;
      return {
        bg: getComputedStyle(el).backgroundColor,
        sunColor: sun ? getComputedStyle(sun).color : "",
      };
    });

    // slate-900 = rgb(15, 23, 42)
    expect(bg.replace(/\s+/g, "")).toBe("rgb(15,23,42)");
    // Sun stroke uses currentColor → must be pure white.
    expect(sunColor.replace(/\s+/g, "")).toBe("rgb(255,255,255)");

    // Focus ring still present in light mode.
    await btn.focus();
    const hasRing = await btn.evaluate(
      (el) => getComputedStyle(el).boxShadow !== "none",
    );
    expect(hasRing, "day-mode toggle must show a focus ring").toBe(true);

    // Hover must keep the icon readable (no transparent background swap).
    await btn.hover();
    const hoverBg = await btn.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // slate-800 = rgb(30, 41, 59)
    expect(hoverBg.replace(/\s+/g, "")).toBe("rgb(30,41,59)");
  });

  for (const path of PAGES) {
    test(`light theme: no heavy dark surfaces remain @ ${path}`, async ({
      page,
    }) => {
      await forceTheme(page, "light");
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await waitForTheme(page, "light");

      // Scan every visible element above the fold for near-black painted
      // backgrounds — the regression we want to catch is a dark hero/section
      // bleeding through in light mode.
      const offenders = await page.evaluate(() => {
        const out: { tag: string; bg: string }[] = [];
        const els = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
        for (const el of els) {
          if (el.closest("[data-keep-dark], .admin-dark")) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 80 || r.height < 40) continue;
          if (r.top > window.innerHeight) continue;
          const bg = getComputedStyle(el).backgroundColor;
          const m = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
          if (!m) continue;
          const [r1, g1, b1] = [+m[1], +m[2], +m[3]];
          const a = m[4] === undefined ? 1 : +m[4];
          if (a < 0.5) continue;
          const max = Math.max(r1, g1, b1);
          if (max < 40) out.push({ tag: el.tagName.toLowerCase(), bg });
        }
        return out.slice(0, 5);
      });
      expect(offenders, `dark surfaces leaking into light theme: ${JSON.stringify(offenders)}`).toEqual([]);
    });
  }

  for (const path of PAGES) {
    test(`visual regression — light theme @ ${path}`, async ({ page }) => {
      await forceTheme(page, "light");
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await waitForTheme(page, "light");
      // Stabilise: kill animations / blinking carets handled globally.
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important}",
      });
      await page.waitForLoadState("networkidle").catch(() => {});
      const slug = path === "/" ? "home" : path.replace(/[\\/]/g, "-").replace(/^-/, "");
      await expect(page).toHaveScreenshot(`day-theme-${slug}.png`, {
        fullPage: false,
      });
    });
  }
});
