/**
 * HTML no-store regression.
 *
 * Focused guard: every human-facing HTML route MUST serve
 * `cache-control: no-store` on both the browser tier and the CDN tier so
 * that a fresh publish is never masked by a stale Cloudflare HTML shell.
 *
 * This is intentionally narrower than cache-headers-regression.spec.ts:
 * it fails loudly on the single symptom the user reports ("0 zmian /
 * cache blokuje") — HTML that is not `no-store`.
 *
 * Run:
 *   TEST_BASE_URL=https://phlabs.co.uk bunx playwright test \
 *     e2e/html-no-store.spec.ts --project=chromium
 */
import { test, expect, type APIResponse } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

const HTML_ROUTES = [
  "/",
  "/products",
  "/compound",
  "/research",
  "/resources",
  "/about",
  "/contact",
  "/downloads",
  "/landing/phlabs",
];

const NEVER_CF_HIT = ["HIT", "REVALIDATED", "STALE", "UPDATING"];

function bust(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${sep}__nostore_check=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchHeaders(
  request: import("@playwright/test").APIRequestContext,
  path: string,
) {
  const res: APIResponse = await request.get(bust(path), {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const h = res.headers();
  return {
    status: res.status(),
    cacheControl: (h["cache-control"] || "").toLowerCase(),
    cdn: (h["cdn-cache-control"] || h["cloudflare-cdn-cache-control"] || "").toLowerCase(),
    surrogate: (h["surrogate-control"] || "").toLowerCase(),
    cfStatus: (h["cf-cache-status"] || "").toUpperCase(),
    age: Number(h["age"] || "0") || 0,
    contentType: h["content-type"] || "",
  };
}

test.describe(`HTML no-store · ${BASE}`, () => {
  for (const path of HTML_ROUTES) {
    test(`no-store on ${path}`, async ({ request }) => {
      const h = await fetchHeaders(request, path);

      expect(h.status, `status for ${path}`).toBe(200);
      expect(h.contentType, `content-type for ${path}`).toMatch(/text\/html/);

      // Browser tier
      expect(
        h.cacheControl,
        `browser cache-control no-store on ${path} ("${h.cacheControl}")`,
      ).toContain("no-store");

      // CDN tier — surrogate or cdn-cache-control MUST also be no-store
      const cdnHeader = h.cdn || h.surrogate;
      expect(cdnHeader, `cdn/surrogate-control present on ${path}`).not.toBe("");
      expect(
        cdnHeader,
        `cdn/surrogate-control no-store on ${path} ("${cdnHeader}")`,
      ).toContain("no-store");

      // Belt-and-braces: no s-maxage on HTML
      expect(h.cacheControl).not.toMatch(/s-maxage\s*=\s*[1-9]/);
      expect(h.cdn).not.toMatch(/s-maxage\s*=\s*[1-9]/);

      // Cloudflare must not be replaying a cached shell
      expect(NEVER_CF_HIT, `cf-cache-status (${h.cfStatus}) on ${path}`).not.toContain(h.cfStatus);
      expect(h.age, `age must be 0 on ${path} (was ${h.age})`).toBe(0);
    });
  }
});
