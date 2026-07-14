/**
 * HTML cache revalidation regression.
 *
 * Focused guard: every human-facing HTML route MUST serve
 * `cache-control: public, max-age=0, must-revalidate` on the browser tier and
 * no-store on the CDN tier so a fresh publish is never masked by stale HTML.
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
  "/peptide-calculator",
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

      // Browser tier — store is allowed, reuse without revalidation is not.
      expect(
        h.cacheControl,
        `browser cache-control max-age=0 on ${path} ("${h.cacheControl}")`,
      ).toContain("max-age=0");
      expect(
        h.cacheControl,
        `browser cache-control must-revalidate on ${path} ("${h.cacheControl}")`,
      ).toContain("must-revalidate");

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
