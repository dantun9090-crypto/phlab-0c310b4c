/**
 * CI regression: dynamic-asset cache headers must take precedence over
 * Cloudflare's static-asset handler when a file also exists in `public/`.
 *
 * Background: Cloudflare Workers Assets serves anything present in `public/`
 * BEFORE the Worker runs, with `cache-control: public, max-age=31536000,
 * immutable`. That completely bypasses `applyDynamicAssetCacheHeaders`
 * in `src/server.ts` — which is fatal for files that are user-editable
 * (robots.txt, sitemap*.xml, /downloads/*) because a stale copy pins at
 * the edge for a year.
 *
 * The fix pattern (see `src/routes/robots[.]txt.ts`): remove the file from
 * `public/` and serve it through a TSS server route so the Worker owns the
 * response and the dynamic-asset wrapper applies.
 *
 * This test enforces the invariant statically: for every file under
 * `public/` whose URL path matches `isDynamicAssetPath` in `src/server.ts`,
 * assert there is NO static copy — the route must be the sole source.
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PUBLIC_DIR = join(process.cwd(), "public");

// Kept in lock-step with src/server.ts. If server.ts changes, update here too.
const DYNAMIC_ASSET_PREFIXES = ["/downloads/"];
const DYNAMIC_ASSET_EXACT = new Set<string>([
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-products.xml",
  "/sitemap-articles.xml",
  "/sitemap-index.xml",
]);
function isDynamicAssetPath(pathname: string): boolean {
  if (DYNAMIC_ASSET_EXACT.has(pathname)) return true;
  if (/^\/sitemap[-a-z0-9]*\.xml$/i.test(pathname)) return true;
  for (const p of DYNAMIC_ASSET_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function toUrlPath(absPath: string): string {
  const rel = relative(PUBLIC_DIR, absPath).split(sep).join("/");
  return "/" + rel;
}

describe("dynamic-asset cache policy takes precedence over public/", () => {
  const files = walk(PUBLIC_DIR).map(toUrlPath);

  const offenders = files.filter(isDynamicAssetPath);

  test("no file under public/ shadows a dynamic-asset URL", () => {
    // If this fires, Cloudflare's static-asset handler will serve the file
    // as `immutable, max-age=31536000` and bypass applyDynamicAssetCacheHeaders.
    // Fix: move the file into `src/assets/` (or another non-public location),
    // create a TSS route at src/routes/<path>.ts that imports it as `?raw`
    // (or ?url + fetch) and returns it with the dynamic-asset headers.
    // See src/routes/robots[.]txt.ts for the canonical pattern.
    expect(
      offenders,
      [
        "The following public/ files are being served as immutable static",
        "assets and BYPASS the dynamic-asset no-store CDN policy in",
        "src/server.ts. Move each into src/assets/ and serve it from a",
        "TSS server route (see src/routes/robots[.]txt.ts):",
        ...offenders.map((p) => `  - ${p}`),
      ].join("\n"),
    ).toEqual([]);
  });

  test("known dynamic-asset routes have server route files (not public/ copies)", () => {
    // Every path in DYNAMIC_ASSET_EXACT must resolve via a route file so the
    // Worker — not the static-asset handler — owns the response.
    const missing = [...DYNAMIC_ASSET_EXACT].filter((p) =>
      files.includes(p),
    );
    expect(
      missing,
      `These DYNAMIC_ASSET_EXACT paths still exist in public/: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});

describe("live probe (optional): dynamic-asset headers win at the edge", () => {
  const BASE = process.env.TEST_BASE_URL || process.env.CACHE_PROBE_BASE_URL;
  const RUN_LIVE = Boolean(BASE);

  const probes = [
    "/robots.txt",
    "/sitemap.xml",
    "/downloads/protocol-library.pdf",
  ];

  for (const path of probes) {
    test.skipIf(!RUN_LIVE)(
      `${path} responds with dynamic-asset cache policy (no immutable)`,
      async () => {
        const res = await fetch(`${BASE}${path}?__cache_shadow=${Date.now()}`, {
          method: "GET",
          redirect: "follow",
          headers: { "user-agent": "phlabs-dynamic-asset-shadow-test/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        expect(res.status, `${path} should not 404`).toBeLessThan(400);

        const cc = (res.headers.get("cache-control") ?? "").toLowerCase();
        const cdn = (res.headers.get("cdn-cache-control") ?? "").toLowerCase();

        expect(cc, `${path} cache-control must not be immutable`).not.toMatch(
          /immutable/,
        );
        expect(cc, `${path} cache-control must not pin for a year`).not.toMatch(
          /max-age=31536000/,
        );
        expect(cdn, `${path} CDN must be no-store`).toContain("no-store");
      },
    );
  }
});
