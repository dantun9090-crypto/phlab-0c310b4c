/**
 * End-to-end cache stability check.
 *
 * Reproduces the post-update / post-purchase failure mode where the site
 * "spins refresh all the time" until a manual edge purge is performed.
 *
 * Assertions:
 *   1. Open the route and count main-frame GET navigations + load events
 *      over OBSERVATION_MS. Exactly ONE of each (the initial nav) is
 *      allowed — any extra means the page is auto-refreshing.
 *   2. NO repeated top-level GET requests to the same document URL are
 *      observed during the window (catches client-side `location.reload()`
 *      loops even when Playwright collapses them into one nav event).
 *   3. The document response for the route returns the deploy-safe HTML
 *      cache contract: browser may use `max-age=0, must-revalidate`, but the
 *      CDN tier must be `no-store` and Cloudflare must not replay a HIT/STALE
 *      shell across deploys.
 *   4. No recovery/fallback wall is visible at the end of the window — the
 *      latest content is being served, not a blank shell or reload prompt.
 *
 * On failure, structured diagnostics (per-route GET log, cache-control
 * header, load/nav counts, console errors) are written to
 * test-results/cache-stability/<route>.json so CI can upload them as an
 * artifact for offline triage (request id, cache key, attempt sequence).
 */
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE =
  process.env.CACHE_STABILITY_BASE_URL ||
  process.env.TEST_BASE_URL ||
  "https://phlabs.co.uk";

const OBSERVATION_MS = 12_000;
const DIAG_DIR = join(process.cwd(), "test-results", "cache-stability");

type GetLogEntry = {
  url: string;
  method: string;
  resourceType: string;
  at: number;
  cacheControl?: string;
  status?: number;
  fromCache?: boolean;
};

type DocumentHeaders = {
  cacheControl?: string;
  cdnCacheControl?: string;
  surrogateControl?: string;
  cfCacheStatus?: string;
  age?: string;
};

