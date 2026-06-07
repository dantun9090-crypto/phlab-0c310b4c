import { createServerFn } from '@tanstack/react-start';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GOOGLEBOT_UA =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const CACHE_ROUTES = ['/', '/products', '/about', '/contact'];
const BOT_ROUTES = ['/', '/products'];
const ORIGIN = 'https://phlabs.co.uk';

interface RouteSample {
  path: string;
  attempts: Array<{ status: number; cfCache: string | null; ms: number }>;
  hits: number;
  total: number;
  avgMs: number;
}

interface BotSample {
  path: string;
  status: number;
  ms: number;
  prerendered: boolean;
  prerenderCache: string | null;
  cfCache: string | null;
  rejectReason: string | null;
}

async function timedFetch(url: string, ua: string) {
  const t = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': ua, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(15_000),
    });
    // drain body so timing reflects full response
    await res.text().catch(() => '');
    return {
      status: res.status,
      cfCache: res.headers.get('cf-cache-status'),
      prerendered: res.headers.get('x-prerendered') === 'true',
      prerenderCache: res.headers.get('x-prerender-cache'),
      rejectReason: res.headers.get('x-prerender-reject-reason'),
      ms: Date.now() - t,
    };
  } catch (err) {
    return {
      status: 0,
      cfCache: null,
      prerendered: false,
      prerenderCache: null,
      rejectReason: null,
      ms: Date.now() - t,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const probeEdgeHealth = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== 'string') throw new Error('idToken required');
    return data;
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    // CF cache: 3 sequential attempts per route (warm the edge, then measure HIT%)
    const cache: RouteSample[] = [];
    for (const path of CACHE_ROUTES) {
      const attempts: RouteSample['attempts'] = [];
      for (let i = 0; i < 3; i++) {
        const r = await timedFetch(ORIGIN + path, BROWSER_UA);
        attempts.push({ status: r.status, cfCache: r.cfCache, ms: r.ms });
      }
      const hits = attempts.filter((a) => a.cfCache === 'HIT').length;
      const avgMs = Math.round(attempts.reduce((s, a) => s + a.ms, 0) / attempts.length);
      cache.push({ path, attempts, hits, total: attempts.length, avgMs });
    }

    // Prerender: bot UA, single shot
    const bots: BotSample[] = [];
    for (const path of BOT_ROUTES) {
      const r = await timedFetch(ORIGIN + path, GOOGLEBOT_UA);
      bots.push({
        path,
        status: r.status,
        ms: r.ms,
        prerendered: r.prerendered,
        prerenderCache: r.prerenderCache,
        cfCache: r.cfCache,
        rejectReason: r.rejectReason,
      });
    }

    const totalAttempts = cache.reduce((s, r) => s + r.total, 0);
    const totalHits = cache.reduce((s, r) => s + r.hits, 0);
    const hitRate = totalAttempts > 0 ? Math.round((totalHits / totalAttempts) * 100) : 0;
    const prerenderActive = bots.some((b) => b.prerendered);

    return {
      checkedAt: new Date().toISOString(),
      origin: ORIGIN,
      cache,
      bots,
      summary: {
        hitRate,
        totalHits,
        totalAttempts,
        prerenderActive,
      },
    } as const;
  });
