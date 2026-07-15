/**
 * End-to-end regression: RETURNING USER, POST-DEPLOY, NO HARD REFRESH.
 *
 * Reproduces the exact production bug we hit repeatedly on phlabs.co.uk:
 *   A visitor who has been to the site before (non-incognito) hits the
 *   site after we ship a new deploy and gets served a stale HTML shell —
 *   old script chunks, 404s, broken layout — until they hard-refresh.
 *
 * This test simulates that returning-visitor state deterministically and
 * proves the cache/SW contract holds so the fresh HTML wins on a NORMAL
 * navigation (no Ctrl+Shift+R, no devtools "disable cache").
 *
 * Flow:
 *   1. First visit — capture the current build's HTML.
 *   2. Simulate "returning user with stale artifacts":
 *        - seed Cache Storage with a fake stale HTML shell for "/" that
 *          contains an obvious OLD_BUILD_MARKER,
 *        - register the real /sw.js the site ships (must be the kill
 *          switch — it should immediately unregister + purge caches),
 *        - seed localStorage with an old build id.
 *   3. Reload the page as a normal navigation (NOT { waitUntil: reload,
 *      cache: no-cache } — plain goto, which is what a real returning
 *      user does when they click a bookmark).
 *   4. Assert:
 *        a) Response headers are the deploy-safe HTML contract:
 *           Cache-Control includes no-store (or max-age=0, must-revalidate)
 *           AND CDN-Cache-Control / Surrogate-Control forces no-store
 *           AND cf-cache-status is not a replay (HIT/STALE/REVALIDATED).
 *        b) The rendered document does NOT contain OLD_BUILD_MARKER —
 *           i.e. no SW / Cache Storage served the stale shell.
 *        c) No Service Worker ends up controlling the page (kill switch
 *           actually took effect).
 *        d) Cache Storage was emptied by the kill switch.
 *        e) Exactly one main-frame navigation + one load event — no
 *           silent location.reload() loop was required to recover.
 *        f) A real content h1 is visible and no "please refresh" /
 *           recovery wall is shown.
 *
 * Diagnostics for CI triage are written to
 *   test-results/returning-user-post-deploy/summary.json
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE =
  process.env.CACHE_STABILITY_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

const OLD_BUILD_MARKER = "__PHLABS_STALE_SHELL_FROM_PREVIOUS_DEPLOY__";
const DIAG_DIR = join(process.cwd(), "test-results", "returning-user-post-deploy");

type DocumentHeaders = {
  cacheControl?: string;
  cdnCacheControl?: string;
  surrogateControl?: string;
  cfCacheStatus?: string;
  age?: string;
};

function validateHtmlCacheContract(h: DocumentHeaders): string | null {
  const cc = (h.cacheControl || "").toLowerCase();
  if (!cc) return "missing Cache-Control";
  const maxAgeMatch = cc.match(/(?:^|,\s*)max-age\s*=\s*(\d+)/);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : null;
  const revalidated = /must-revalidate/.test(cc);
  const noStore = cc.includes("no-store");
  const browserOk = noStore || (maxAge === 0 && revalidated);
  if (!browserOk) return `browser Cache-Control unsafe for HTML: ${h.cacheControl}`;

  const cdn = (h.cdnCacheControl || h.surrogateControl || "").toLowerCase();
  if (!cdn.includes("no-store")) return `CDN cache header must be no-store, got: ${h.cdnCacheControl || h.surrogateControl || "(missing)"}`;

  const cf = (h.cfCacheStatus || "").toUpperCase();
  if (["HIT", "STALE", "REVALIDATED", "UPDATING"].includes(cf)) {
    return `Cloudflare replayed stale HTML: cf-cache-status=${cf}`;
  }
  return null;
}

test.describe("returning user, post-deploy: fresh HTML without hard refresh", () => {
  test.beforeAll(() => mkdirSync(DIAG_DIR, { recursive: true }));

  test("normal navigation after a deploy serves the current document", async ({ browser }, testInfo) => {
    // Isolated persistent-like context — mimics a real returning visitor's
    // profile (has SW registration, Cache Storage, localStorage) rather
    // than the fresh incognito state Playwright defaults to.
    const context = await browser.newContext();
    const page = await context.newPage();

    // ---- 1. First visit (populate normal browser state) ----
    const firstResp = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    expect(firstResp, "first visit response").not.toBeNull();
    expect(firstResp!.status(), "first visit HTTP status").toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible();

    // ---- 2. Simulate a stale returning-visitor state ----
    // 2a. Seed Cache Storage with a fake shell for "/".
    await page.evaluate(async ({ base, marker }) => {
      const cache = await caches.open("phlabs-stale-precache-v1");
      const lkgCache = await caches.open("phlabs-lkg-v1");
      const staleBody = `<!doctype html><html><head><title>${marker}</title></head><body><h1>${marker}</h1><script>window.__PHLABS_STALE__=true;</script></body></html>`;
      const staleResponse = new Response(staleBody, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      await cache.put(
        new Request(`${base}/`, { method: "GET" }),
        staleResponse.clone(),
      );
      await lkgCache.put(new Request(`${base}/`, { method: "GET" }), staleResponse.clone());
      // 2b. Seed localStorage with an "old build" marker.
      window.localStorage.setItem("phlabs.buildId", "old-build-0000000");
    }, { base: BASE, marker: OLD_BUILD_MARKER });

    // 2c. Try registering the site's own /sw.js. It MUST be the kill
    //     switch — it should immediately unregister and purge caches.
    //     If the endpoint isn't served, that's also fine (means no SW
    //     ever existed, so no returning user can be poisoned by one).
    const swRegistered = await page.evaluate(async ({ base }) => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      try {
        const reg = await navigator.serviceWorker.register(`${base}/sw.js`);
        // Wait briefly for install/activate — kill switch may unregister itself.
        await new Promise((r) => setTimeout(r, 1500));
        return reg ? "registered" : "no-reg";
      } catch (err) {
        return `error:${(err as Error).message}`;
      }
    }, { base: BASE });

    // ---- 3. Normal returning-user navigation ----
    // Plain goto — NOT a bypass-cache reload. This is what a real user
    // does when they click their bookmark / a Google result.
    let loadCount = 0;
    let navCount = 0;
    let respHeaders: DocumentHeaders = {};
    let respStatus: number | undefined;
    const consoleErrors: string[] = [];
    const documentGets: string[] = [];

    page.on("load", () => { loadCount += 1; });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navCount += 1;
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("request", (req) => {
      if (req.resourceType() === "document" && req.method() === "GET") {
        documentGets.push(req.url());
      }
    });
    page.on("response", (res) => {
      if (res.request().resourceType() !== "document") return;
      if (respHeaders.cacheControl !== undefined) return;
      const h = res.headers();
      respHeaders = {
        cacheControl: h["cache-control"],
        cdnCacheControl: h["cdn-cache-control"] || h["cloudflare-cdn-cache-control"],
        surrogateControl: h["surrogate-control"],
        cfCacheStatus: h["cf-cache-status"],
        age: h["age"],
      };
      respStatus = res.status();
    });

    loadCount = 0;
    navCount = 0;
    const returnResp = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    expect(returnResp, "returning-visitor response").not.toBeNull();

    // Give the kill-switch SW + any client-side settle time.
    await page.waitForTimeout(4000);

    // ---- 4. Post-navigation observations ----
    const html = await page.content();
    const controllerInfo = await page.evaluate(async () => {
      const ctrl = navigator.serviceWorker?.controller
        ? { scriptURL: navigator.serviceWorker.controller.scriptURL, state: navigator.serviceWorker.controller.state }
        : null;
      const regs = "serviceWorker" in navigator
        ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "(unknown)")
        : [];
      const cacheKeys = "caches" in window ? await caches.keys() : [];
      const oldBuildId = window.localStorage.getItem("phlabs.buildId");
      return { controller: ctrl, registrations: regs, cacheKeys, oldBuildId };
    });

    const cacheContractError = validateHtmlCacheContract(respHeaders);

    const diag = {
      base: BASE,
      firstVisitStatus: firstResp!.status(),
      returnVisit: {
        status: respStatus,
        headers: respHeaders,
        cacheContractError,
      },
      swRegistrationResult: swRegistered,
      afterReturn: controllerInfo,
      loadCount,
      navCount,
      documentGets,
      consoleErrors,
      staleMarkerLeaked: html.includes(OLD_BUILD_MARKER),
      timestamp: new Date().toISOString(),
    };
    const diagPath = join(DIAG_DIR, "summary.json");
    writeFileSync(diagPath, JSON.stringify(diag, null, 2));
    await testInfo.attach("returning-user-post-deploy", {
      path: diagPath,
      contentType: "application/json",
    });

    // 4a. Cache-Control contract — the whole point of this test.
    expect(cacheContractError, `HTML cache contract broken: ${cacheContractError}`).toBeNull();
    expect(respStatus, "returning visit HTTP status").toBeLessThan(400);

    // 4b. Stale shell we seeded must NOT be what the user sees.
    expect(
      html.includes(OLD_BUILD_MARKER),
      "returning user was served the stale precached shell — SW/Cache Storage overrode the network response",
    ).toBe(false);

    // 4c. No Service Worker should end up controlling the page. Site
    //     ships /sw.js as a kill switch; if a controller remains, the
    //     next deploy WILL get intercepted.
    expect(
      controllerInfo.controller,
      `a Service Worker is controlling the page after kill-switch: ${JSON.stringify(controllerInfo.controller)}`,
    ).toBeNull();
    expect(
      controllerInfo.registrations,
      `Service Worker registrations survived kill-switch: ${controllerInfo.registrations.join(", ")}`,
    ).toHaveLength(0);

    // 4d. Kill switch must empty Cache Storage — including the stale
    //     shell we seeded above.
    expect(
      controllerInfo.cacheKeys,
      `Cache Storage still populated after kill-switch: ${controllerInfo.cacheKeys.join(", ")}`,
    ).toHaveLength(0);

    // 4e. Exactly one navigation + load — no silent reload loop was
    //     required to recover from the stale state.
    expect(loadCount, `${loadCount} load events on return visit (expected 1) — hard refresh / reload loop`).toBeLessThanOrEqual(1);
    expect(navCount, `${navCount} main-frame navigations on return visit (expected 1) — reload loop`).toBeLessThanOrEqual(1);
    expect(documentGets.length, `${documentGets.length} document GETs on return visit (expected 1)`).toBeLessThanOrEqual(1);

    // 4f. Real content + no recovery wall.
    await expect(page.locator("h1").first()).toBeVisible();
    for (const re of [/Please refresh/i, /Update available/i, /Refresh needed/i, /Something went wrong/i]) {
      await expect(page.getByText(re), `recovery wall visible: ${re}`).toHaveCount(0);
    }

    await context.close();
  });

  test("cache reset route clears stale local browser state and opens fresh store", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async ({ base, marker }) => {
      const cache = await caches.open("phlabs-lkg-v1");
      await cache.put(
        new Request(`${base}/`, { method: "GET" }),
        new Response(`<html><body><h1>${marker}</h1></body></html>`, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
      localStorage.setItem("phlabs.buildId", "old-build-0000000");
      sessionStorage.setItem("__phl_hard_reload_in_flight", "1");
    }, { base: BASE, marker: OLD_BUILD_MARKER });

    const resetResp = await page.goto(`${BASE}/cache-reset?next=/`, { waitUntil: "domcontentloaded" });
    expect(resetResp, "cache reset response").not.toBeNull();
    expect(resetResp!.status(), "cache reset HTTP status").toBeLessThan(400);
    await page.waitForURL(`${BASE}/`, { timeout: 10000 });
    await expect(page.locator("h1").first()).toBeVisible();

    const state = await page.evaluate(async () => ({
      cacheKeys: "caches" in window ? await caches.keys() : [],
      oldBuildId: localStorage.getItem("phlabs.buildId"),
      hardReloadFlag: sessionStorage.getItem("__phl_hard_reload_in_flight"),
      text: document.body.innerText,
    }));

    expect(state.cacheKeys, `Cache Storage still populated after /cache-reset: ${state.cacheKeys.join(", ")}`).toHaveLength(0);
    expect(state.oldBuildId).toBeNull();
    expect(state.hardReloadFlag).toBeNull();
    expect(state.text).not.toContain(OLD_BUILD_MARKER);
    for (const re of [/Please refresh/i, /Update available/i, /Refresh needed/i, /Something went wrong/i]) {
      await expect(page.getByText(re), `recovery wall visible after reset: ${re}`).toHaveCount(0);
    }

    await context.close();
  });
});
