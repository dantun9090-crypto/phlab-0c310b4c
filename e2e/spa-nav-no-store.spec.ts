/**
 * SPA / MPA navigation no-store guard.
 *
 * The three earlier specs (html-no-store, cf-cache-status,
 * html-no-store-querystrings) verify the response for the FIRST HTML
 * request on a route. This spec walks a real user session with a
 * headless browser and asserts that every HTML document response
 * observed along the way — the initial landing hit, each in-app link
 * click, hard reloads on the destination, and browser back/forward —
 * still comes back with browser revalidation headers and CDN no-store,
 * and that Cloudflare never replays a cached shell
 * (`cf-cache-status ∈ {HIT, STALE, REVALIDATED, UPDATING}`).
 *
 * Rationale: cache regressions have historically appeared only during
 * in-session navigation — e.g. a CF rule that caches a variant of `/`
 * after the first visit, or a Worker that drops no-store on a specific
 * navigation type. Header-only probes (curl/APIRequest) do not exercise
 * that path. This spec drives a real Chromium session end-to-end.
 *
 * Run:
 *   TEST_BASE_URL=https://phlabs.co.uk bunx playwright test \
 *     e2e/spa-nav-no-store.spec.ts --project=chromium
 */
import { test, expect, type Response } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

// The nav path a real visitor might take: home → key content pages →
// back to home. Each entry is a route that MUST return no-store HTML
// whenever the browser fetches it.
const NAV_PATH: string[] = ["/", "/products", "/compound", "/research", "/about", "/"];

const FORBIDDEN_CF_STATUS = new Set(["HIT", "STALE", "REVALIDATED", "UPDATING"]);

type HtmlDocRecord = {
  url: string;
  status: number;
  cacheControl: string;
  cdn: string;
  cfCdn: string;
  surrogate: string;
  cfStatus: string;
  age: number;
  fromDiskCache: boolean;
};

/**
 * Assert one recorded HTML response satisfies every revalidation invariant.
 * Kept as a single helper so the failure message pinpoints which URL
 * along the nav path regressed.
 */
function assertNoStore(rec: HtmlDocRecord, context: string) {
  expect(rec.status, `${context} — status for ${rec.url}`).toBe(200);

  expect(
    rec.cacheControl,
    `${context} — browser cache-control must contain max-age=0 on ${rec.url} ("${rec.cacheControl}")`,
  ).toContain("max-age=0");
  expect(
    rec.cacheControl,
    `${context} — browser cache-control must contain must-revalidate on ${rec.url} ("${rec.cacheControl}")`,
  ).toContain("must-revalidate");

  expect(
    rec.cacheControl,
    `${context} — no positive s-maxage on ${rec.url} ("${rec.cacheControl}")`,
  ).not.toMatch(/s-maxage\s*=\s*[1-9]/);

  expect(
    rec.cacheControl,
    `${context} — no stale-while-revalidate on ${rec.url}`,
  ).not.toContain("stale-while-revalidate");

  const cdnHeader = rec.cdn || rec.cfCdn || rec.surrogate;
  expect(cdnHeader, `${context} — cdn/surrogate-control present on ${rec.url}`).not.toBe("");
  expect(
    cdnHeader,
    `${context} — CDN tier no-store on ${rec.url} ("${cdnHeader}")`,
  ).toContain("no-store");

  expect(
    FORBIDDEN_CF_STATUS.has(rec.cfStatus),
    `${context} — cf-cache-status must not indicate cached-shell replay on ${rec.url} (got "${rec.cfStatus}")`,
  ).toBe(false);

  expect(
    rec.age,
    `${context} — age must be 0 on ${rec.url} (was ${rec.age}, cf="${rec.cfStatus}")`,
  ).toBe(0);

  // A response served from the browser's own disk cache means the
  // previous hit stuck around without revalidation — a browser-tier
  // regression that a header-only probe can't catch.
  expect(
    rec.fromDiskCache,
    `${context} — response must not come from the browser disk cache on ${rec.url}`,
  ).toBe(false);
}

