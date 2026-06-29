/**
 * Day-theme audit suite — unified accessibility, contract, and visual
 * regression coverage for the light theme.
 *
 * Sections:
 *  1. axe-core WCAG 2.1 AA scan (light + dark control).
 *  2. Day/night toggle contract — explicit SVG icon color assertions,
 *     plus hover/focus styles for BOTH keyboard AND mouse paths so
 *     regressions on either trigger surface a failure.
 *  3. "No heavy dark surface" scan on main + extended routes
 *     (auth/account/admin/billing/profile/settings subpages) to keep the
 *     whole light theme minimal.
 *  4. Visual regression — deterministic viewport, fonts ready, network
 *     idle, animations killed before snapshot.
 *
 * Baselines are seeded/updated via `bun run test:day-theme:update`
 * (single entrypoint for local + CI; see scripts/day-theme-snapshots.mjs).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE =
  process.env.DAY_THEME_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "http://localhost:8080";

const PAGES = ["/", "/products", "/compound"] as const;
// Auth/account/admin shells must also stay minimal in light mode.
// Admin chrome opts out via `.admin-dark` / `[data-keep-dark]` / `[data-admin-shell]`.
const EXTENDED_PAGES = [
  "/login",
  "/account",
  "/account/billing",
  "/account/profile",
  "/account/settings",
  "/admin",
  "/admin/settings",
] as const;
const STORAGE_KEY = "phlabs-theme-mode";
const SLATE_900 = "rgb(15,23,42)";
const SLATE_800 = "rgb(30,41,59)";
const WHITE = "rgb(255,255,255)";

// Deterministic viewport for visual regression — avoids host-default drift.
test.use({
  viewport: { width: 1280, height: 1800 },
  deviceScaleFactor: 1,
  colorScheme: "no-preference",
});

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
    { timeout: 5000 },
  );
}

async function stabilise(page: Page) {
  // Wait for hydration + fonts + network so screenshots are deterministic.
  await page.locator("main, h1, header").first().waitFor({ state: "visible" });
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.waitForLoadState("networkidle").catch(() => {});
  // Kill every motion source: CSS animations/transitions, smooth scroll,
  // caret blink, AND requestAnimationFrame loops (Framer Motion, GSAP,
  // canvas/3D tickers). The rAF stub keeps callbacks idempotent — they
  // run once synchronously so layout settles, then no further frames fire.
  await page.addStyleTag({
    content: [
      "*,*::before,*::after{",
      "animation:none!important;",
      "animation-duration:0s!important;animation-delay:0s!important;",
      "transition:none!important;",
      "transition-duration:0s!important;transition-delay:0s!important;",
      "caret-color:transparent!important;",
      "scroll-behavior:auto!important;",
      "}",
      "html,body{scroll-behavior:auto!important}",
    ].join(""),
  });
  await page.evaluate(() => {
    try {
      const w = window as any;
      const ran = new Set<number>();
      let id = 0;
      w.requestAnimationFrame = (cb: FrameRequestCallback) => {
        const n = ++id;
        if (ran.has(n)) return n;
        ran.add(n);
        try {
          cb(performance.now());
        } catch {
          /* ignore */
        }
        return n;
      };
      w.cancelAnimationFrame = () => {};
    } catch {
      /* ignore */
    }
  });
  // Fixed time budget so any lingering async work (image decode, late
  // hydration) lands before capture. Deterministic, not host-dependent.
  await page.waitForTimeout(400);
  // Scroll to top deterministically — eliminates sticky-header jitter.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
}

function rgbOf(el: Locator, prop: "color" | "backgroundColor") {
  return el.evaluate(
    (node, p) => getComputedStyle(node as Element)[p as any] as string,
    prop,
  );
}

async function svgColor(btn: Locator) {
  return btn.evaluate((el) => {
    const visible = Array.from(el.querySelectorAll("svg")).find((s) => {
      const cs = getComputedStyle(s);
      return cs.opacity !== "0" && cs.visibility !== "hidden";
    }) as SVGElement | undefined;
    return visible ? getComputedStyle(visible).color : "";
  });
}

