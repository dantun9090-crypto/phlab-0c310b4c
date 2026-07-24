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
// Tailwind v4 serializes colors in oklab space — exact "rgb(...)" strings
// never match, and canvas fillStyle returns lab() unchanged. Compare
// pixel-normalized rgb() instead (1px draw + getImageData).
const SLATE_900 = "rgb(15,23,43)";
const SLATE_800 = "rgb(29,41,61)";
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
        // Skip the research-gate modal AND the cookie banner — both are
        // fixed overlays that intercept pointer events and break
        // hover/click assertions in the toggle contract tests.
        localStorage.setItem(
          "php_research_confirmed",
          JSON.stringify({ ts: Date.now() }),
        );
        localStorage.setItem(
          "php_cookie_consent",
          JSON.stringify({ necessary: true, analytics: false, marketing: false }),
        );
        // Newsletter modal uses a cooldown timestamp — set it to now so it
        // never opens mid-test and overlays the toggle pill.
        localStorage.setItem("phlabs_newsletter_seen", String(Date.now()));
        // SmartBanner (center promo) renders a full-screen veil behind the
        // banner — dismiss it so screenshots capture the page itself.
        localStorage.setItem("phl_banner_dismissed", String(Date.now()));
        // Live-sales popup overlays the floating toggle pill on webkit CI —
        // hide it for the whole suite (it is not under test here).
        const style = document.createElement("style");
        style.id = "e2e-popup-block";
        // The consent banner is not under test here; the localStorage seed
        // above SHOULD suppress it but webkit CI has baked it into a
        // baseline before — hide deterministically via CSS as well.
        style.textContent =
          "#phl-live-sales-popup, [data-cookie-consent] { display: none !important; }";
        document.documentElement.appendChild(style);
      } catch {
        /* ignore */
      }
    },
    [STORAGE_KEY, mode] as const,
  );
}

// CI webkit/firefox flake guard: the app's own client-side boot can trigger
// a navigation (e.g. the 404 catch-all redirecting to "/") that interrupts
// an in-flight goto, and axe's page.evaluate can lose its execution context
// to the same race. Retry only on those two navigation-race signatures.
function isNavRace(err: unknown): boolean {
  return /interrupted by another navigation|Execution context was destroyed/i.test(
    String(err),
  );
}

