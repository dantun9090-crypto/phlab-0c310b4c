/**
 * Marketing Coverage Report — on-demand, admin-only.
 *
 * For every route in MARKETING_ROUTES, returns:
 *   - sitemap inclusion (parsed from live /sitemap.xml)
 *   - GSC URL-Inspection verdict + last crawl + canonical
 *   - live HTTP probe (status + content length + worker headers)
 *
 * All three sources are fetched in parallel per route, with a global
 * concurrency limit so GSC's 600/min URL Inspection quota is respected.
 */
import { createServerFn } from '@tanstack/react-start';
import { MARKETING_ROUTES, CANONICAL_ORIGIN, GOOGLEBOT_UA, fullUrl } from '@/lib/marketing-routes';
import { inspectGscUrl } from '@/lib/gsc.functions';

export interface CoverageRow {
  path: string;
  label: string;
  tier: 'critical' | 'high' | 'normal';
  inSitemap: boolean;
  http: { status: number; bytes: number; via: string | null; ok: boolean; error?: string };
  gsc: {
    verdict: string;
    coverageState: string;
    indexingState: string;
    lastCrawlTime: string | null;
    googleCanonical: string | null;
    userCanonical: string | null;
    error?: string;
  };
}

export interface CoverageReport {
  generatedAt: string;
  origin: string;
  sitemapEntries: number;
  rows: CoverageRow[];
  summary: {
    total: number;
    indexed: number;
    crawledLast30d: number;
    missingFromSitemap: number;
    failedHttp: number;
  };
}

async function fetchSitemapPaths(): Promise<Set<string>> {
  const res = await fetch(`${CANONICAL_ORIGIN}/sitemap.xml`, {
    headers: { 'user-agent': 'phlabs-coverage-report/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return new Set();
  const xml = await res.text();
  const paths = new Set<string>();
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try {
      paths.add(new URL(m[1]).pathname);
    } catch { /* skip */ }
  }
  return paths;
}

async function probeRoute(path: string): Promise<CoverageRow['http']> {
  try {
    const res = await fetch(fullUrl(path), {
      headers: {
        'user-agent': GOOGLEBOT_UA,
        'accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    let bytes = 0;
    try {
      const body = await res.text();
      bytes = body.length;
    } catch { /* may be empty for 3xx */ }
    return {
      status: res.status,
      bytes,
      via: res.headers.get('x-phl-via'),
      ok: res.status >= 200 && res.status < 400,
    };
  } catch (e: any) {
    return { status: 0, bytes: 0, via: null, ok: false, error: e?.message || String(e) };
  }
}

async function inspectViaGsc(idToken: string, url: string): Promise<CoverageRow['gsc']> {
  try {
    const result = await (inspectGscUrl as any)({ data: { idToken, inspectionUrl: url } });
    return {
      verdict: result.verdict,
      coverageState: result.coverageState,
      indexingState: result.indexingState,
      lastCrawlTime: result.lastCrawlTime,
      googleCanonical: result.googleCanonical,
      userCanonical: result.userCanonical,
    };
  } catch (e: any) {
    return {
      verdict: 'ERROR',
      coverageState: '',
      indexingState: '',
      lastCrawlTime: null,
      googleCanonical: null,
      userCanonical: null,
      error: (e?.message || String(e)).slice(0, 300),
    };
  }
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const runMarketingCoverageReport = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string }) => {
    if (!d?.idToken) throw new Error('idToken required');
    return d;
  })
  .handler(async ({ data }) => {
    const { requireFirebaseAdmin } = await import('@/lib/server/firebase-auth-admin');
    await requireFirebaseAdmin(data.idToken);

    const sitemapPaths = await fetchSitemapPaths();

    const rows = await runWithConcurrency(MARKETING_ROUTES, 4, async (route) => {
      const [http, gsc] = await Promise.all([
        probeRoute(route.path),
        inspectViaGsc(data.idToken, fullUrl(route.path)),
      ]);
      const row: CoverageRow = {
        path: route.path,
        label: route.label,
        tier: route.tier,
        inSitemap: sitemapPaths.has(route.path),
        http,
        gsc,
      };
      return row;
    });

    const thirty = Date.now() - 30 * 86_400_000;
    const summary = {
      total: rows.length,
      indexed: rows.filter((r) => r.gsc.verdict === 'PASS').length,
      crawledLast30d: rows.filter((r) => r.gsc.lastCrawlTime && Date.parse(r.gsc.lastCrawlTime) > thirty).length,
      missingFromSitemap: rows.filter((r) => !r.inSitemap).length,
      failedHttp: rows.filter((r) => !r.http.ok).length,
    };

    const report: CoverageReport = {
      generatedAt: new Date().toISOString(),
      origin: CANONICAL_ORIGIN,
      sitemapEntries: sitemapPaths.size,
      rows,
      summary,
    };
    return report;
  });