test.describe(`SPA/MPA navigation · revalidated HTML · ${BASE}`, () => {
  test("every HTML document during a full nav session is revalidated", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      // Force a clean session — no leftover disk cache from a prior test.
      // A returning visitor is exercised separately by the reload step below.
      viewport: { width: 1280, height: 1800 },
    });
    const page = await context.newPage();

    const htmlDocs: HtmlDocRecord[] = [];

    // Record every top-level HTML document response. TanStack Router
    // does client-side navigation, so most in-app link clicks won't
    // produce a new document response — we still exercise reloads and
    // back/forward, which force real HTML fetches.
    page.on("response", async (res: Response) => {
      try {
        const req = res.request();
        if (req.resourceType() !== "document") return;
        const url = res.url();
        // Ignore non-app origins (e.g. Cloudflare challenge, third-party
        // redirects) — this spec only guards our own HTML.
        if (!url.startsWith(BASE)) return;

        const h = res.headers();
        const timing = res.request().timing();
        // Playwright doesn't expose a "from disk cache" flag directly;
        // the CDP-level `Network.responseReceived.response.fromDiskCache`
        // is exposed via `securityDetails()` on some engines but not
        // reliably. Approximate: a same-URL response with no network
        // time is served from cache.
        const fromDiskCache =
          timing.responseStart >= 0 &&
          timing.requestStart >= 0 &&
          timing.responseStart - timing.requestStart === 0 &&
          !h["cf-ray"]; // real network responses always carry cf-ray from CF

        htmlDocs.push({
          url,
          status: res.status(),
          cacheControl: (h["cache-control"] || "").toLowerCase(),
          cdn: (h["cdn-cache-control"] || "").toLowerCase(),
          cfCdn: (h["cloudflare-cdn-cache-control"] || "").toLowerCase(),
          surrogate: (h["surrogate-control"] || "").toLowerCase(),
          cfStatus: (h["cf-cache-status"] || "").toUpperCase(),
          age: Number(h["age"] || "0") || 0,
          fromDiskCache,
        });
      } catch {
        // Never let a listener error mask a real assertion failure.
      }
    });

    // 1. Initial landing on `/` — the very first HTML fetch of the session.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

    // 2. Walk the nav path via page.goto (each is a real HTML document
    //    request — a reload-equivalent, which is the strongest
    //    no-store check we can drive from a browser).
    for (const path of NAV_PATH.slice(1)) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    }

    // 3. Hard reload the current page — this is the historical failure
    //    mode ("refresh serves stale HTML"). Must still be no-store.
    await page.reload({ waitUntil: "domcontentloaded" });

    // 4. Browser back/forward — forces the browser to re-request the
    //    previous document. If no-store is honoured, we get a fresh
    //    origin response; if it isn't, we get a bfcache/disk hit.
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.goForward({ waitUntil: "domcontentloaded" });

    await context.close();

    // We must have seen at least one HTML doc per unique nav entry plus
    // the reload + back/forward. If the listener recorded nothing, the
    // test is silently passing — fail loudly instead.
    expect(
      htmlDocs.length,
      `expected multiple HTML document responses, got ${htmlDocs.length}`,
    ).toBeGreaterThanOrEqual(NAV_PATH.length);

    // Every HTML document observed during the session must be no-store.
    for (const rec of htmlDocs) {
      assertNoStore(rec, "nav session");
    }

    // Every distinct route in NAV_PATH must appear at least once.
    const seenPaths = new Set(
      htmlDocs.map((d) => {
        try {
          return new URL(d.url).pathname;
        } catch {
          return d.url;
        }
      }),
    );
    for (const expected of NAV_PATH) {
      expect(
        seenPaths.has(expected),
        `expected an HTML document response for ${expected}, saw: ${[...seenPaths].join(", ")}`,
      ).toBe(true);
    }
  });
});
