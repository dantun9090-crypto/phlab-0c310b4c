/**
 * Admin Health Monitor — cache / asset / dev-mode probes + auto-purge.
 *
 * Surface:
 *  - getCacheHealth        : on-demand probe (admin-gated)
 *  - purgeCacheNow         : manual full Cloudflare purge (admin-gated)
 *  - listHealthLogs        : recent admin_health_logs (admin-gated)
 *  - listHealthAlerts      : unacknowledged admin_alerts (admin-gated)
 *  - acknowledgeHealthAlert: mark an alert acknowledged (admin-gated)
 *
 * Cron-driven auto-purge lives in src/routes/api/public/hooks/health-check.ts
 * and reuses runHealthProbe() exported below.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';
import { listDocsAdmin, updateDocAdmin } from './server/firestore-admin';

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ORIGIN = 'https://phlabs.co.uk';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface HealthProbeResult {
  timestamp: number;
  cfCacheStatus: string;
  edgeAgeSeconds: number;
  edgeBuildId: string;
  currentBuildId: string;
  buildMismatch: boolean;
  staleChunksDetected: boolean;
  staleChunksList: string[];
  devModeOn: boolean;
  ttfbMs: number;
  ok: boolean;
  errors: string[];
}

function getCurrentBuildId(): string {
  try {
    // Injected at build time via vite.config.ts `define`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev') as string;
  } catch {
    return 'dev';
  }
}

async function probeOrigin(): Promise<{
  html: string;
  cfCacheStatus: string;
  edgeAgeSeconds: number;
  edgeBuildId: string;
  ttfbMs: number;
  ok: boolean;
}> {
  const t0 = Date.now();
  const res = await fetch(`${ORIGIN}/?cb=${Date.now()}`, {
    method: 'GET',
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  const ttfbMs = Date.now() - t0;
  const html = await res.text().catch(() => '');
  const cfCacheStatus =
    res.headers.get('cf-cache-status') ||
    res.headers.get('x-cache-status') ||
    'UNKNOWN';
  const edgeAgeSeconds = Number(res.headers.get('age') || '0') || 0;
  const headerBuildId = res.headers.get('x-build-id') || '';
  const metaMatch = html.match(
    /<meta\s+name=["']build-id["']\s+content=["']([^"']+)["']/i,
  );
  const edgeBuildId = headerBuildId || metaMatch?.[1] || '';
  return { html, cfCacheStatus, edgeAgeSeconds, edgeBuildId, ttfbMs, ok: res.ok };
}

async function probeChunks(html: string): Promise<string[]> {
  // Pull the first 5 same-origin JS chunk URLs out of the HTML.
  const stale: string[] = [];
  const seen = new Set<string>();
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  const chunks: string[] = [];
  while ((m = re.exec(html)) && chunks.length < 5) {
    const src = m[1];
    if (!src) continue;
    if (!/^\/(?:assets|_build)\//.test(src) && !src.startsWith(ORIGIN)) continue;
    if (seen.has(src)) continue;
    seen.add(src);
    chunks.push(src.startsWith('http') ? src : `${ORIGIN}${src}`);
  }
  await Promise.all(
    chunks.map(async (url) => {
      try {
        const r = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(8_000),
        });
        if (r.status === 404 || r.status === 410) stale.push(url);
      } catch {
        // network failure isn't proof of stale; ignore.
      }
    }),
  );
  return stale;
}

async function probeDevMode(): Promise<{ devModeOn: boolean; error?: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { devModeOn: false, error: 'CLOUDFLARE_API_TOKEN missing' };
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/development_mode`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const j = (await res.json()) as {
      success?: boolean;
      result?: { value?: 'on' | 'off' };
    };
    if (!res.ok || !j.success) return { devModeOn: false, error: `CF ${res.status}` };
    return { devModeOn: j.result?.value === 'on' };
  } catch (e) {
    return {
      devModeOn: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runHealthProbe(): Promise<HealthProbeResult> {
  const currentBuildId = getCurrentBuildId();
  const errors: string[] = [];
  let cfCacheStatus = 'UNKNOWN';
  let edgeAgeSeconds = 0;
  let edgeBuildId = '';
  let ttfbMs = 0;
  let staleChunksList: string[] = [];
  let html = '';

  try {
    const o = await probeOrigin();
    cfCacheStatus = o.cfCacheStatus;
    edgeAgeSeconds = o.edgeAgeSeconds;
    edgeBuildId = o.edgeBuildId;
    ttfbMs = o.ttfbMs;
    html = o.html;
  } catch (e) {
    errors.push(`origin: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (html) {
    try {
      staleChunksList = await probeChunks(html);
    } catch (e) {
      errors.push(`chunks: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const dev = await probeDevMode();
  if (dev.error) errors.push(`devmode: ${dev.error}`);

  const buildMismatch = !!edgeBuildId && edgeBuildId !== currentBuildId;
  const staleChunksDetected = staleChunksList.length > 0;
  const ok =
    !buildMismatch && !staleChunksDetected && !dev.devModeOn && errors.length === 0;

  return {
    timestamp: Date.now(),
    cfCacheStatus,
    edgeAgeSeconds,
    edgeBuildId,
    currentBuildId,
    buildMismatch,
    staleChunksDetected,
    staleChunksList,
    devModeOn: dev.devModeOn,
    ttfbMs,
    ok,
    errors,
  };
}

export async function purgeCloudflareEverything(): Promise<{
  ok: boolean;
  status: number;
  detail?: string;
}> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { ok: false, status: 0, detail: 'CLOUDFLARE_API_TOKEN missing' };
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purge_everything: true }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const text = await res.text();
    return { ok: res.ok, status: res.status, detail: text.slice(0, 240) };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

// ── server-fn surface (admin-gated) ────────────────────────────────────────

const TokenSchema = z.object({ idToken: z.string().min(20).max(4096) });

export const getCacheHealth = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const result = await runHealthProbe();
    const setupNeeded = !process.env.CLOUDFLARE_API_TOKEN;
    return { ...result, setupNeeded };
  });

export const purgeCacheNow = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const r = await purgeCloudflareEverything();
    return { ...r, at: new Date().toISOString() };
  });

export const listHealthLogs = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    TokenSchema.extend({ limit: z.number().int().min(1).max(200).default(50) }).parse(
      input,
    ),
  )
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    try {
      const rows = await listDocsAdmin('admin_health_logs', {
        orderBy: 'timestamp',
        direction: 'DESCENDING',
        limit: data.limit,
      });
      return { ok: true as const, rows };
    } catch (e) {
      return {
        ok: false as const,
        rows: [] as Array<Record<string, unknown> & { id: string }>,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

export const listHealthAlerts = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => TokenSchema.parse(input))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    try {
      const rows = await listDocsAdmin('admin_alerts', {
        orderBy: 'timestamp',
        direction: 'DESCENDING',
        limit: 50,
      });
      return {
        ok: true as const,
        rows: rows.filter((r) => r.acknowledged !== true),
      };
    } catch (e) {
      return {
        ok: false as const,
        rows: [] as Array<Record<string, unknown> & { id: string }>,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

export const acknowledgeHealthAlert = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    TokenSchema.extend({ id: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireFirebaseAdmin(data.idToken);
    await updateDocAdmin('admin_alerts', data.id, {
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: user.email ?? user.uid,
    });
    return { ok: true as const };
  });
