/**
 * Visual + spacing regression for /uk-research-store.
 *
 * Two layers of protection:
 *   1. Full-page pixel snapshots at desktop (1280) and mobile (400) — catch
 *      any unintended layout drift.
 *   2. Explicit 4px-grid assertions on the key spacing tokens the page
 *      relies on (button paddings, section paddings, list-item gaps). These
 *      fail immediately with a readable error if someone reintroduces a
 *      non-grid value like py-3.5 (14px) or mt-1.5 (6px).
 *
 * Refresh baselines after intentional design changes with:
 *   bunx playwright test e2e/uk-research-store-visual.spec.ts --update-snapshots
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const BASE =
  process.env.RESEARCH_BASE_URL ||
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

async function prepare(page: Page, context: BrowserContext) {
  await context.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) => r.abort());
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
}

async function loadPage(page: Page) {
  await page.goto(`${BASE}/uk-research-store`, { waitUntil: "domcontentloaded" });
  // Wait specifically for the real hero h1 (not the "Taking longer than usual"
  // fallback that flashes on slow live cold-boots).
  await expect(
    page.locator("h1").filter({ hasText: /reference materials/i }).first(),
  ).toBeVisible({ timeout: 25_000 });
  // Confirm the hero CTA buttons have hydrated too — otherwise the 4px grid
  // tests can race the render and see 0 `a.inline-flex` elements.
  await page.locator("a.inline-flex").first().waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  // Collapse any open <details> so FAQ height is deterministic.
  await page.evaluate(() => {
    document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  });
  await page.addStyleTag({ content: KILL_MOTION_CSS });
}

// px value must be a positive multiple of `grid`.
function assertOnGrid(label: string, value: string, grid = 4) {
  const n = Number.parseFloat(value);
  expect.soft(Number.isFinite(n), `${label}: expected numeric px, got "${value}"`).toBe(true);
  expect.soft(n % grid, `${label}: ${n}px is not on the ${grid}px grid`).toBe(0);
}

test.describe("/uk-research-store visual + spacing", () => {
  // Single source of truth for viewports used by BOTH the pixel snapshots
  // and the 4px-grid assertions. Add a viewport here and it flows into
  // every check automatically.
  const BREAKPOINTS = [
    { label: "mobile 400", slug: "mobile", width: 400, height: 900 },
    { label: "tablet 768", slug: "tablet", width: 768, height: 1400 },
    { label: "desktop 1280", slug: "desktop", width: 1280, height: 1800 },
  ] as const;

  for (const bp of BREAKPOINTS) {
    test(`${bp.label} — full page snapshot`, async ({ page, context }) => {
      await prepare(page, context);
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await loadPage(page);

      await expect(page).toHaveScreenshot(`uk-research-store-${bp.slug}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
        threshold: 0.25,
      });
    });
  }

  // Grid assertions run at EVERY breakpoint — mobile- or tablet-only
  // overrides (e.g. `md:py-20` shrinking to `py-3.5` at <768px) would
  // otherwise slip past a desktop-only check.


  for (const bp of BREAKPOINTS) {
    test(`4px grid — ${bp.label}`, async ({ page, context }) => {
      await prepare(page, context);
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await loadPage(page);

      // Primary CTA buttons — previous py-3.5 (14px) offender lived here.
      const buttons = page.locator("a.inline-flex");
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = buttons.nth(i);
        if (!(await box.isVisible())) continue;
        const { pt, pb, pl, pr } = await box.evaluate((el) => {
          const s = getComputedStyle(el as HTMLElement);
          return { pt: s.paddingTop, pb: s.paddingBottom, pl: s.paddingLeft, pr: s.paddingRight };
        });
        assertOnGrid(`[${bp.label}] button[${i}] padding-top`, pt);
        assertOnGrid(`[${bp.label}] button[${i}] padding-bottom`, pb);
        assertOnGrid(`[${bp.label}] button[${i}] padding-left`, pl);
        assertOnGrid(`[${bp.label}] button[${i}] padding-right`, pr);
      }

      // Every <section> — vertical rhythm must stay on the grid.
      const sections = page.locator("main > section");
      const sCount = await sections.count();
      expect(sCount).toBeGreaterThan(3);
      for (let i = 0; i < sCount; i++) {
        const { pt, pb, pl, pr } = await sections.nth(i).evaluate((el) => {
          const s = getComputedStyle(el as HTMLElement);
          return { pt: s.paddingTop, pb: s.paddingBottom, pl: s.paddingLeft, pr: s.paddingRight };
        });
        assertOnGrid(`[${bp.label}] section[${i}] padding-top`, pt);
        assertOnGrid(`[${bp.label}] section[${i}] padding-bottom`, pb);
        assertOnGrid(`[${bp.label}] section[${i}] padding-left`, pl);
        assertOnGrid(`[${bp.label}] section[${i}] padding-right`, pr);
      }

      // Grid/flex gaps — column-gap and row-gap must both stay on the grid.
      const gapNodes = page.locator("main .grid, main .flex");
      const gCount = await gapNodes.count();
      for (let i = 0; i < gCount; i++) {
        const el = gapNodes.nth(i);
        if (!(await el.isVisible())) continue;
        const { cg, rg } = await el.evaluate((n) => {
          const s = getComputedStyle(n as HTMLElement);
          return { cg: s.columnGap, rg: s.rowGap };
        });
        if (cg && cg !== "normal" && cg !== "0px") assertOnGrid(`[${bp.label}] gap[${i}] column-gap`, cg);
        if (rg && rg !== "normal" && rg !== "0px") assertOnGrid(`[${bp.label}] gap[${i}] row-gap`, rg);
      }

      // Hero benefit-list checkmarks — previous mt-0.5 (2px) offender.
      const bullets = page.locator("main ul li");
      const bCount = await bullets.count();
      for (let i = 0; i < Math.min(bCount, 8); i++) {
        const svg = bullets.nth(i).locator("svg").first();
        if (!(await svg.count())) continue;
        const mt = await svg.evaluate((el) => getComputedStyle(el as SVGElement).marginTop);
        assertOnGrid(`[${bp.label}] bullet[${i}] svg margin-top`, mt);
      }
    });
  }
});
