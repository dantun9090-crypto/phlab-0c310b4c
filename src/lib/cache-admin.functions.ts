import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';
import {
  addDocAdmin,
  listDocsAdmin,
} from './server/firestore-admin';
import { sendTelegramAlert } from './server/telegram-alert';

/**
 * Admin cache operations:
 *   - purgeCloudflareCache: scoped Cloudflare purge with history log,
 *     post-purge smoke test, and Telegram alert on failure/timeout.
 *       scope='all'    → purge_everything
 *       scope='html'   → purge top HTML routes (sitemap-derived, ≤30 files)
 *       scope='assets' → purge_everything + recommends Enterprise prefix
 *                        purge for true asset-only scoping (Pro plan limit)
 *       scope='files'  → caller-supplied URL list (≤30, phlabs.co.uk hosts)
 *   - recacheSitemapPrerender: bulk Prerender.io recache (desktop+mobile).
 *   - listPurgeHistory: read recent purge log rows for admin UI.
 */

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ORIGIN = 'https://phlabs.co.uk';
const ALLOWED_HOSTS = new Set(['phlabs.co.uk', 'www.phlabs.co.uk']);
const PURGE_HISTORY_COLLECTION = 'cache_purge_history';
const PURGE_TIMEOUT_MS = 15_000;

const SMOKE_ROUTES = ['/', '/products', '/products/bpc-157'] as const;
// Beacon snippets we expect rendered HTML to contain. If any one is missing
// across every route we flag the smoke test as failed.
const BEACON_NEEDLES = ['gtag(', 'googletagmanager', 'AW-'] as const;

type PurgeScope = 'all' | 'html' | 'assets' | 'files';

function isAllowedUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function getSitemapHtmlRoutes(limit = 30): Promise<string[]> {
  try {
    const res = await fetch(`${ORIGIN}/sitemap.xml`, {
      headers: { Accept: 'application/xml' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
      .map((m) => m[1].trim())
      .filter(isAllowedUrl)
      .filter((u) => !/\.(xml|txt|json|js|css|png|jpg|jpeg|webp|avif|svg|ico|woff2?)$/i.test(u));
    return Array.from(new Set(urls)).slice(0, limit);
  } catch {
    return [];
  }
}

interface SmokeRouteResult {
  path: string;
  status: number;
  ok: boolean;
  ms: number;
  beaconHit: boolean;
}

async function runPostPurgeSmokeTest(): Promise<{
  ok: boolean;
  routes: SmokeRouteResult[];
  failures: string[];
}> {
  const routes: SmokeRouteResult[] = [];
  const failures: string[] = [];
  for (const path of SMOKE_ROUTES) {
    const t = Date.now();
    try {
      const res = await fetch(ORIGIN + path, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; PHLabsPostPurgeSmoke/1.0; +https://phlabs.co.uk)',
          Accept: 'text/html',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(10_000),
      });
      const body = res.ok ? await res.text() : '';
      const beaconHit = BEACON_NEEDLES.some((n) => body.includes(n));
      const ok = res.ok && body.length > 500;
      routes.push({ path, status: res.status, ok, ms: Date.now() - t, beaconHit });
      if (!ok) failures.push(`${path} HTTP ${res.status}`);
      else if (!beaconHit) failures.push(`${path} missing GA/Ads beacon`);
    } catch (e) {
      routes.push({
        path,
        status: 0,
        ok: false,
        ms: Date.now() - t,
        beaconHit: false,
      });
      failures.push(`${path} fetch error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: failures.length === 0, routes, failures };
}

async function logPurgeHistory(entry: {
  scope: PurgeScope;
  ok: boolean;
  status: number;
  durationMs: number;
  triggeredBy: string;
  triggeredById: string;
  fileCount: number;
  error?: string;
  smoke?: { ok: boolean; failures: string[] } | null;
}): Promise<void> {
  try {
    await addDocAdmin(PURGE_HISTORY_COLLECTION, {
      at: new Date().toISOString(),
      ...entry,
    });
  } catch (e) {
    console.error('[purge-history] persist failed', e);
  }
}

const PurgeSchema = z.object({
  idToken: z.string().min(20).max(4096),
  scope: z.enum(['all', 'html', 'assets', 'files']).default('all'),
  // Only used when scope === 'files'.
  files: z.array(z.string().url()).max(30).optional(),
  // Run a quick smoke test after the purge. Default ON so post-publish flows
  // automatically verify HTML + GA/Ads beacons.
  runSmokeTest: z.boolean().default(true),
});

export const purgeCloudflareCache = createServerFn({ method: 'POST' })
  .validator((input: unknown) => PurgeSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireFirebaseAdmin(data.idToken);
    const triggeredBy = user.email ?? user.uid ?? 'admin';
    const triggeredById = user.uid ?? '';
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!token) {
      const out = {
        ok: false as const,
        status: 0,
        scope: data.scope,
        error: 'CLOUDFLARE_API_TOKEN missing',
        durationMs: 0,
        fileCount: 0,
        smoke: null,
        at: new Date().toISOString(),
      };
      await logPurgeHistory({
        scope: data.scope,
        ok: false,
        status: 0,
        durationMs: 0,
        triggeredBy,
        triggeredById,
        fileCount: 0,
        error: out.error,
      });
      await sendTelegramAlert(
        `🚨 <b>Cache purge FAILED</b>\nscope: ${data.scope}\nreason: CLOUDFLARE_API_TOKEN missing\nby: ${triggeredBy}`,
      );
      return out;
    }

    // Build CF API body based on scope.
    let body: string;
    let fileCount = 0;
    let scopeNote = '';
    if (data.scope === 'all' || data.scope === 'assets') {
      // Cloudflare Pro plan: no prefix/host purge. Assets and 'all' both fall
      // back to purge_everything. We still record the requested scope.
      body = JSON.stringify({ purge_everything: true });
      if (data.scope === 'assets') {
        scopeNote =
          ' (note: Pro plan has no prefix purge — falling back to purge_everything)';
      }
    } else if (data.scope === 'html') {
      const urls = await getSitemapHtmlRoutes(30);
      if (urls.length === 0) {
        const out = {
          ok: false as const,
          status: 0,
          scope: data.scope,
          error: 'sitemap returned no HTML routes',
          durationMs: 0,
          fileCount: 0,
          smoke: null,
          at: new Date().toISOString(),
        };
        await logPurgeHistory({
          scope: data.scope,
          ok: false,
          status: 0,
          durationMs: 0,
          triggeredBy,
          triggeredById,
          fileCount: 0,
          error: out.error,
        });
        return out;
      }
      body = JSON.stringify({ files: urls });
      fileCount = urls.length;
    } else {
      // files
      const files = (data.files ?? []).filter(isAllowedUrl);
      if (files.length === 0) {
        const out = {
          ok: false as const,
          status: 0,
          scope: data.scope,
          error: 'No allowed URLs to purge',
          durationMs: 0,
          fileCount: 0,
          smoke: null,
          at: new Date().toISOString(),
        };
        await logPurgeHistory({
          scope: data.scope,
          ok: false,
          status: 0,
          durationMs: 0,
          triggeredBy,
          triggeredById,
          fileCount: 0,
          error: out.error,
        });
        return out;
      }
      body = JSON.stringify({ files });
      fileCount = files.length;
    }

    const started = Date.now();
    let ok = false;
    let status = 0;
    let response = '';
    let error: string | undefined;
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
        },
      );
      status = res.status;
      ok = res.ok;
      response = (await res.text()).slice(0, 600);
      if (!ok) error = `HTTP ${status}: ${response}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (error.toLowerCase().includes('timeout') || error.toLowerCase().includes('aborted')) {
        error = `timeout after ${PURGE_TIMEOUT_MS}ms`;
      }
    }
    const durationMs = Date.now() - started;

    // Smoke test (only if purge succeeded and caller opted in).
    let smoke: Awaited<ReturnType<typeof runPostPurgeSmokeTest>> | null = null;
    if (ok && data.runSmokeTest) {
      smoke = await runPostPurgeSmokeTest();
    }

    await logPurgeHistory({
      scope: data.scope,
      ok,
      status,
      durationMs,
      triggeredBy,
      triggeredById,
      fileCount,
      error,
      smoke: smoke ? { ok: smoke.ok, failures: smoke.failures } : null,
    });

    // Alert on failure, timeout, or smoke-test regression.
    if (!ok) {
      await sendTelegramAlert(
        `🚨 <b>Cache purge FAILED</b>\nscope: <code>${data.scope}</code>${scopeNote}\nby: ${triggeredBy}\nHTTP ${status}\n${error ?? ''}`.slice(
          0,
          3500,
        ),
      );
    } else if (smoke && !smoke.ok) {
      await sendTelegramAlert(
        `⚠️ <b>Post-purge smoke test FAILED</b>\nscope: <code>${data.scope}</code>\nby: ${triggeredBy}\nfailures:\n${smoke.failures
          .map((f) => `• ${f}`)
          .join('\n')}`.slice(0, 3500),
      );
    }

    return {
      ok,
      status,
      scope: data.scope,
      scopeNote,
      fileCount,
      durationMs,
      response,
      error,
      smoke,
      at: new Date().toISOString(),
    } as const;
  });

const RecacheSchema = z.object({
  idToken: z.string().min(20).max(4096),
  includeMobile: z.boolean().default(true),
});

async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(`${ORIGIN}/sitemap.xml`, {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`sitemap.xml HTTP ${res.status}`);
  const xml = await res.text();
  const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
    .map((m) => m[1].trim())
    .filter(isAllowedUrl);
  return Array.from(new Set(urls));
}

async function postRecache(
  token: string,
  urls: string[],
  adaptiveType?: 'mobile' | 'desktop',
): Promise<{ ok: boolean; status: number; response: string }> {
  const body: Record<string, unknown> = { prerenderToken: token, urls };
  if (adaptiveType) body.adaptiveType = adaptiveType;
  const res = await fetch('https://api.prerender.io/recache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, response: text.slice(0, 400) };
}

export const recacheSitemapPrerender = createServerFn({ method: 'POST' })
  .validator((input: unknown) => RecacheSchema.parse(input))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const token = process.env.PRERENDER_TOKEN;
    if (!token) {
      return {
        ok: false,
        urls: 0,
        desktop: null,
        mobile: null,
        error: 'PRERENDER_TOKEN missing',
        at: new Date().toISOString(),
      } as const;
    }
    const started = Date.now();
    let urls: string[];
    try {
      urls = await fetchSitemapUrls();
    } catch (e) {
      return {
        ok: false,
        urls: 0,
        desktop: null,
        mobile: null,
        error: e instanceof Error ? e.message : String(e),
        at: new Date().toISOString(),
      } as const;
    }
    if (urls.length === 0) {
      return {
        ok: false,
        urls: 0,
        desktop: null,
        mobile: null,
        error: 'sitemap.xml contained no allowed URLs',
        at: new Date().toISOString(),
      } as const;
    }

    const desktop = await postRecache(token, urls, 'desktop');
    const mobile = data.includeMobile ? await postRecache(token, urls, 'mobile') : null;

    return {
      ok: desktop.ok && (mobile?.ok ?? true),
      urls: urls.length,
      desktop,
      mobile,
      durationMs: Date.now() - started,
      at: new Date().toISOString(),
    } as const;
  });

const ListHistorySchema = z.object({
  idToken: z.string().min(20).max(4096),
  limit: z.number().int().min(1).max(200).default(50),
});

export interface PurgeHistoryRow {
  id: string;
  at: string;
  scope: PurgeScope;
  ok: boolean;
  status: number;
  durationMs: number;
  triggeredBy: string;
  triggeredById: string;
  fileCount: number;
  error?: string;
  smoke?: { ok: boolean; failures: string[] } | null;
}

export const listPurgeHistory = createServerFn({ method: 'POST' })
  .validator((input: unknown) => ListHistorySchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; rows: PurgeHistoryRow[]; error?: string }> => {
    await requireFirebaseAdmin(data.idToken);
    try {
      const rows = await listDocsAdmin(PURGE_HISTORY_COLLECTION, {
        orderBy: 'at',
        direction: 'DESCENDING',
        limit: data.limit,
      });
      return {
        ok: true,
        rows: rows.map((r) => ({
          id: r.id,
          at: String(r.at ?? ''),
          scope: (r.scope as PurgeScope) ?? 'all',
          ok: Boolean(r.ok),
          status: Number(r.status ?? 0),
          durationMs: Number(r.durationMs ?? 0),
          triggeredBy: String(r.triggeredBy ?? ''),
          triggeredById: String(r.triggeredById ?? ''),
          fileCount: Number(r.fileCount ?? 0),
          error: typeof r.error === 'string' ? r.error : undefined,
          smoke:
            r.smoke && typeof r.smoke === 'object'
              ? (r.smoke as { ok: boolean; failures: string[] })
              : null,
        })),
      };
    } catch (e) {
      return { ok: false, rows: [], error: e instanceof Error ? e.message : String(e) };
    }
  });