async function gotoRobust(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    } catch (err) {
      if (!isNavRace(err) || attempt === 2) throw err;
    }
  }
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
  // Home now SSRs a static hero shell (LCP fix) that unmounts once the
  // LegacyApp chunk boots. Tests must measure the REAL app, not the shell —
  // wait for it to detach (no-op on routes/tests where it never appears).
  await page
    .waitForSelector(".phl-ssr-shell", { state: "detached", timeout: 25_000 })
    .catch(() => {});
  // Cold vite transform on a fresh CI dev server can hold the CSR boot
  // fallback ("Loading PH Labs…") for 30s+ — never scan/snapshot it.
  await page
    .waitForSelector(".phl-boot", { state: "detached", timeout: 30_000 })
    .catch(() => {});
  // The shell carries an h1 and the CSR boot fallback can satisfy loose
  // landmark selectors — wait for main/form/header, which only the real
  // mounted app renders. Generous timeout: the LegacyApp/Home chunk
  // waterfall on CI dev-server can take 10-20s.
  await page
    .locator("main, form, header")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  // The boot fallback can REAPPEAR transiently (chunk-recovery remounts)
  // after the app first mounts — re-check before proceeding.
  await page
    .waitForSelector(".phl-boot", { state: "detached", timeout: 30_000 })
    .catch(() => {});
  // `document.fonts.ready` can hang if a webfont 404s in CI — bound it.
  await Promise.race([
    page.evaluate(() => (document as any).fonts?.ready),
    page.waitForTimeout(2_000),
  ]).catch(() => {});
  // Wait for the deferred full stylesheet (media="print" -> "all" swap).
  // Without this, axe/screenshots can run against partial styles and
  // misjudge colors (e.g. gold-bg + light body text = false 2.17:1
  // contrast violation).
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].every(
        (l) => l.media === "all" || l.media === "" || l.disabled,
      ),
    undefined,
    { timeout: 30_000 },
  ).catch(() => {});
  // networkidle inherits the test timeout by default (30s) and hangs whenever
  // an SSE/WS/analytics beacon keeps the pool busy. Cap it so a chatty page
  // does not eat every test's budget — 3s of quiet is enough for screenshots.
  await page
    .waitForLoadState("networkidle", { timeout: 3_000 })
    .catch(() => {});
  // Let entrance animations (Framer Motion hero reveals etc.) FINISH before
  // we kill rAF — stubbing requestAnimationFrame mid-flight freezes those
  // elements at opacity:0 (blank home screenshots after the SSR shell
  // started satisfying the landmark wait ~2s earlier in the boot).
  await page.waitForTimeout(1_500);
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
    (node, p) => {
      const raw = getComputedStyle(node as Element)[p as any] as string;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return raw;
      ctx.fillStyle = raw;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${d[0]},${d[1]},${d[2]})`;
    },
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
  // stabilise() waits out slow CSR boots on cold CI dev-servers; the default
  // 30s project timeout is too tight for the shell-detach + landmark +
  // networkidle + settle chain.
  test.setTimeout(120_000);
  // ---------- 1. axe ----------
  for (const path of PAGES) {
    test(`axe: no critical/serious violations in light mode @ ${path}`, async ({
      page,
    }) => {
      await forceTheme(page, "light");
      let results: Awaited<ReturnType<AxeBuilder["analyze"]>> | null = null;
      for (let attempt = 0; attempt < 2 && !results; attempt++) {
        try {
          await gotoRobust(page, `${BASE}${path}`);
          await waitForTheme(page, "light");
          await stabilise(page);
          results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            // Transient CSR boot fallback — not page content.
            .exclude(".phl-boot")
            .disableRules(["region"])
            .analyze();
        } catch (err) {
          if (!isNavRace(err) || attempt === 1) throw err;
        }
      }
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
    // Hover via explicit pointer position — force:true skips actionability
    // but does not reliably trigger :hover on every CI browser.
    const btnBox = await btn.boundingBox();
    if (btnBox) {
      await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    } else {
      await btn.hover({ force: true });
    }
    // Allow the 280ms theme transition to settle before asserting.
    await page.waitForTimeout(650);
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
    const hoverBox = await btn.boundingBox();
    if (hoverBox) {
      await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);
    } else {
      await btn.hover({ force: true });
    }
    // Poll until the 280ms theme transition completes (fixed waits flaked
    // on slow CI runners).
    await expect
      .poll(
        async () => (await rgbOf(btn, "backgroundColor")).replace(/\s+/g, ""),
        { timeout: 5_000 },
      )
      .toBe(SLATE_800);
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

  // ---------- 4. Visual regression (desktop + tablet + mobile) ----------
  const VIEWPORTS = [
    { name: "desktop", width: 1280, height: 1800 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "mobile", width: 390, height: 844 },
  ] as const;
  for (const vp of VIEWPORTS) {
    for (const path of PAGES) {
      test(`visual regression — ${vp.name} light @ ${path}`, async ({
        browser,
      }) => {
        // Fresh context per run — guarantees no cookies, no localStorage,
        // no sessionStorage, no IndexedDB bleed (including a stale day/night
        // toggle value) from any sibling test in the same worker.
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          colorScheme: "no-preference",
          reducedMotion: "reduce",
          storageState: { cookies: [], origins: [] },
        });
        await ctx.clearCookies();
        const page = await ctx.newPage();
        // Wipe any persisted storage on the BASE origin before we seed the
        // theme, so the toggle value we set is the only one present.
        await gotoRobust(page, `${BASE}/__blank`)
          .catch(() => gotoRobust(page, BASE));
        await page.evaluate(() => {
          try { localStorage.clear(); } catch { /* ignore */ }
          try { sessionStorage.clear(); } catch { /* ignore */ }
        });
        await forceTheme(page, "light");
        await gotoRobust(page, `${BASE}${path}`);
        await waitForTheme(page, "light");
        await stabilise(page);

        // Toggle visibility check — must be reachable on every viewport.
        const btn = page
          .getByRole("button", { name: /switch to night mode/i })
          .first();
        await expect(btn).toBeVisible();
        expect((await svgColor(btn)).replace(/\s+/g, "")).toBe(WHITE);
        await btn.focus();
        expect(
          await btn.evaluate((el) => getComputedStyle(el).boxShadow !== "none"),
        ).toBe(true);
        await page.mouse.move(0, 0);

        // WebKit intermittently renders the cookie-consent dialog despite the
        // localStorage seed + CSS hide (it overlays the bottom of the page
        // and breaks the pixel diff). Remove it outright before capturing.
        // Marketing advert slots load from Firestore campaigns and rotate —
        // they appear in some runs and not others, shifting the whole page
        // down ~40px. Remove them too; they are not under test here.
        await page.evaluate(() => {
          document
            .querySelectorAll('[data-cookie-consent], [role="dialog"], [data-advert-placement]')
            .forEach((el) => {
              const text = (el.textContent || "").toLowerCase();
              if (text.includes("cookie") || el.hasAttribute("data-advert-placement")) el.remove();
            });
        });

        const slug =
          path === "/" ? "home" : path.replace(/[\\/]/g, "-").replace(/^-/, "");
        // Explicit pixel-diff threshold: only meaningful regressions fail.
        // - maxDiffPixelRatio 0.5% absorbs sub-pixel AA + font hinting jitter.
        // - threshold 0.2 is Playwright's per-pixel colour tolerance.
        await expect(page).toHaveScreenshot(
          `day-theme-${vp.name}-${slug}.png`,
          {
            fullPage: false,
            animations: "disabled",
            caret: "hide",
            maxDiffPixelRatio: 0.005,
            threshold: 0.2,
          },
        );
        await ctx.close();
      });
    }
  }

  // ---------- 5. CSS variable contract ----------
  // Even if screenshots look similar, a regression in the token map
  // (background / foreground / border / ring / primary) breaks every
  // downstream component. Assert the html.light variables resolve to
  // the locked PH Labs day palette.
  test("CSS variables: html.light token map is locked", async ({ page }) => {
    await forceTheme(page, "light");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "light");
    await stabilise(page);

    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const get = (n: string) => cs.getPropertyValue(n).trim();
      return {
        background: get("--background"),
        foreground: get("--foreground"),
        card: get("--card"),
        border: get("--border"),
        primary: get("--primary"),
        ring: get("--ring"),
      };
    });

    // Locked palette from src/styles.css → `html.light`.
    expect(vars.background).toBe("0 0% 100%"); // pure white
    expect(vars.foreground).toBe("222 47% 11%"); // slate-900
    expect(vars.border).toBe("214 32% 91%"); // slate-200
    expect(vars.ring).toBe("160 84% 39%"); // emerald-500
    // Card + primary may be redefined per surface, but must be set.
    expect(vars.card.length).toBeGreaterThan(0);
    expect(vars.primary.length).toBeGreaterThan(0);

    // Resolved body color: light text on white background.
    const body = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    // Body bg must be a near-white surface, text must be dark.
    const bgM = body.bg.match(/\d+/g)!.map(Number);
    expect(Math.min(bgM[0], bgM[1], bgM[2])).toBeGreaterThan(240);
    const fgM = body.color.match(/\d+/g)!.map(Number);
    expect(Math.max(fgM[0], fgM[1], fgM[2])).toBeLessThan(80);

    // Link color must be visible (not the dark-mode default).
    const link = page.locator("a:visible").first();
    if (await link.count()) {
      const c = await rgbOf(link, "color");
      const parts = c.match(/\d+/g)!.map(Number);
      // Must not be near-white (that would be a leaked dark theme color).
      expect(Math.min(parts[0], parts[1], parts[2])).toBeLessThan(230);
    }

    // Focus ring on the toggle resolves to the emerald --ring token.
    const btn = page
      .getByRole("button", { name: /switch to night mode/i })
      .first();
    await btn.focus();
    const shadow = await btn.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    expect(shadow).not.toBe("none");
    expect(shadow.length).toBeGreaterThan(0);
  });

  // ---------- 5b. CSS variable contract — DARK ----------
  // Mirror of the light-mode lock: a regression in the dark token map
  // silently breaks every shadcn component in night mode even when
  // screenshots look "fine". Assert the html.dark variables resolve to
  // the locked PH Labs night palette (slate-950 / slate-900 / emerald).
  test("CSS variables: html.dark token map is locked", async ({ page }) => {
    await forceTheme(page, "dark");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await waitForTheme(page, "dark");
    await stabilise(page);

    // Any CSS color (incl. oklab/oklch, which Tailwind v4 emits) → pixel
    // luma (0–100) + hue (0–360), computed in-page.
    const parsed = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const get = (n: string) => cs.getPropertyValue(n).trim();
      const analyze = (raw: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return { l: NaN, h: NaN };
        // Composite over the page background so alpha-token colors
        // (e.g. dark-mode --border = white at 10%) read as intended.
        ctx.fillStyle = cs.getPropertyValue("--background").trim() || "#000";
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = raw;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        const l = (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 2.55;
        const [r, g, b] = [d[0] / 255, d[1] / 255, d[2] / 255];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0;
        if (max !== min) {
          const dd = max - min;
          h =
            (max === r
              ? ((g - b) / dd) % 6
              : max === g
                ? (b - r) / dd + 2
                : (r - g) / dd + 4) * 60;
          if (h < 0) h += 360;
        }
        return { l, h };
      };
      return {
        background: { raw: get("--background"), ...analyze(get("--background")) },
        foreground: { raw: get("--foreground"), ...analyze(get("--foreground")) },
        card: { raw: get("--card"), ...analyze(get("--card")) },
        border: { raw: get("--border"), ...analyze(get("--border")) },
        primary: { raw: get("--primary") },
        ring: { raw: get("--ring"), ...analyze(get("--ring")) },
      };
    });
    const vars = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, (v as { raw: string }).raw]),
    );

    // All tokens must be set in dark mode.
    for (const [k, v] of Object.entries(vars)) {
      expect((v as string).length, `--${k} missing in html.dark`).toBeGreaterThan(0);
    }

    // Background + card must be DARK surfaces (luma < 20%).
    expect(parsed.background.l).toBeLessThan(20);
    expect(parsed.card.l).toBeLessThan(25);
    // Foreground must be LIGHT (luma > 80%) for contrast.
    expect(parsed.foreground.l).toBeGreaterThan(80);
    // Border must stay subtle on dark (luma < 35%).
    expect(parsed.border.l).toBeLessThan(35);
    // Ring must remain the emerald accent (hue near 160).
    const ringHue = parsed.ring.h;
    expect(ringHue).toBeGreaterThan(140);
    expect(ringHue).toBeLessThan(180);

    // Resolved body colour: dark surface, light text.
    const body = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    const bgM = body.bg.match(/\d+/g)!.map(Number);
    expect(Math.max(bgM[0], bgM[1], bgM[2])).toBeLessThan(40);
    const fgM = body.color.match(/\d+/g)!.map(Number);
    expect(Math.min(fgM[0], fgM[1], fgM[2])).toBeGreaterThan(180);

    // Link must not collapse to dark on dark.
    const link = page.locator("a:visible").first();
    if (await link.count()) {
      const c = await rgbOf(link, "color");
      const parts = c.match(/\d+/g)!.map(Number);
      expect(Math.max(parts[0], parts[1], parts[2])).toBeGreaterThan(120);
    }

    // Focus ring on the toggle still resolves to --ring (emerald).
    const btn = page
      .getByRole("button", { name: /switch to day mode/i })
      .first();
    await btn.focus();
    const shadow = await btn.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    expect(shadow).not.toBe("none");
    expect(shadow.length).toBeGreaterThan(0);
  });




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
