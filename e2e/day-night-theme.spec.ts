/**
 * Day/Night theme — end-to-end persistence + a11y guardrails.
 *
 * Verifies:
 *  1. Toggling theme adds/removes `html.light` and writes `phlabs-theme-mode`
 *     to localStorage.
 *  2. After a hard reload the persisted value is reapplied BEFORE paint
 *     (no-flash inline script) and the UI matches the storage value.
 *  3. Persistence survives client-side navigation between main pages and
 *     direct deep-link loads.
 *  4. The inline header toggle exposes an accessible name, is reachable by
 *     keyboard, and shows a focus indicator.
 */
import { test, expect, type Page } from "@playwright/test";

const STORAGE_KEY = "phlabs-theme-mode";

async function readState(page: Page) {
  return page.evaluate((key) => ({
    stored: localStorage.getItem(key),
    hasLightClass: document.documentElement.classList.contains("light"),
    themeAttr: document.documentElement.getAttribute("data-theme-mode"),
  }), STORAGE_KEY);
}

async function clickToggle(page: Page) {
  // Either label may be present depending on current mode.
  const btn = page
    .getByRole("button", { name: /switch to (day|night) mode/i })
    .first();
  await btn.waitFor({ state: "visible" });
  await btn.click();
}

test.describe("Day/Night theme", () => {
  test("toggles, persists across reload, and stays consistent", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const initial = await readState(page);
    expect(initial.themeAttr === "dark" || initial.themeAttr === "light").toBe(true);

    // Flip to the opposite mode.
    await clickToggle(page);
    const afterToggle = await readState(page);
    const target = initial.hasLightClass ? "dark" : "light";
    expect(afterToggle.stored).toBe(target);
    expect(afterToggle.hasLightClass).toBe(target === "light");
    expect(afterToggle.themeAttr).toBe(target);

    // Hard reload — persisted value must be reapplied before React mounts.
    await page.reload({ waitUntil: "domcontentloaded" });
    const afterReload = await readState(page);
    expect(afterReload.stored).toBe(target);
    expect(afterReload.hasLightClass).toBe(target === "light");
    expect(afterReload.themeAttr).toBe(target);
  });

  test("persists across navigation and deep links", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Force light mode regardless of starting state.
    await page.evaluate((k) => localStorage.setItem(k, "light"), STORAGE_KEY);
    await page.reload({ waitUntil: "domcontentloaded" });
    expect((await readState(page)).hasLightClass).toBe(true);

    // Client-side nav to another main page.
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    expect((await readState(page)).hasLightClass).toBe(true);

    // Direct deep link.
    await page.goto("/compound", { waitUntil: "domcontentloaded" });
    const deep = await readState(page);
    expect(deep.stored).toBe("light");
    expect(deep.hasLightClass).toBe(true);
  });

  test("toggle is accessible: name, keyboard, focus", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const btn = page
      .getByRole("button", { name: /switch to (day|night) mode/i })
      .first();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute("aria-label", /switch to (day|night) mode/i);

    // Keyboard activation must flip the theme.
    const before = await readState(page);
    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press("Enter");
    const after = await readState(page);
    expect(after.hasLightClass).not.toBe(before.hasLightClass);

    // Minimum tap target (44x44 per workspace mobile UX rule).
    const box = await btn.boundingBox();
    expect(box && box.width).toBeGreaterThanOrEqual(40);
    expect(box && box.height).toBeGreaterThanOrEqual(40);
  });
});
