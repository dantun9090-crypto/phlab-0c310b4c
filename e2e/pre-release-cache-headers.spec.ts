/**
 * Pre-release integration guard — cache headers for `/` and `/products`.
 *
 * This spec runs BEFORE production publish (wired into the pre-release
 * workflow against the Lovable staging preview URL). It's the last gate:
 * if any of these assertions fails the promotion to prod is blocked.
 *
 * What it verifies for both `/` and `/products`:
 *   1. HTTP 200 (cache-busted per attempt, so we always hit the origin fresh)
 *   2. `cache-control` contains `max-age=0` and `must-revalidate`
 *   3. `cdn-cache-control` contains `no-store`
 *   4. `pragma: no-cache` (belt-and-braces for legacy proxies)
 *   5. `cf-cache-status` is one of: DYNAMIC | BYPASS | MISS | EXPIRED | NONE
 *      — anything else means Cloudflare replayed a cached HTML shell,
 *      which is the exact regression that caused the "stale after publish"
 *      incidents.
 *   6. Response body is real HTML (`<!doctype html>`) and NOT the JSON
 *      500 h3-swallowed error envelope.
 *   7. `x-build-id` header is present and looks fresh (not empty).
 *   8. Consistency across N attempts: cf-cache-status must never flip
 *      into a HIT state under repeated cache-busted requests.
 *
 * Env:
 *   TEST_BASE_URL              default https://phlabs.co.uk
 *   PRE_RELEASE_CF_ATTEMPTS    default 3 (how many probes per route)
 *
 * Run locally:
 *   TEST_BASE_URL=https://id-preview--1f12c255-a30a-4bea-bbab-28d9e6f70804.lovable.app \
 *     bunx playwright test e2e/pre-release-cache-headers.spec.ts --project=chromium
 */
import { test, expect, request as pwRequest, type APIResponse } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";
const ATTEMPTS = Math.max(1, Number(process.env.PRE_RELEASE_CF_ATTEMPTS || "3"));
const ROUTES = ["/", "/products"] as const;

const ALLOWED_CF_STATUS = new Set([
  "DYNAMIC",
  "BYPASS",
  "MISS",
  "EXPIRED",
  "NONE",
  "UNKNOWN",
]);
const FORBIDDEN_CF_STATUS = new Set([
  "HIT",
  "STALE",
  "REVALIDATED",
  "UPDATING",
]);

function bust(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${sep}__pre_release=${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function h(res: APIResponse, name: string): string {
  return (res.headers()[name.toLowerCase()] ?? "").trim();
}

test.describe("Pre-release cache-header integration guard", () => {
  test.describe.configure({ mode: "serial" });

  for (const route of ROUTES) {
    test(`${route} — cache contract holds across ${ATTEMPTS} cache-busted probes`, async () => {
      const api = await pwRequest.newContext({
        extraHTTPHeaders: {
          "user-agent": "PHLabs-PreReleaseGuard/1.0",
          accept: "text/html,application/xhtml+xml",
        },
      });

      const observations: Array<{
        attempt: number;
        status: number;
        cc: string;
        cdncc: string;
        pragma: string;
        cf: string;
        buildId: string;
        contentType: string;
        bodyHead: string;
      }> = [];

      for (let i = 1; i <= ATTEMPTS; i++) {
        const url = bust(route);
        const res = await api.get(url, { maxRedirects: 0 });
        const body = await res.text();
        observations.push({
          attempt: i,
          status: res.status(),
          cc: h(res, "cache-control"),
          cdncc: h(res, "cdn-cache-control"),
          pragma: h(res, "pragma"),
          cf: h(res, "cf-cache-status").toUpperCase(),
          buildId: h(res, "x-build-id"),
          contentType: h(res, "content-type"),
          bodyHead: body.slice(0, 200).replace(/\s+/g, " ").trim(),
        });
      }

      await api.dispose();

      const report = [
        `Route: ${route}   Base: ${BASE}`,
        ...observations.map(
          (o) =>
            `#${o.attempt}  ${o.status}  cf=${o.cf || "-"}  cc="${o.cc}"  cdncc="${o.cdncc}"  build=${o.buildId || "-"}`,
        ),
      ].join("\n");

      // Assertions — every attempt must satisfy every rule.
      for (const o of observations) {
        expect(o.status, `status must be 200 for ${route}\n${report}`).toBe(200);

        expect(
          o.contentType.toLowerCase(),
          `content-type must be HTML on ${route}\n${report}`,
        ).toContain("text/html");
        expect(
          o.bodyHead.toLowerCase().startsWith("<!doctype html"),
          `body must be real HTML (not h3 error JSON) on ${route}\n${o.bodyHead}`,
        ).toBe(true);

        expect(
          o.cc.toLowerCase(),
          `cache-control must contain max-age=0 on ${route}\n${report}`,
        ).toContain("max-age=0");
        expect(
          o.cc.toLowerCase(),
          `cache-control must contain must-revalidate on ${route}\n${report}`,
        ).toContain("must-revalidate");
        expect(
          o.cdncc.toLowerCase(),
          `cdn-cache-control must contain no-store on ${route}\n${report}`,
        ).toContain("no-store");
        expect(
          o.pragma.toLowerCase(),
          `pragma must be no-cache on ${route}\n${report}`,
        ).toContain("no-cache");

        // Some edges omit cf-cache-status entirely — that's fine (treated
        // as NONE). Only fail on an actual forbidden value.
        if (o.cf && FORBIDDEN_CF_STATUS.has(o.cf)) {
          throw new Error(
            `cf-cache-status="${o.cf}" is forbidden on ${route} (edge served a cached HTML shell)\n${report}`,
          );
        }
        if (o.cf && !ALLOWED_CF_STATUS.has(o.cf)) {
          throw new Error(
            `cf-cache-status="${o.cf}" is not in allowlist ${[...ALLOWED_CF_STATUS].join("|")} on ${route}\n${report}`,
          );
        }

        expect(
          o.buildId.length > 0,
          `x-build-id must be present on ${route}\n${report}`,
        ).toBe(true);
      }

      // Consistency: no probe may flip into a HIT-family status.
      const bad = observations.filter((o) => FORBIDDEN_CF_STATUS.has(o.cf));
      expect(
        bad.length,
        `at least one probe returned a forbidden cf-cache-status\n${report}`,
      ).toBe(0);

      // Build ID must be identical across probes (otherwise the edge is
      // routing to two different worker versions — flaky rollout).
      const uniqueBuilds = new Set(observations.map((o) => o.buildId));
      expect(
        uniqueBuilds.size,
        `x-build-id drifted across probes on ${route}: ${[...uniqueBuilds].join(", ")}\n${report}`,
      ).toBe(1);
    });
  }
});
