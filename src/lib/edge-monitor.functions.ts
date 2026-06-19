import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

/**
 * Real-time edge-health monitor — samples Cloudflare cache, Prerender.io
 * rendering for Googlebot, and Firebase /__/auth/iframe response.
 *
 * Wired into:
 *   - EdgeMonitorTab (admin auto-refresh every 30s)
 * Stores one rolling sample per call in `edgeMonitorSamples/{ts}` and the
 * latest snapshot in `_meta/edge_monitor_latest`.
 *
 * Alert logic (panel only, no email):
 *   - "spike" = any single check failing OR p95 latency > 5s in last sample
 *   - "sustained" = same check failing in last 2 consecutive samples
 */

const ORIGIN = 'https://phlabs.co.uk';

const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/120.0.0.0 Safari/537.36';

export interface Probe {
  id: string;
  label: string;
  ok: boolean;
  status: number;
  ms: number;
  cfCache?: string | null;
  detail?: string;
}

export interface MonitorSample {
  timestamp: string;
  ok: boolean;
  failedCount: number;
  probes: Probe[];
}

const InputSchema = z.object({
  idToken: z.string().min(20).max(4096),
  persist: z.boolean().optional(),
  /** Whether to also fetch recent history (admin tab needs this). */
  withHistory: z.boolean().optional(),
});

async function timedFetch(url: string, init?: RequestInit): Promise<Probe & { _raw?: Response | null }> {
  const id = init?.headers && 'x-probe-id' in (init.headers as Record<string, string>)
    ? (init.headers as Record<string, string>)['x-probe-id']
    : url;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const ms = Date.now() - t0;
    return {
      id,
      label: id,
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      ms,
      cfCache: res.headers.get('cf-cache-status'),
      _raw: res,
    };
  } catch (e) {
    return {
      id,
      label: id,
      ok: false,
      status: 0,
      ms: Date.now() - t0,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runEdgeMonitor(): Promise<MonitorSample> {
  const [home, products, sitemap, authIframe, botHome, botProduct] = await Promise.all([
    timedFetch(`${ORIGIN}/`, { headers: { 'x-probe-id': 'cf-home' } }),
    timedFetch(`${ORIGIN}/products`, { headers: { 'x-probe-id': 'cf-products' } }),
    timedFetch(`${ORIGIN}/sitemap.xml`, { headers: { 'x-probe-id': 'cf-sitemap' } }),
    timedFetch(`${ORIGIN}/__/auth/iframe`, { headers: { 'x-probe-id': 'firebase-auth-iframe' } }),
    timedFetch(`${ORIGIN}/`, {
      headers: { 'x-probe-id': 'prerender-home', 'User-Agent': GOOGLEBOT_UA, Accept: 'text/html' },
    }),
    timedFetch(`${ORIGIN}/products`, {
      headers: { 'x-probe-id': 'prerender-products', 'User-Agent': GOOGLEBOT_UA, Accept: 'text/html' },
    }),
  ]);

  // Validate Prerender results contain real rendered HTML (>30KB), not the SPA shell (~15KB).
  // The shell is fine for users but for Googlebot we expect prerendered output.
  const prerenderOk = async (p: typeof botHome, minBytes: number): Promise<Probe> => {
    if (!p._raw || !p.ok) return { ...p, label: p.id, ok: false, detail: p.detail || `status ${p.status}` };
    let bytes = 0;
    try {
      const text = await p._raw.text();
      bytes = text.length;
    } catch {
      // ignore
    }
    const ok = bytes >= minBytes;
    return {
      id: p.id,
      label: p.id,
      ok,
      status: p.status,
      ms: p.ms,
      cfCache: p.cfCache,
      detail: `${bytes} bytes${ok ? '' : ` < ${minBytes} (prerender may be down)`}`,
    };
  };

  const probes: Probe[] = [
    { ...home, label: 'CF / (cached HTML)', id: home.id },
    { ...products, label: 'CF /products', id: products.id },
    { ...sitemap, label: 'CF /sitemap.xml', id: sitemap.id },
    { ...authIframe, label: 'Firebase /__/auth/iframe', id: authIframe.id },
    { ...(await prerenderOk(botHome, 30_000)), label: 'Prerender / (Googlebot)' },
    { ...(await prerenderOk(botProduct, 30_000)), label: 'Prerender /products (Googlebot)' },
  ].map(({ _raw, ...rest }: any) => rest);

  const failedCount = probes.filter((p) => !p.ok).length;
  return {
    timestamp: new Date().toISOString(),
    ok: failedCount === 0,
    failedCount,
    probes,
  };
}

export const probeEdgeMonitor = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      await requireFirebaseAdmin(data.idToken);
    } catch (e) {
      return {
        ok: false,
        error: 'unauthorized',
        reason: e instanceof Error ? e.message : 'auth_failed',
      } as const;
    }

    const sample = await runEdgeMonitor();

    let history: MonitorSample[] = [];
    if (data.persist || data.withHistory) {
      const { addDocAdmin, updateDocAdmin, getDocAdmin, listDocsAdmin } = await import(
        './server/firestore-admin'
      );

      if (data.persist) {
        try {
          await addDocAdmin('edgeMonitorSamples', sample);
          const meta = { ...sample, updatedAt: new Date().toISOString() };
          const existing = await getDocAdmin('_meta', 'edge_monitor_latest').catch(() => null);
          if (existing) await updateDocAdmin('_meta', 'edge_monitor_latest', meta);
          else await addDocAdmin('_meta', meta, 'edge_monitor_latest');
        } catch (e) {
          console.warn('[edge-monitor] persist failed:', e);
        }
      }

      if (data.withHistory) {
        try {
          const docs = await listDocsAdmin('edgeMonitorSamples', {
            orderBy: 'timestamp',
            orderDir: 'desc',
            limit: 40,
          });
          history = docs.map((d) => d as unknown as MonitorSample);
        } catch (e) {
          console.warn('[edge-monitor] history failed:', e);
        }
      }
    }

    // Sustained-failure detection: a probe failing in the latest sample AND
    // the previous one is a sustained outage (alert priority).
    const previous = history[1]; // 0 = the sample just persisted
    const sustainedFailures = previous
      ? sample.probes
          .filter((p) => !p.ok)
          .filter((p) => previous.probes.find((q) => q.id === p.id && !q.ok))
          .map((p) => p.id)
      : [];

    const spike = sample.failedCount > 0 || sample.probes.some((p) => p.ms > 5000);

    return {
      ok: true,
      sample,
      history,
      spike,
      sustainedFailures,
    } as const;
  });
