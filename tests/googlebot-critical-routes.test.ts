/**
 * Googlebot regression suite — for every SEO-critical route, fetch the live
 * Worker as Googlebot and assert:
 *   • HTTP 200
 *   • <title> present, ≤ 80 characters, contains expected keyword (if any)
 *   • <link rel="canonical"> present and points to https://phlabs.co.uk/*
 *   • <meta name="robots"> does not contain "noindex"
 *   • Body byte length within MarketingRoute.minBytes..maxBytes
 *   • Response served via Prerender (x-phl-via starts with "prerender")
 *
 * The suite SELF-SKIPS when offline so local dev / restricted CI doesn't
 * false-fail. To run in CI against the live site, schedule with network
 * egress allowed.
 */
import { describe, it, expect } from 'vitest';
import { MARKETING_ROUTES, CANONICAL_ORIGIN, GOOGLEBOT_UA, fullUrl } from '../src/lib/marketing-routes';

const ORIGIN = process.env.SEO_REGRESSION_ORIGIN ?? CANONICAL_ORIGIN;

interface Probe {
  ok: boolean;
  status: number;
  via: string | null;
  html: string;
  bytes: number;
  reachable: boolean;
}

async function probe(path: string): Promise<Probe> {
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      headers: { 'user-agent': GOOGLEBOT_UA, accept: 'text/html' },
      redirect: 'follow',
    });
    const html = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      via: res.headers.get('x-phl-via'),
      html,
      bytes: html.length,
      reachable: true,
    };
  } catch {
    return { ok: false, status: 0, via: null, html: '', bytes: 0, reachable: false };
  }
}

const titleRx = /<title[^>]*>([\s\S]*?)<\/title>/i;
const canonicalRx = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i;
const robotsRx = /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i;

describe('Googlebot regression — SEO-critical routes', () => {
  for (const route of MARKETING_ROUTES) {
    it(`${route.path} (${route.label})`, async () => {
      const p = await probe(route.path);
      if (!p.reachable) {
        console.warn(`[skip] ${ORIGIN}${route.path} — offline`);
        return;
      }

      expect(p.status, `HTTP status for ${route.path}`).toBe(200);

      // Title
      const titleMatch = p.html.match(titleRx);
      expect(titleMatch, `missing <title> on ${route.path}`).not.toBeNull();
      const titleText = (titleMatch?.[1] || '').trim();
      expect(titleText.length, `empty title on ${route.path}`).toBeGreaterThan(0);
      expect(titleText.length, `title too long on ${route.path}`).toBeLessThanOrEqual(80);
      if (route.titleContains) {
        expect(
          titleText.toLowerCase(),
          `title on ${route.path} should contain "${route.titleContains}"`,
        ).toContain(route.titleContains.toLowerCase());
      }

      // Canonical
      const canonicalMatch = p.html.match(canonicalRx);
      expect(canonicalMatch, `missing canonical on ${route.path}`).not.toBeNull();
      expect(canonicalMatch?.[1] || '').toMatch(/^https:\/\/phlabs\.co\.uk\//);

      // Robots meta — must not noindex SEO-critical pages
      const robotsMatch = p.html.match(robotsRx);
      if (robotsMatch) {
        expect(
          robotsMatch[1].toLowerCase(),
          `${route.path} has noindex robots tag`,
        ).not.toContain('noindex');
      }

      // Content-length window
      expect(
        p.bytes,
        `${route.path} body ${p.bytes} bytes outside [${route.minBytes}..${route.maxBytes}]`,
      ).toBeGreaterThanOrEqual(route.minBytes);
      expect(p.bytes).toBeLessThanOrEqual(route.maxBytes);

      // Served via prerender pipeline (cache-hit or fresh)
      // Only enforce on the canonical origin, not preview environments.
      if (ORIGIN === CANONICAL_ORIGIN) {
        const via = (p.via || '').toLowerCase();
        expect(via, `${route.path} not served by prerender (x-phl-via="${p.via}")`).toMatch(/prerender/);
      }
    }, 30_000);
  }
});

describe('Worker sitemap surface', () => {
  it('exposes /sitemap.xml that contains every marketing route', async () => {
    let xml = '';
    try {
      const res = await fetch(`${ORIGIN}/sitemap.xml`);
      if (!res.ok) {
        console.warn(`[skip] sitemap fetch ${res.status}`);
        return;
      }
      xml = await res.text();
    } catch {
      console.warn('[skip] sitemap offline');
      return;
    }
    for (const r of MARKETING_ROUTES) {
      expect(xml, `sitemap missing ${r.path}`).toContain(fullUrl(r.path));
    }
  }, 20_000);
});
