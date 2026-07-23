/**
 * Visual regression — covers the four high-risk surfaces called out by the
 * /compound + /request-catalog spec:
 *
 *   1. /compound hero (above-the-fold)
 *   2. /compound LandingTrustStrip (the dark trust bar under the hero)
 *   3. /request-catalog success panel (after a stubbed 200 from send-mail)
 *   4. /request-catalog 500-fallback alert (after a stubbed 500)
 *
 * Visual snapshots are chromium-only — Firefox font/hinting differences make
 * cross-browser pixel diffing noisy. The functional regression spec
 * (`compound-contact-catalog-regression.spec.ts`) is the cross-browser gate.
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "http://localhost:8080";

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

async function prep(page: Page, opts: { mailStatus?: number } = {}) {
  const { mailStatus = 200 } = opts;

  await page.addInitScript((css) => {
    (window as any).dataLayer = [];
    (window as any).gtag = function (...args: unknown[]) {
      (window as any).dataLayer.push(args);
    };
    try {
      localStorage.setItem("php_research_confirmed", JSON.stringify({ ok: true, ts: Date.now() }));
      localStorage.setItem("php_cookie_consent", JSON.stringify({ analytics: false, marketing: false, ts: Date.now() }));
    } catch { /* ignore */ }
    const apply = () => {
      const s = document.createElement("style");
      s.setAttribute("data-test", "kill-motion");
      s.textContent = css;
      document.documentElement.appendChild(s);
    };
    if (document.documentElement) apply();
    else document.addEventListener("DOMContentLoaded", apply);
  }, KILL_MOTION_CSS);

  await page.route(/(fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) => r.abort());
  await page.route("**/api/public/send-mail", async (route: Route) => {
    if (mailStatus >= 400) {
      await route.fulfill({ status: mailStatus, contentType: "application/json", body: JSON.stringify({ error: "stub" }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
  });
}

test.describe("visual regression (chromium-only)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "snapshots locked to chromium");

  test("/compound hero matches snapshot", async ({ page }) => {
    await prep(page);
    await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();
    await page.addStyleTag({ content: KILL_MOTION_CSS });
    await page.waitForTimeout(400);
    // Hero = first <section> after the trust strip; cap snapshot at viewport.
    const hero = page.locator("section").nth(1);
    await expect(hero).toHaveScreenshot("compound-hero.png", {
      maxDiffPixelRatio: 0.03,
    });
  });

  test("/compound trust bar matches snapshot", async ({ page }) => {
    await prep(page);
    await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1").first()).toBeVisible();
    await page.addStyleTag({ content: KILL_MOTION_CSS });
    await page.waitForTimeout(400);
    // LandingTrustStrip is the first <section> in PremiumLanding (above hero).
    const trust = page.locator("section").first();
    await expect(trust).toHaveScreenshot("compound-trust-bar.png", {
      maxDiffPixelRatio: 0.03,
    });
  });

  test("/request-catalog success panel matches snapshot", async ({ page }) => {
    await prep(page, { mailStatus: 200 });
    await page.goto(`${BASE}/request-catalog`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/full name/i).fill("Dr Jane Smith");
    await page.getByLabel(/institution \/ company/i).fill("Imperial College Research Lab");
    await page.getByLabel(/role/i).fill("Principal Investigator");
    await page.getByLabel(/^email/i).fill("jane@institution.invalid");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /send me the catalogue/i }).click();

    const panel = page.getByTestId("catalog-success");
    await expect(panel).toBeVisible();
    await page.addStyleTag({ content: KILL_MOTION_CSS });
    await page.waitForTimeout(300);

    // Mask the timestamp line (en-GB locale string changes per run).
    await expect(panel).toHaveScreenshot("request-catalog-success.png", {
      maxDiffPixelRatio: 0.03,
      mask: [panel.locator("p.text-white\\/55")],
    });
  });

  test("/request-catalog 500-fallback alert matches snapshot", async ({ page }) => {
    await prep(page, { mailStatus: 500 });
    await page.goto(`${BASE}/request-catalog`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/full name/i).fill("Dr Jane Smith");
    await page.getByLabel(/institution \/ company/i).fill("Imperial College Research Lab");
    await page.getByLabel(/role/i).fill("Principal Investigator");
    await page.getByLabel(/^email/i).fill("jane@institution.invalid");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /send me the catalogue/i }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await page.addStyleTag({ content: KILL_MOTION_CSS });
    await page.waitForTimeout(300);
    await expect(alert).toHaveScreenshot("request-catalog-error.png", {
      maxDiffPixelRatio: 0.03,
    });
  });
});

/**
 * Functional cross-check: BOTH the success-panel download link and the
 * 500-fallback alert link must point at the same /PH-Labs-Research-Catalogue.pdf
 * asset. This complements tests/catalogue-pdf-contents.test.ts which verifies
 * the file's contents.
 */
test.describe("/PH-Labs-Research-Catalogue.pdf consistency", () => {
  test("success + fallback links point to the same shipped PDF", async ({ page }) => {
    // Success path
    await prep(page, { mailStatus: 200 });
    await page.goto(`${BASE}/request-catalog`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/full name/i).fill("Dr Jane Smith");
    await page.getByLabel(/institution \/ company/i).fill("Imperial College Research Lab");
    await page.getByLabel(/^email/i).fill("jane@institution.invalid");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /send me the catalogue/i }).click();
    const successHref = await page.getByTestId("catalog-download-link").getAttribute("href");
    expect(successHref).toBe("/PH-Labs-Research-Catalogue.pdf");

    // Fallback path
    const ctx2 = await page.context().browser()!.newContext();
    const page2 = await ctx2.newPage();
    await prep(page2, { mailStatus: 500 });
    await page2.goto(`${BASE}/request-catalog`, { waitUntil: "domcontentloaded" });
    await page2.getByLabel(/full name/i).fill("Dr Jane Smith");
    await page2.getByLabel(/institution \/ company/i).fill("Imperial College Research Lab");
    await page2.getByLabel(/^email/i).fill("jane@institution.invalid");
    await page2.getByRole("checkbox").nth(0).check();
    await page2.getByRole("checkbox").nth(1).check();
    await page2.getByRole("button", { name: /send me the catalogue/i }).click();
    const fallbackHref = await page2
      .getByRole("alert")
      .getByRole("link", { name: /download catalogue/i })
      .getAttribute("href");
    expect(fallbackHref).toBe(successHref);

    // And the asset itself must be reachable from the server.
    const head = await page2.request.get(`${BASE}/PH-Labs-Research-Catalogue.pdf`);
    expect(head.ok(), `GET PDF returned ${head.status()}`).toBeTruthy();
    expect(head.headers()["content-type"] || "").toMatch(/pdf/i);
    await ctx2.close();
  });
});