test.describe("Day theme — unified audit", () => {
  // ---------- 1. axe ----------
  for (const path of PAGES) {
    test(`axe: no critical/serious violations in light mode @ ${path}`, async ({
      page,
    }) => {
      await forceTheme(page, "light");
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await waitForTheme(page, "light");
      await stabilise(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
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
      expect(blocking).toEqual([]);
    });
  }

  test("axe: dark mode home control still passes", async ({ page }) => {
    await forceTheme(page, "dark");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "dark");
    await stabilise(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["region"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });

  // ---------- 2. Toggle contract (mouse + keyboard) ----------
  test("toggle: night styling — keyboard focus + mouse hover", async ({
    page,
  }) => {
    await forceTheme(page, "dark");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "dark");
    await stabilise(page);

    const btn = page
      .getByRole("button", { name: /switch to day mode/i })
      .first();
    await expect(btn).toBeVisible();

    // Keyboard focus path — ring must render.
    await btn.focus();
    expect(
      await btn.evaluate((el) => getComputedStyle(el).boxShadow !== "none"),
    ).toBe(true);

    // SVG icon (moon in night mode) must NOT be pure black.
    const icon = await svgColor(btn);
    expect(icon.replace(/\s+/g, "")).not.toBe("rgb(0,0,0)");
    expect(icon.replace(/\s+/g, "")).not.toBe("");

    // Mouse hover path — text colour must lighten to white.
    await btn.hover();
    // Allow style update to apply.
    await page.waitForTimeout(50);
    const hoverColor = (await rgbOf(btn, "color")).replace(/\s+/g, "");
    expect(hoverColor).toBe(WHITE);
  });

  test("toggle: day styling — explicit SVG color + hover + focus", async ({
    page,
  }) => {
    await forceTheme(page, "light");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "light");
    await stabilise(page);

    const btn = page
      .getByRole("button", { name: /switch to night mode/i })
      .first();
    await expect(btn).toBeVisible();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");

    // Idle: slate-900 pill, white sun icon.
    expect((await rgbOf(btn, "backgroundColor")).replace(/\s+/g, "")).toBe(
      SLATE_900,
    );
    expect((await svgColor(btn)).replace(/\s+/g, "")).toBe(WHITE);

    // Mouse hover: bg → slate-800, icon STAYS white.
    await btn.hover();
    await page.waitForTimeout(50);
    expect((await rgbOf(btn, "backgroundColor")).replace(/\s+/g, "")).toBe(
      SLATE_800,
    );
    expect((await svgColor(btn)).replace(/\s+/g, "")).toBe(WHITE);

    // Keyboard focus path: ring visible AND icon still white.
    await page.mouse.move(0, 0);
    await btn.focus();
    expect(
      await btn.evaluate((el) => getComputedStyle(el).boxShadow !== "none"),
    ).toBe(true);
    expect((await svgColor(btn)).replace(/\s+/g, "")).toBe(WHITE);
  });

  // ---------- 3. Heavy-surface scan ----------
  for (const path of [...PAGES, ...EXTENDED_PAGES]) {
    test(`light theme stays minimal @ ${path}`, async ({ page }) => {
      await forceTheme(page, "light");
      const resp = await page.goto(`${BASE}${path}`, {
        waitUntil: "domcontentloaded",
      });
      expect(resp?.status() ?? 200).toBeLessThan(500);
      await waitForTheme(page, "light");
      await stabilise(page);

      const offenders = await page.evaluate(() => {
        const out: { tag: string; bg: string; cls: string }[] = [];
        const els = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
        for (const el of els) {
          if (
            el.closest("[data-keep-dark], .admin-dark, [data-admin-shell]")
          )
            continue;
          const r = el.getBoundingClientRect();
          if (r.width < 120 || r.height < 60) continue;
          if (r.top > window.innerHeight) continue;
          const bg = getComputedStyle(el).backgroundColor;
          const m = bg.match(
            /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/,
          );
          if (!m) continue;
          const a = m[4] === undefined ? 1 : +m[4];
          if (a < 0.5) continue;
          const max = Math.max(+m[1], +m[2], +m[3]);
          if (max < 40)
            out.push({
              tag: el.tagName.toLowerCase(),
              bg,
              cls: (el.className?.toString?.() ?? "").slice(0, 80),
            });
        }
        return out.slice(0, 5);
      });
      expect(
        offenders,
        `dark surfaces leaked into light theme on ${path}: ${JSON.stringify(offenders)}`,
      ).toEqual([]);
    });
  }

  // ---------- 4. Visual regression ----------
  for (const path of PAGES) {
    test(`visual regression — light theme @ ${path}`, async ({ page }) => {
      await forceTheme(page, "light");
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await waitForTheme(page, "light");
      await stabilise(page);
      // Park the cursor so hover state never leaks into the snapshot.
      await page.mouse.move(0, 0);
      const slug =
        path === "/"
          ? "home"
          : path.replace(/[\\/]/g, "-").replace(/^-/, "");
      await expect(page).toHaveScreenshot(`day-theme-${slug}.png`, {
        fullPage: false,
        animations: "disabled",
        caret: "hide",
      });
    });
  }

  // ---------- Media-query matrix ----------
  for (const colorScheme of ["light", "dark"] as const) {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      test(`toggle: prefers-color-scheme=${colorScheme} + prefers-reduced-motion=${reducedMotion}`, async ({
        browser,
      }) => {
        const ctx = await browser.newContext({
          colorScheme,
          reducedMotion,
          viewport: { width: 1280, height: 1800 },
          deviceScaleFactor: 1,
        });
        const page = await ctx.newPage();
        await forceTheme(page, colorScheme === "light" ? "light" : "dark");
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await waitForTheme(page, colorScheme === "light" ? "light" : "dark");
        await stabilise(page);

        const labelRx =
          colorScheme === "light"
            ? /switch to night mode/i
            : /switch to day mode/i;
        const btn = page.getByRole("button", { name: labelRx }).first();
        await expect(btn).toBeVisible();

        await btn.focus();
        expect(
          await btn.evaluate((el) => getComputedStyle(el).boxShadow !== "none"),
        ).toBe(true);

        const sun = await svgColor(btn);
        if (colorScheme === "light") {
          expect(
            (await rgbOf(btn, "backgroundColor")).replace(/\s+/g, ""),
          ).toBe(SLATE_900);
          expect(sun.replace(/\s+/g, "")).toBe(WHITE);
        } else {
          expect(sun.replace(/\s+/g, "")).not.toBe("rgb(0,0,0)");
        }
        await ctx.close();
      });
    }
  }
});
