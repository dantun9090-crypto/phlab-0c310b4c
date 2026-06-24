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
 *   3. The document response for the route returns a sane Cache-Control
 *      header: must NOT be `no-store`, must include either a finite
 *      `max-age` (>0, ≤1h) or `stale-while-revalidate`.
 *   4. The hero H1 is still visible at the end of the window — the
 *      latest content is being served, not a blank shell.
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

function validateCacheControl(header: string | undefined): string | null {
  if (!header) return "missing Cache-Control header";
  const h = header.toLowerCase();
  if (h.includes("no-store")) return `forbidden directive: no-store (${header})`;
  const maxAgeMatch = h.match(/(?:^|,\s*)max-age\s*=\s*(\d+)/);
  const hasSwr = /stale-while-revalidate\s*=\s*\d+/.test(h);
  if (!maxAgeMatch && !hasSwr) {
    return `must include max-age or stale-while-revalidate (${header})`;
  }
  if (maxAgeMatch) {
    const v = Number(maxAgeMatch[1]);
    if (v <= 0) return `max-age must be > 0 (${header})`;
    if (v > 3600 && !hasSwr) {
      return `max-age ${v}s > 3600s without stale-while-revalidate (${header})`;
    }
  }
  return null;
}

test.describe("cache stability — page must not auto-refresh", () => {
  test.beforeAll(() => {
    mkdirSync(DIAG_DIR, { recursive: true });
  });

  for (const path of ["/compound", "/research", "/"]) {
    test(`${path} stays put for ${OBSERVATION_MS / 1000}s after load`, async ({ page }, testInfo) => {
      const documentUrl = `${BASE}${path}`;
      const getLog: GetLogEntry[] = [];
      const documentGets: GetLogEntry[] = [];
      const consoleErrors: string[] = [];
      let loadCount = 0;
      let unloadCount = 0;
      let primaryCacheControl: string | undefined;
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
        if (url === target && primaryCacheControl === undefined) {
          primaryCacheControl = res.headers()["cache-control"];
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
      const cacheControlError = validateCacheControl(primaryCacheControl);

      const diag = {
        route: path,
        baseUrl: BASE,
        observedMs: Date.now() - startedAt,
        loadCount,
        navigationCount: unloadCount,
        primaryDocument: {
          url: documentUrl,
          status: primaryStatus,
          cacheControl: primaryCacheControl,
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
      expect(
        loadCount,
        `${path}: detected ${loadCount} load events (expected 1) — page is auto-refreshing`,
      ).toBeLessThanOrEqual(1);
      expect(
        unloadCount,
        `${path}: detected ${unloadCount} main-frame navigations (expected 1) — refresh loop`,
      ).toBeLessThanOrEqual(1);

      // 2. No repeated top-level GETs to the same document URL.
      expect(
        documentGets.length,
        `${path}: ${documentGets.length} document GETs (expected 1) — repeated navigation`,
      ).toBeLessThanOrEqual(1);
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
    });
  }
});
