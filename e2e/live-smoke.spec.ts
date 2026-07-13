/**
 * Live smoke test for https://phlabs.co.uk (override with SMOKE_BASE_URL).
 *
 * Verifies:
 *   1. /api/public/health responds 200 with { status: "healthy" }
 *   2. Each critical route returns 2xx, non-empty HTML with a <title>,
 *      no fallback/error screen, rendered DOM, and no uncaught JS errors
 *   3. The homepage response carries a sane CSP and Cache-Control header
 *      and an x-build-id header.
 */
import { test, expect, request } from "@playwright/test";

const BASE = (process.env.SMOKE_BASE_URL || "https://phlabs.co.uk").replace(/\/+$/, "");

// Cloudflare bot manager 403s the default Playwright "HeadlessChrome" UA on
// every route except /. Present as a normal desktop Chrome browser so the
// smoke test exercises the real user path.
const REAL_CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

test.use({
  userAgent: REAL_CHROME_UA,
  extraHTTPHeaders: {
    "user-agent": REAL_CHROME_UA,
    "accept-language": "en-GB,en;q=0.9",
  },
});

const CRITICAL_ROUTES = ["/", "/login", "/cart", "/products", "/about", "/contact", "/compound"];

const FALLBACK_TEXTS = [
  /Please refresh/i,
  /could not initialise cleanly/i,
  /Something went wrong/i,
  /Loading issue detected/i,
  /Taking longer than usual/i,
  /Refresh needed/i,
  /Update available/i,
  /PH Labs update in progress/i,
  /Loading PH Labs/i,
];

test.describe("live smoke", () => {
  test("health endpoint reports healthy", async () => {
    const ctx = await request.newContext({ extraHTTPHeaders: { "user-agent": REAL_CHROME_UA } });
    const res = await ctx.get(`${BASE}/api/public/health`, { timeout: 15_000 });
    expect(res.status(), `health HTTP ${res.status()}`).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(typeof body.buildId).toBe("string");
  });

  test("homepage carries CSP, cache-control, and build id headers", async () => {
    const ctx = await request.newContext({ extraHTTPHeaders: { "user-agent": REAL_CHROME_UA } });
    const res = await ctx.get(`${BASE}/`, { timeout: 30_000 });
    expect(res.ok(), `GET / HTTP ${res.status()}`).toBeTruthy();

    const headers = res.headers();
    const csp = headers["content-security-policy"];
    expect(csp, "missing CSP").toBeTruthy();
    expect(csp).toMatch(/default-src|script-src/i);

    const cc = headers["cache-control"];
    expect(cc, "missing cache-control").toBeTruthy();

    expect(headers["x-build-id"], "missing x-build-id header").toBeTruthy();

    expect(cc.toLowerCase(), "homepage HTML must remain deploy-safe no-store").toContain("no-store");
    expect(["HIT", "REVALIDATED", "STALE", "UPDATING"]).not.toContain(
      (headers["cf-cache-status"] || "").toUpperCase(),
    );
  });

  for (const route of CRITICAL_ROUTES) {
    test(`route ${route} renders without fallback or JS errors`, async ({ page }) => {
      const jsErrors: string[] = [];
      const consoleErrors: string[] = [];

      page.on("pageerror", (err) => jsErrors.push(`${err.name}: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const res = await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      expect(res, `${route} no response`).not.toBeNull();
      const status = res!.status();
      expect(status, `${route} HTTP ${status}`).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(400);

      const html = await res!.text();
      expect(
        html.length,
        `${route} HTML too small: ${html.length} bytes`,
      ).toBeGreaterThan(1024);
      expect(html, `${route} missing <title>`).toMatch(/<title>[^<]+<\/title>/i);

      await page
        .waitForLoadState("networkidle", { timeout: 30_000 })
        .catch(() => undefined);

      for (const re of FALLBACK_TEXTS) {
        const count = await page.getByText(re).count();
        expect(count, `${route} fallback visible: ${re}`).toBe(0);
      }

      const bodyChildren = await page.evaluate(
        () => document.body?.children.length || 0,
      );
      expect(bodyChildren, `${route} empty <body>`).toBeGreaterThan(0);

      const visibleText = (
        await page.evaluate(() => document.body?.innerText || "")
      ).trim();
      expect(
        visibleText.length,
        `${route} no visible text`,
      ).toBeGreaterThan(30);

      expect(
        jsErrors,
        `${route} pageerror:\n${jsErrors.join("\n")}`,
      ).toHaveLength(0);

      const fatal = consoleErrors.filter((m) =>
        /Minified React error|Invariant failed|hydrat|Uncaught/i.test(m),
      );
      expect(
        fatal,
        `${route} fatal console errors:\n${fatal.join("\n")}`,
      ).toHaveLength(0);
    });
  }
});
