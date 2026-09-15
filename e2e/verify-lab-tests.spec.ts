/**
 * Smoke test for the public lab-test verification page `/verify`.
 *
 * Covers the three modes plus the "hidden batch" path. Rows that are not
 * published (`is_public = false`) are invisible to anonymous visitors because
 * of the RLS policy, so an unknown/hidden batch must show the friendly
 * "no test found" card rather than an error.
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.VERIFY_BASE_URL || process.env.TEST_BASE_URL || "http://localhost:8080";

test.describe("/verify", () => {
  test("search mode lists shop products", async ({ page }) => {
    const res = await page.goto(`${BASE}/verify`, { waitUntil: "domcontentloaded" });
    expect(res?.ok(), `GET /verify returned ${res?.status()}`).toBeTruthy();

    await expect(page.getByRole("heading", { name: "Lab Test Verification" })).toBeVisible();
    await expect(page.getByLabel("Search lab tests by product or batch code")).toBeVisible();
    await expect(page.getByRole("link", { name: /Tirzepatide/i }).first()).toBeVisible();
    await expect(
      page.getByText("For Research Use Only. Not for Human Consumption.", { exact: false }).first(),
    ).toBeVisible();
  });

  test("unknown or hidden batch shows a friendly notice", async ({ page }) => {
    await page.goto(`${BASE}/verify?batch=DOES-NOT-EXIST-0001`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("No test found for this batch")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Contact us" })).toBeVisible();
  });

  test("product mode renders a heading for the requested product", async ({ page }) => {
    await page.goto(`${BASE}/verify?product=TIRZEPATIDE`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Tirzepatide/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
