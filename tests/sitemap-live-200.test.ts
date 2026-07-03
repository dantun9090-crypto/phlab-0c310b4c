// @vitest-environment node
/**
 * Live sitemap health check — fetches https://phlabs.co.uk/sitemap.xml
 * and asserts every <loc> URL responds HTTP 200. Runs as part of the
 * `test:sitemap` suite invoked by `prepublish`, so a broken slug fails
 * the build before it ships.
 *
 * Set SKIP_LIVE_SITEMAP_CHECK=1 to bypass locally when offline.
 * Set SITEMAP_URL to override the target (e.g. a preview URL).
 *
 * Run with: bunx vitest run tests/sitemap-live-200.test.ts
 */
import { describe, it, expect } from "vitest";

const SITEMAP_URL =
  process.env.SITEMAP_URL ?? "https://phlabs.co.uk/sitemap.xml";
const PROBE_TIMEOUT_MS = 10_000;
const PROBE_CONCURRENCY = 8;
const UA = "phlabs-sitemap-test/1.0";

async function fetchSitemapLocs(url: string): Promise<string[]> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (res.status !== 200) {
    throw new Error(`sitemap fetch ${url} → HTTP ${res.status}`);
  }
  const xml = await res.text();
  const locs: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) locs.push(m[1].trim());
  return locs;
}

async function probeStatus(url: string): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": UA },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": UA },
      });
    }
    return res.status;
  } catch (err) {
    return (err as Error).name === "AbortError" ? 0 : -1;
  } finally {
    clearTimeout(timer);
  }
}

async function probeAll(
  urls: string[],
): Promise<Array<{ url: string; status: number }>> {
  const out: Array<{ url: string; status: number }> = [];
  for (let i = 0; i < urls.length; i += PROBE_CONCURRENCY) {
    const batch = urls.slice(i, i + PROBE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => ({ url, status: await probeStatus(url) })),
    );
    out.push(...results);
  }
  return out;
}

const skip = process.env.SKIP_LIVE_SITEMAP_CHECK === "1";
const describeMaybe = skip ? describe.skip : describe;

describeMaybe("live sitemap: every <loc> returns HTTP 200", () => {
  it(
    `all URLs in ${SITEMAP_URL} respond 200`,
    async () => {
      const locs = await fetchSitemapLocs(SITEMAP_URL);
      expect(locs.length, "sitemap has at least one <loc>").toBeGreaterThan(0);

      const results = await probeAll(locs);
      const bad = results.filter((r) => r.status !== 200);
      const report = bad
        .map((r) => {
          const label =
            r.status === 0
              ? "TIMEOUT"
              : r.status === -1
                ? "NETWORK_ERROR"
                : `HTTP ${r.status}`;
          return `  ${label}  ${r.url}`;
        })
        .join("\n");

      expect(
        bad,
        `${bad.length}/${results.length} sitemap URLs did not return 200:\n${report}`,
      ).toEqual([]);
    },
    // 8-way concurrency, 10s each, plus overhead — cap generously.
    5 * 60_000,
  );
});
