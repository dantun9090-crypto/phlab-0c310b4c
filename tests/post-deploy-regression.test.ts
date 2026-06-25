/**
 * Post-deploy regression test for phlabs.co.uk.
 *
 * Two invariants we MUST keep after every publish:
 *
 *  1. Public pages render the correct dark-theme shell, reference at
 *     least one content-hashed JS/CSS asset (cache-busting), and carry
 *     the `build-id` meta tag that lets the client detect a stale shell.
 *
 *  2. Sensitive paths (/admin /cart /checkout /account /login /register
 *     /payment /vip) are NEVER edge-cached: response must be `no-store`
 *     OR `max-age=0, must-revalidate` (Cloudflare sanitises `no-store`
 *     into the latter at the eyeball — both are uncacheable for the
 *     browser, so we accept either).
 *
 * Self-skips on network failure. Override target with TEST_BASE_URL.
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "https://phlabs.co.uk";

const PUBLIC_PATHS = ["/", "/products", "/compound", "/research", "/landing/phlabs"];
const SENSITIVE_PATHS = [
  "/admin",
  "/cart",
  "/checkout",
  "/account",
  "/login",
  "/register",
  "/payment",
  "/vip",
];

type Probe =
  | { ok: true; status: number; headers: Headers; body: string }
  | { ok: false; error: unknown };

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "phlabs-post-deploy-regression/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = res.status >= 200 && res.status < 300 ? await res.text() : "";
    return { ok: true, status: res.status, headers: res.headers, body };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function parseDirective(header: string, name: string): number | null {
  const m = header.toLowerCase().match(new RegExp(`(?:^|,\\s*)${name}=(\\d+)`));
  return m ? Number(m[1]) : null;
}

function cc(h: Headers): string {
  return (h.get("cache-control") || "").toLowerCase();
}

/** Cloudflare rewrites `no-store` → `public, max-age=0, must-revalidate`
 *  on the eyeball response. Both mean "browser must not reuse". */
function isUncacheable(header: string): boolean {
  if (/\bno-store\b/.test(header)) return true;
  const maxAge = parseDirective(header, "max-age") ?? -1;
  const sMaxAge = parseDirective(header, "s-maxage") ?? -1;
  return maxAge === 0 && (sMaxAge === -1 || sMaxAge === 0) && /must-revalidate/.test(header);
}

describe("Post-deploy regression — public pages", () => {
  for (const path of PUBLIC_PATHS) {
    test(`${path} renders, dark shell, hashed assets, build-id, bounded TTL`, async () => {
      const r = await probe(`${BASE}${path}`);
      if (!r.ok) {
        console.warn(`[skip] ${path} unreachable:`, r.error);
        return;
      }
      expect([200, 301, 302]).toContain(r.status);
      if (r.status !== 200) return;

      // ── Layout / dark theme shell ──
      // TanStack Start SSRs directly into <html>/<body>; there is no
      // explicit #root mount div. Assert the shell + theme colour
      // markers that lock the slate-950 design system.
      expect(r.body).toMatch(/<html[^>]*lang=["']en-GB["']/);
      expect(
        /(theme-color["'][^>]*content=["']#020617|bg-slate-950|background-color:\s*#0[26]0[6-f]1[ef]|#020617)/i.test(r.body),
        `${path} HTML must declare the locked dark/slate-950 theme`,
      ).toBe(true);

      // ── Asset versioning / cache-busting ──
      // Vite emits content-hashed filenames (/assets/<name>-<hash>.{js,css}).
      // At least one must be referenced — guards against a regression
      // that ships unhashed asset URLs and traps users on stale chunks.
      const hashedAsset = /\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.(?:js|mjs|css)/;
      expect(
        hashedAsset.test(r.body),
        `${path} must reference at least one content-hashed asset`,
      ).toBe(true);

      // build-id meta tag (injected by src/server.ts HTMLRewriter) +
      // x-build-id response header are our canonical version markers.
      expect(r.body).toMatch(/<meta\s+name=["'](?:x-)?build-id["']\s+content=["'][^"']+["']/i);
      expect(r.headers.get("x-build-id") || "").not.toBe("");

      // ── Cache TTL ──
      // Must be set, and must NEVER be unbounded. Either uncacheable
      // (current admin-off state) or a positive TTL capped at 1h is
      // acceptable; an unbounded `max-age=86400+` regression is not.
      const header = cc(r.headers);
      expect(header, `${path} must set Cache-Control`).not.toBe("");
      const ttl = Math.max(
        parseDirective(header, "max-age") ?? 0,
        parseDirective(header, "s-maxage") ?? 0,
      );
      expect(ttl, `${path} TTL ${ttl}s exceeds 1h ceiling`).toBeLessThanOrEqual(3600);
    });
  }
});

describe("Post-deploy regression — sensitive paths must stay uncacheable", () => {
  for (const path of SENSITIVE_PATHS) {
    test(`${path} must not be edge-cached`, async () => {
      const r = await probe(`${BASE}${path}`);
      if (!r.ok) {
        console.warn(`[skip] ${path} unreachable:`, r.error);
        return;
      }
      // Browser-visible Cache-Control must forbid reuse.
      const header = cc(r.headers);
      expect(header, `${path} must set Cache-Control`).not.toBe("");
      expect(
        isUncacheable(header),
        `${path} browser Cache-Control must be uncacheable (no-store OR max-age=0+must-revalidate). Got: "${header}"`,
      ).toBe(true);

      const sMaxAge = parseDirective(header, "s-maxage") ?? 0;
      expect(sMaxAge, `${path} s-maxage must be 0`).toBe(0);

      // Cloudflare must not be serving a cached copy of a sensitive
      // page. cf-cache-status of HIT/REVALIDATED/UPDATING/STALE all
      // mean a previous user's HTML is being replayed — fail hard.
      // DYNAMIC / BYPASS / MISS / EXPIRED are all acceptable (origin
      // hit, no cached reuse).
      const cfStatus = (r.headers.get("cf-cache-status") || "").toUpperCase();
      if (cfStatus) {
        expect(
          ["HIT", "REVALIDATED", "UPDATING", "STALE"].includes(cfStatus),
          `${path} cf-cache-status must NOT indicate cached reuse. Got: "${cfStatus}"`,
        ).toBe(false);
      }
    });
  }
});
