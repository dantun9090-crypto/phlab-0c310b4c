/**
 * Regression guard: the public storefront must not remain stuck on the SSR
 * shell. A real browser should boot the interactive legacy store, dismiss the
 * research gate, and open header controls while HTML stays no-store.
 */
import { expect, test } from "@playwright/test";

const BASE = (process.env.TEST_BASE_URL || "https://phlabs.co.uk").replace(/\/+$/, "");
const REAL_CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

test.use({
  userAgent: REAL_CHROME_UA,
  extraHTTPHeaders: {
    "user-agent": REAL_CHROME_UA,
    "accept-language": "en-GB,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
});

test("homepage boots real interactive store, not only SSR shell", async ({ page }) => {
  const documentResponses: Array<{
    url: string;
    status: number;
    cacheControl: string;
    cdnCacheControl: string;
    cfCacheStatus: string;
  }> = [];
  const fatalConsole: string[] = [];

  page.on("response", (res) => {
    if (res.request().resourceType() !== "document") return;
    const headers = res.headers();
    documentResponses.push({
      url: res.url(),
      status: res.status(),
      cacheControl: headers["cache-control"] || "",
      cdnCacheControl: headers["cdn-cache-control"] || headers["cloudflare-cdn-cache-control"] || "",
      cfCacheStatus: (headers["cf-cache-status"] || "").toUpperCase(),
    });
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Minified React error|createRoot\(\)|HYDRATION FALLBACK|removeChild|NotFoundError/i.test(text)) {
      fatalConsole.push(text);
    }
  });

  const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  expect(res?.status(), "homepage status").toBe(200);

  await expect(page.locator("header.site-header")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-phl-app-ready="ssr-home"]')).toHaveCount(0);
  await expect(page.locator(".phl-boot")).toHaveCount(0);

  const gate = page.getByRole("button", { name: /confirm research use/i });
  if (await gate.count()) await gate.first().click();
  const modalCta = page.getByRole("button", { name: /i confirm/i });
  if (await modalCta.count()) await modalCta.first().click();

  await page.getByRole("button", { name: /^Search$/i }).click();
  await expect(page.getByRole("search")).toBeVisible();

  await page.getByRole("button", { name: /open shopping cart/i }).click();
  await expect(page.getByText(/Your cart|shopping cart|cart is empty/i).first()).toBeVisible();

  const firstDoc = documentResponses.find((r) => new URL(r.url).pathname === "/");
  expect(firstDoc, "captured homepage document response").toBeTruthy();
  expect(firstDoc!.cacheControl.toLowerCase(), "browser HTML no-store").toContain("no-store");
  expect(firstDoc!.cdnCacheControl.toLowerCase(), "CDN HTML no-store").toContain("no-store");
  expect(["HIT", "STALE", "REVALIDATED", "UPDATING"]).not.toContain(firstDoc!.cfCacheStatus);
  expect(fatalConsole, fatalConsole.join("\n")).toHaveLength(0);
});

test("homepage hero position does not jump after marketing data refetch", async ({ page }) => {
  const res = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  expect(res?.status(), "homepage status").toBe(200);

  await expect(page.locator("header.site-header")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#hero")).toBeVisible({ timeout: 15_000 });

  const gate = page.getByRole("button", { name: /confirm research use/i });
  if (await gate.count()) await gate.first().click();
  const modalCta = page.getByRole("button", { name: /i confirm/i });
  if (await modalCta.count()) await modalCta.first().click();

  const before = await page.locator("#hero").evaluate((el) => el.getBoundingClientRect().top);
  await page.waitForTimeout(4_500);
  const after = await page.locator("#hero").evaluate((el) => el.getBoundingClientRect().top);

  expect(
    Math.abs(after - before),
    `#hero shifted after async marketing/banner data loaded (before=${before}, after=${after})`,
  ).toBeLessThanOrEqual(16);
});