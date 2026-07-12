/**
 * E2E: simulate a stale BUILD_ID and assert the cache guard hard-reloads
 * the page with the `?_bust=<newid>` query string, purges localStorage,
 * and re-stores the fresh build id.
 *
 * Runs against the live pre-rendered site — the guard is inlined into the
 * SSR HTML, so we need a real network response to exercise it.
 */
import { test, expect } from "@playwright/test";

const TARGET = process.env.PHLABS_E2E_BASE_URL || "https://phlabs.co.uk";
const KEY = "phlabs_build_id_v3";
const STALE = "stale-build-000000";

test("cache guard reloads with ?_bust= when BUILD_ID changes", async ({
  page,
}) => {
  // First visit: hydrate + let the guard write the current BUILD_ID.
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  const currentBuildId = await page.evaluate((k) => localStorage.getItem(k), KEY);
  expect(currentBuildId, "guard should store BUILD_ID on first paint").toBeTruthy();
  expect(currentBuildId).not.toBe(STALE);

  // Poison localStorage with a stale build id + a stray key that MUST be
  // purged when the guard detects the mismatch.
  await page.evaluate(
    ([k, stale]) => {
      localStorage.setItem(k, stale);
      localStorage.setItem("phl_should_be_purged", "1");
    },
    [KEY, STALE] as const,
  );

  // Reload — the guard sees mismatched BUILD_ID → hard-redirects to
  // `?_bust=<currentBuildId>&_t=<ts>`.
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });

  // The location.replace() inside the guard fires synchronously on parse,
  // so by the time the page fires domcontentloaded a second time the URL
  // must carry `_bust=`.
  const url = page.url();
  expect(url, `expected ?_bust= in ${url}`).toMatch(/[?&]_bust=/);

  // Stray key must be purged; BUILD_ID key must survive and equal fresh id.
  const afterState = await page.evaluate((k) => ({
    build: localStorage.getItem(k),
    stray: localStorage.getItem("phl_should_be_purged"),
  }), KEY);
  expect(afterState.stray, "guard should purge non-guard localStorage keys").toBeNull();
  expect(afterState.build, "guard should restore the fresh BUILD_ID").toBe(currentBuildId);
});
