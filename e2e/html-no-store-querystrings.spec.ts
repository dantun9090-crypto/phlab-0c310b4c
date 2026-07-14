/**
 * HTML no-store guard for query-string variants.
 *
 * Sister spec to e2e/html-no-store.spec.ts and e2e/cf-cache-status.spec.ts.
 *
 * Cloudflare cache rules can silently key on the raw URL and start caching
 * an HTML shell when common marketing query strings appear (utm_*, gclid,
 * fbclid, ref, mc_cid, gad_source, msclkid, …). If a rule regression ever
 * strips no-store — or CF starts caching a variant of `/` under a UTM key
 * — a returning visitor would land on a stale shell that references
 * evicted hashed chunks (the "blank page after publish" incident).
 *
 * This spec probes each public HTML route with a matrix of realistic
 * query strings and asserts:
 *   1. `cache-control` on the browser tier contains `max-age=0` and `must-revalidate`
 *   2. the CDN tier (`cdn-cache-control` / `cloudflare-cdn-cache-control`
 *      / `surrogate-control`) also contains `no-store`
 *   3. `cf-cache-status` is NOT HIT/STALE/REVALIDATED/UPDATING
 *   4. `age` is 0
 *
 * Run:
 *   TEST_BASE_URL=https://phlabs.co.uk bunx playwright test \
 *     e2e/html-no-store-querystrings.spec.ts --project=chromium
 */
import { test, expect, type APIResponse } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

// Keep in sync with e2e/html-no-store.spec.ts and cf-cache-status.spec.ts.
const HTML_ROUTES = ["/", "/products", "/compound", "/research", "/landing/phlabs"];

// Realistic query-string variants a returning visitor can arrive with.
// Each is a self-contained query string (no leading `?`). Cloudflare cache
// rules have historically keyed on utm_* / gclid / fbclid in the past, so
// the matrix explicitly covers them.
const QUERY_VARIANTS: Array<{ name: string; qs: string }> = [
  { name: "utm-google-cpc", qs: "utm_source=google&utm_medium=cpc&utm_campaign=brand" },
  { name: "utm-meta-paid", qs: "utm_source=facebook&utm_medium=paid_social&utm_campaign=retargeting" },
  { name: "gclid", qs: "gclid=EAIaIQobChMIabc123def456ghi789" },
  { name: "fbclid", qs: "fbclid=IwAR0AbCdEfGhIjKlMnOpQrStUvWxYz" },
  { name: "gad_source", qs: "gad_source=1&gclid=abc" },
  { name: "msclkid", qs: "msclkid=00112233445566778899aabbccddeeff" },
  { name: "mc-newsletter", qs: "mc_cid=abc123&mc_eid=def456" },
  { name: "ref-partner", qs: "ref=partner-newsletter-2026-01" },
  { name: "combined-utm-gclid", qs: "utm_source=google&utm_medium=cpc&gclid=xyz789&ref=email" },
];

const FORBIDDEN_CF_STATUS = new Set(["HIT", "STALE", "REVALIDATED", "UPDATING"]);

function withQuery(path: string, qs: string): string {
  // Add a cache-buster on top of the marketing query string so a fresh
  // response is guaranteed for each attempt. The marketing params still
  // exercise the cache-key logic; the buster only breaks incidental hits.
  const marker = `__no_store_qs=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${sep}${qs}&${marker}`;
}

async function probe(
  request: import("@playwright/test").APIRequestContext,
  path: string,
  qs: string,
) {
  const res: APIResponse = await request.get(withQuery(path, qs), {
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "phlabs-no-store-qs-guard/1.0",
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const h = res.headers();
  return {
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

test.describe(`HTML no-store · query-string variants · ${BASE}`, () => {
  for (const path of HTML_ROUTES) {
    for (const { name, qs } of QUERY_VARIANTS) {
      test(`${path} with ${name} → no-store on both tiers`, async ({ request }) => {
        const r = await probe(request, path, qs);
        const label = `${path}?${qs}`;

        expect(r.status, `status for ${label}`).toBe(200);
        expect(r.contentType, `content-type for ${label}`).toMatch(/text\/html/);

        // Browser tier
        expect(
          r.cacheControl,
          `browser cache-control max-age=0 on ${label} ("${r.cacheControl}")`,
        ).toContain("max-age=0");
        expect(
          r.cacheControl,
          `browser cache-control must-revalidate on ${label} ("${r.cacheControl}")`,
        ).toContain("must-revalidate");

        // s-maxage / stale-while-revalidate must never appear
        expect(r.cacheControl, `no positive s-maxage on ${label}`).not.toMatch(
          /s-maxage\s*=\s*[1-9]/,
        );
        expect(
          r.cacheControl,
          `no stale-while-revalidate on ${label}`,
        ).not.toContain("stale-while-revalidate");

        // CDN tier — at least one CDN header must exist AND include no-store
        const cdnHeader = r.cdn || r.cfCdn || r.surrogate;
        expect(cdnHeader, `cdn/surrogate-control present on ${label}`).not.toBe("");
        expect(
          cdnHeader,
          `cdn/surrogate-control no-store on ${label} ("${cdnHeader}")`,
        ).toContain("no-store");
        expect(cdnHeader, `no positive CDN s-maxage on ${label}`).not.toMatch(
          /s-maxage\s*=\s*[1-9]/,
        );
        expect(
          cdnHeader,
          `no CDN stale-while-revalidate on ${label}`,
        ).not.toContain("stale-while-revalidate");

        // Cloudflare must not be replaying a cached shell for this
        // query-string variant.
        expect(
          FORBIDDEN_CF_STATUS.has(r.cfStatus),
          `cf-cache-status must not indicate cached reuse on ${label} ` +
            `(got "${r.cfStatus}")`,
        ).toBe(false);

        expect(r.age, `age must be 0 on ${label} (was ${r.age})`).toBe(0);
      });
    }
  }
});
