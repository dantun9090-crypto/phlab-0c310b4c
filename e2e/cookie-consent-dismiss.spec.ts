import { test, expect } from "@playwright/test";

/**
 * Bug regression: cookie consent banner must hide immediately after
 * Accept All and stay hidden on subsequent loads while consent is stored.
 */
test("cookie banner hides on accept and stays hidden after reload", async ({ page, context }) => {
  const baseURL = process.env.SMOKE_BASE_URL || "http://localhost:8080";

  // Pre-confirm the research gate so the cookie banner is allowed to show.
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        "php_research_confirmed",
        JSON.stringify({ ts: Date.now() })
      );
    } catch { /* ignore */ }
  });

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  const banner = page.getByRole("dialog", { name: "Cookie consent" });
  await expect(banner).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: "Accept All" }).click();

  // Banner must go away immediately (no reload).
  await expect(banner).toBeHidden({ timeout: 2000 });

  // Consent stored.
  const stored = await page.evaluate(() =>
    localStorage.getItem("php_cookie_consent")
  );
  expect(stored).toBeTruthy();

  // Reload — banner must NOT reappear.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500); // past the 600ms show() delay
  await expect(banner).toBeHidden();
});