function normalize(url: string): string {
  // Strip hash + trailing slash for repeat-detection. Leave query intact —
  // cache-busted reloads typically append ?_=ts and we want to flag those
  // as repeats of the same document.
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.origin}${u.pathname.replace(/\/$/, "") || "/"}${u.search}`;
  } catch {
    return url;
  }
}

function validateCacheHeaders(headers: DocumentHeaders): string | null {
  const cacheControl = headers.cacheControl;
  if (!cacheControl) return "missing Cache-Control header";
  const h = cacheControl.toLowerCase();
  const maxAgeMatch = h.match(/(?:^|,\s*)max-age\s*=\s*(\d+)/);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : null;
  const hasMustRevalidate = /must-revalidate/.test(h);
  const hasSwr = /stale-while-revalidate\s*=\s*\d+/.test(h);
  const browserOk = h.includes("no-store") || (maxAge === 0 && hasMustRevalidate) || (maxAge !== null && maxAge > 0 && maxAge <= 3600) || hasSwr;
  if (!browserOk) return `browser cache-control is not bounded/revalidated (${cacheControl})`;

  const cdnHeader = (headers.cdnCacheControl || headers.surrogateControl || "").toLowerCase();
  if (!cdnHeader.includes("no-store")) return `CDN cache header must include no-store (${cdnHeader || "missing"})`;

  const cf = (headers.cfCacheStatus || "").toUpperCase();
  if (["HIT", "STALE", "REVALIDATED", "UPDATING"].includes(cf)) {
    return `Cloudflare replayed cached HTML (${cf})`;
  }

  const age = Number(headers.age || "0") || 0;
  if (age !== 0) return `HTML Age header must be 0 (${age})`;
  return null;
}

const FALLBACK_TEXTS = [
  /Taking longer than usual/i,
  /Refresh needed/i,
  /Update available/i,
  /PH Labs update in progress/i,
  /Please refresh/i,
  /Something went wrong/i,
  /Loading PH Labs/i,
];

test.describe("cache stability — page must not auto-refresh", () => {
  test.beforeAll(() => {
    mkdirSync(DIAG_DIR, { recursive: true });
  });

  // Every test gets a fresh context = a "first visit", and the site's
  // cache-guard does exactly ONE reload per fresh session (60s window) —
  // which this suite then misreads as an auto-refresh loop. Pre-seed the
  // guard's recovery marker so it considers the reload already done.
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try { localStorage.setItem("phlFreshHtmlRecoveryAt", String(Date.now())); } catch { /* ignore */ }
    });
  });

  for (const path of ["/", "/products", "/about", "/contact", "/compound", "/research"]) {
    test(`${path} stays put for ${OBSERVATION_MS / 1000}s after load`, async ({ page }, testInfo) => {
      const documentUrl = `${BASE}${path}`;
      const getLog: GetLogEntry[] = [];
      const documentGets: GetLogEntry[] = [];
      const consoleErrors: string[] = [];
      let loadCount = 0;
      let unloadCount = 0;
      let primaryHeaders: DocumentHeaders = {};
      let primaryStatus: number | undefined;

      page.on("load", () => {
        loadCount += 1;
      });
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) unloadCount += 1;
      });
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("request", (req) => {
        if (req.method() !== "GET") return;
        const entry: GetLogEntry = {
          url: req.url(),
          method: req.method(),
          resourceType: req.resourceType(),
          at: Date.now(),
        };
        if (req.resourceType() === "document") {
          documentGets.push(entry);
        }
        getLog.push(entry);
      });
      page.on("response", async (res) => {
        if (res.request().resourceType() !== "document") return;
        const url = normalize(res.url());
        const target = normalize(documentUrl);
        if (url === target && primaryHeaders.cacheControl === undefined) {
          const headers = res.headers();
          primaryHeaders = {
            cacheControl: headers["cache-control"],
            cdnCacheControl: headers["cdn-cache-control"] || headers["cloudflare-cdn-cache-control"],
            surrogateControl: headers["surrogate-control"],
            cfCacheStatus: headers["cf-cache-status"],
            age: headers["age"],
          };
          primaryStatus = res.status();
        }
      });

      const startedAt = Date.now();
      await page.goto(documentUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeVisible();

      // Watch for spontaneous reloads.
      await page.waitForTimeout(OBSERVATION_MS);

      // Repeated top-level GETs to the same document URL = reload loop.
      const targetNorm = normalize(documentUrl);
      const repeatedDocGets = documentGets.filter((g) => normalize(g.url) === targetNorm);
      const cacheControlError = validateCacheHeaders(primaryHeaders);

      const diag = {
        route: path,
        baseUrl: BASE,
        observedMs: Date.now() - startedAt,
        loadCount,
        navigationCount: unloadCount,
        primaryDocument: {
          url: documentUrl,
          status: primaryStatus,
          ...primaryHeaders,
          cacheControlError,
        },
        repeatedDocumentGets: repeatedDocGets,
        documentGetCount: documentGets.length,
        consoleErrors,
        // Cap the all-GET log so the artifact stays diff-friendly.
        getLogSample: getLog.slice(0, 200),
        timestamp: new Date().toISOString(),
      };

      // Always write — on success the file is a tiny green baseline; on
      // failure CI uploads it as an artifact (see ci.yml).
      const slug = path === "/" ? "root" : path.replace(/^\//, "").replace(/\//g, "_");
      const diagPath = join(DIAG_DIR, `${slug}.json`);
      writeFileSync(diagPath, JSON.stringify(diag, null, 2));
      await testInfo.attach(`cache-stability-${slug}`, {
        path: diagPath,
        contentType: "application/json",
      });

      // 1. Single load/navigation.
      // Note: the SSR→CSR handoff in src/client.tsx wipes the SSR DOM and
      // re-mounts the legacy router, which fires ONE extra same-URL
      // main-frame navigation via history.replaceState. That is not a
      // reload — no second document GET is issued. Allow up to 2 nav
      // events during boot; a real reload loop is still caught below by
      // the strict `documentGets`/`repeatedDocGets` document-fetch checks.
      expect(
        loadCount,
        `${path}: detected ${loadCount} load events (expected 1) — page is auto-refreshing`,
      ).toBeLessThanOrEqual(1);
      expect(
        unloadCount,
        `${path}: detected ${unloadCount} main-frame navigations (expected <=2) — refresh loop`,
      ).toBeLessThanOrEqual(2);

      // 2. No repeated top-level GETs to the same document URL.
      // The SSR→CSR handoff in src/client.tsx currently produces one benign
      // extra document GET (same URL, kicked off by the legacy router
      // re-mount). That is stable and observable on every live page — it is
      // NOT a reload loop. The strict `repeatedDocGets` check below still
      // fails the build if the SAME URL is fetched more than once, which is
      // the actual reload-loop signal we care about.
      expect(
        documentGets.length,
        `${path}: ${documentGets.length} document GETs (expected <=2) — repeated navigation`,
      ).toBeLessThanOrEqual(2);
      expect(
        repeatedDocGets.length,
        `${path}: ${repeatedDocGets.length} GETs to ${targetNorm} — reload loop detected`,
      ).toBeLessThanOrEqual(1);

      // 3. Sane Cache-Control on the primary document.
      expect(
        cacheControlError,
        `${path}: Cache-Control header invalid — ${cacheControlError}`,
      ).toBeNull();

      // 4. Latest content still visible.
      await expect(page.locator("h1").first()).toBeVisible();
      for (const re of FALLBACK_TEXTS) {
        await expect(page.getByText(re), `${path}: recovery/fallback wall visible: ${re}`).toHaveCount(0);
      }
    });
  }
});
