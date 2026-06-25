/**
 * Route policy contract for /research and /compound.
 *
 * Goal: catch refactors that accidentally turn either route into a redirect
 * (3xx), a 404, or — worse — swap the component the route renders. The legacy
 * react-router splat must keep serving /research with the article page, and
 * the TanStack marketing route must keep serving /compound with PremiumLanding.
 */
import { test, expect, request as pwRequest } from "@playwright/test";

const BASE =
  process.env.ROUTE_POLICY_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

test.describe("route policy: /research", () => {
  test("HTTP 200, no redirect, served by legacy article page", async ({ page }) => {
    const ctx = await pwRequest.newContext();
    const headRes = await ctx.get(`${BASE}/research`, { maxRedirects: 0 }).catch(() => null);
    expect(headRes?.status(), `${BASE}/research must respond 200, not redirect`).toBe(200);
    await ctx.dispose();

    const res = await page.goto(`${BASE}/research`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/research");
    await expect(page.locator('[data-source="legacy-research-page"]')).toBeVisible();
    await expect(page.locator('[data-source="premium-landing"]')).toHaveCount(0);
  });
});

test.describe("route policy: /compound", () => {
  test("HTTP 200, no redirect, served by PremiumLanding", async ({ page }) => {
    const ctx = await pwRequest.newContext();
    const headRes = await ctx.get(`${BASE}/compound`, { maxRedirects: 0 }).catch(() => null);
    expect(headRes?.status(), `${BASE}/compound must respond 200, not redirect`).toBe(200);
    await ctx.dispose();

    const res = await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/compound");
    await expect(page.locator('[data-source="premium-landing"]')).toBeVisible();
    await expect(page.locator('[data-source="legacy-research-page"]')).toHaveCount(0);
  });
});

test.describe("route policy: cross-contamination", () => {
  test("/research and /compound do not share component markers", async ({ page }) => {
    await page.goto(`${BASE}/research`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-source="premium-landing"]')).toHaveCount(0);
    await page.goto(`${BASE}/compound`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-source="legacy-research-page"]')).toHaveCount(0);
  });
});
