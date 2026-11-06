import { test, expect } from "@playwright/test";

/**
 * Bug regression: cookie consent banner must hide immediately after a
 * consent choice (fade-out then unmount) and stay hidden on later loads.
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:8080";

test.beforeEach(async ({ context }) => {
  // Pre-confirm the research gate so the cookie banner is allowed to show.
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        "php_research_confirmed",
        JSON.stringify({ ts: Date.now() })
      );
    } catch { /* ignore */ }
  });
});

test("banner hides on Accept all & continue and stays hidden after reload", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  const banner = page.getByRole("dialog", { name: "Cookie consent" });
  await expect(banner).toBeVisible({ timeout: 8000 });

  await page.getByRole("button", { name: "Accept all & continue" }).click();

  // Banner must go away immediately (no reload).
  await expect(banner).toBeHidden({ timeout: 2000 });

  const stored = await page.evaluate(() =>
    localStorage.getItem("php_cookie_consent")
  );
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored!)).toMatchObject({ analytics: true, marketing: true });

  // Reload — banner must NOT reappear.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000); // past the 1.2s show() delay
  await expect(banner).toBeHidden();
});

test("banner hides on Only necessary and stores essential-only consent", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  const banner = page.getByRole("dialog", { name: "Cookie consent" });
  await expect(banner).toBeVisible({ timeout: 8000 });

  await page.getByRole("button", { name: "Only necessary" }).click();
  await expect(banner).toBeHidden({ timeout: 2000 });

  const stored = await page.evaluate(() =>
    localStorage.getItem("php_cookie_consent")
  );
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored!)).toMatchObject({
    essential: true,
    analytics: false,
    marketing: false,
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await expect(banner).toBeHidden();
});
