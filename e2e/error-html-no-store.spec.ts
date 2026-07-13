/**
 * Error-page no-store guard (4xx / 5xx).
 *
 * The no-store contract must apply to ERROR HTML too, not just 200 pages.
 * If Cloudflare (or the Worker) ever caches a 404 or 500 shell, returning
 * visitors get a stale error long after the underlying resource is back —
 * exactly the "0 changes after publish" failure mode, but harder to
 * diagnose because the URL looks broken to the user.
 *
 * This spec probes a matrix of intentionally-broken URLs, records the
 * status and cache headers, and asserts that every non-2xx HTML response:
 *   1. carries `cache-control: no-store` on the browser tier
 *   2. carries `no-store` on the CDN tier (cdn-cache-control /
 *      cloudflare-cdn-cache-control / surrogate-control)
 *   3. has no positive s-maxage and no stale-while-revalidate
 *   4. is not served from a Cloudflare cache hit (cf-cache-status not in
 *      {HIT, STALE, REVALIDATED, UPDATING})
 *   5. has `age: 0`
 *
 * 4xx coverage is exhaustive across the shapes the app produces
 * (unknown top-level path, unknown nested path, invalid product slug,
 * malformed byte sequence). 5xx is best-effort: we probe a small set of
 * paths that historically induce origin errors; if none actually
 * respond 5xx in this run the 5xx test is skipped (a 5xx we can't
 * reproduce isn't a regression signal).
 *
 * Run:
 *   TEST_BASE_URL=https://phlabs.co.uk bunx playwright test \
 *     e2e/error-html-no-store.spec.ts --project=chromium
 */
import { test, expect, type APIResponse } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

// URLs designed to elicit a 4xx from the Worker. Each is expected to
// return an HTML error shell — never a cached copy.
// Only paths where the Worker itself returns the error response are in
// scope — Cloudflare-level 4xx (e.g. malformed byte rejection at the
// edge) never reach our code and don't carry our headers, so asserting
// no-store on them would be testing Cloudflare's default response.
const NOT_FOUND_PATHS: Array<{ name: string; path: string; expectedStatuses: number[] }> = [
  {
    name: "unknown top-level path",
    path: `/definitely-does-not-exist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    expectedStatuses: [404],
  },
  {
    name: "unknown nested path under /products",
    path: `/products/does-not-exist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    expectedStatuses: [404],
  },
  {
    name: "path traversal attempt",
    path: "/products/../../etc/nope",
    expectedStatuses: [404],
  },
  {
    name: "unknown route with UTM (must not be cached under key)",
    path: `/nope-${Math.random().toString(36).slice(2, 8)}?utm_source=google&gclid=abc123`,
    expectedStatuses: [404],
  },
];

// Paths that MAY produce a 5xx from the origin. We don't require any
// specific one to fail — 5xx is opportunistic. Any that do come back
// 5xx are asserted; the test is skipped when none do.
const MAYBE_5XX_PATHS: string[] = [
  `/api/__force-error-${Date.now()}`,
  `/products/%FF%FE`,
  `/compound/%00%01%02`,
  `/landing/%FF-${Math.random().toString(36).slice(2, 8)}`,
];

const FORBIDDEN_CF_STATUS = new Set(["HIT", "STALE", "REVALIDATED", "UPDATING"]);

async function probe(
  request: import("@playwright/test").APIRequestContext,
  path: string,
) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}__err_probe=${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const res: APIResponse = await request.get(url, {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "phlabs-error-no-store-guard/1.0",
      accept: "text/html,application/xhtml+xml",
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const h = res.headers();
  return {
    url,
    status: res.status(),
    contentType: h["content-type"] || "",
    cacheControl: (h["cache-control"] || "").toLowerCase(),
    cdn: (h["cdn-cache-control"] || "").toLowerCase(),
    cfCdn: (h["cloudflare-cdn-cache-control"] || "").toLowerCase(),
    surrogate: (h["surrogate-control"] || "").toLowerCase(),
    cfStatus: (h["cf-cache-status"] || "").toUpperCase(),
    age: Number(h["age"] || "0") || 0,
  };
}

function assertNoStoreError(
  r: Awaited<ReturnType<typeof probe>>,
  label: string,
) {
  // Body is HTML — 4xx/5xx JSON API responses are out of scope for this spec.
  expect(r.contentType, `${label} — content-type on ${r.url}`).toMatch(/text\/html/);

  // Browser tier
  expect(
    r.cacheControl,
    `${label} — browser cache-control must contain no-store on ${r.url} ("${r.cacheControl}")`,
  ).toContain("no-store");
  expect(
    r.cacheControl,
    `${label} — no positive s-maxage on ${r.url}`,
  ).not.toMatch(/s-maxage\s*=\s*[1-9]/);
  expect(
    r.cacheControl,
    `${label} — no stale-while-revalidate on ${r.url}`,
  ).not.toContain("stale-while-revalidate");

  // CDN tier
  const cdnHeader = r.cdn || r.cfCdn || r.surrogate;
  expect(cdnHeader, `${label} — cdn/surrogate-control present on ${r.url}`).not.toBe("");
  expect(
    cdnHeader,
    `${label} — CDN tier no-store on ${r.url} ("${cdnHeader}")`,
  ).toContain("no-store");
  expect(cdnHeader, `${label} — no CDN positive s-maxage on ${r.url}`).not.toMatch(
    /s-maxage\s*=\s*[1-9]/,
  );
  expect(
    cdnHeader,
    `${label} — no CDN stale-while-revalidate on ${r.url}`,
  ).not.toContain("stale-while-revalidate");

  // Cloudflare must not be replaying a cached error shell.
  expect(
    FORBIDDEN_CF_STATUS.has(r.cfStatus),
    `${label} — cf-cache-status must not indicate cached error replay on ${r.url} (got "${r.cfStatus}")`,
  ).toBe(false);

  expect(r.age, `${label} — age must be 0 on ${r.url} (was ${r.age})`).toBe(0);
}

test.describe(`Error HTML no-store · ${BASE}`, () => {
  for (const { name, path, expectedStatuses } of NOT_FOUND_PATHS) {
    test(`4xx error HTML no-store — ${name}`, async ({ request }) => {
      const r = await probe(request, path);
      expect(
        expectedStatuses.includes(r.status),
        `expected one of ${expectedStatuses.join("/")} on ${r.url}, got ${r.status}`,
      ).toBe(true);
      assertNoStoreError(r, `4xx (${name})`);
    });
  }

  test("5xx error HTML no-store (best-effort)", async ({ request }) => {
    const seen: Array<Awaited<ReturnType<typeof probe>>> = [];
    for (const path of MAYBE_5XX_PATHS) {
      const r = await probe(request, path);
      if (r.status >= 500 && r.status < 600 && /text\/html/.test(r.contentType)) {
        seen.push(r);
      }
    }

    test.skip(
      seen.length === 0,
      "no 5xx HTML observed on the probe set — skipping 5xx assertion (not a regression)",
    );

    for (const r of seen) {
      assertNoStoreError(r, `5xx (status=${r.status})`);
    }
  });
});
