import { createFileRoute } from '@tanstack/react-router';
import { addDocAdmin, getDocAdmin } from '@/lib/server/firestore-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

const PRIMARY_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const ZONE_NAMES = ['phlabs.co.uk', 'prohealthpeptides.co.uk'] as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, private, no-cache, must-revalidate, max-age=0, s-maxage=0',
      'cdn-cache-control': 'no-store',
      'cloudflare-cdn-cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i += 1) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function readConfiguredToken(): Promise<string | null> {
  const doc = await getDocAdmin('siteConfig', 'emergencyPurgeToken').catch(() => null);
  const firestoreToken = typeof doc?.token === 'string' ? doc.token.trim() : '';
  const envToken = (process.env.EMERGENCY_PURGE_TOKEN || process.env.CACHE_PURGE_TOKEN || process.env.CLEANUP_SECRET || '').trim();
  return firestoreToken || envToken || null;
}

async function parseToken(request: Request): Promise<string> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    return typeof body?.token === 'string' ? body.token : '';
  }
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const token = form?.get('token');
    return typeof token === 'string' ? token : '';
  }
  const raw = await request.text().catch(() => '');
  return new URLSearchParams(raw).get('token') ?? '';
}

async function getZoneIdByName(token: string, zoneName: string): Promise<string | null> {
  if (zoneName === 'phlabs.co.uk') return PRIMARY_ZONE_ID;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&status=active`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { result?: Array<{ id?: string }> };
    return data.result?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function purgeZone(token: string, zoneName: string): Promise<{ zoneName: string; ok: boolean; status: number; skipped?: boolean; error?: string }> {
  const zoneId = await getZoneIdByName(token, zoneName);
  if (!zoneId) return { zoneName, ok: false, status: 0, skipped: true, error: 'zone_not_found_or_not_permitted' };
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ purge_everything: true }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text().catch(() => '');
    return { zoneName, ok: res.ok, status: res.status, error: res.ok ? undefined : body.slice(0, 500) };
  } catch (e) {
    return { zoneName, ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function forceRefreshHome(): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch('https://phlabs.co.uk/', {
      headers: {
        'user-agent': 'phlabs-emergency-purge/1.0',
        'x-force-refresh': 'true',
        'cache-control': 'no-cache',
      },
      signal: AbortSignal.timeout(15_000),
    });
    await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export const Route = createFileRoute('/api/public/emergency-purge')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, '/api/public/emergency-purge', {
          limit: 5,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const configuredToken = await readConfiguredToken();
        const suppliedToken = await parseToken(request);
        if (!configuredToken || !suppliedToken || !constantTimeEqual(suppliedToken, configuredToken)) {
          await addDocAdmin('auditLogs', {
            kind: 'emergency_purge_denied',
            createdAt: new Date(),
          }).catch(() => undefined);
          return json({ success: false, error: 'Forbidden' }, 403);
        }

        const cfToken = process.env.CLOUDFLARE_API_TOKEN;
        if (!cfToken) return json({ success: false, error: 'CLOUDFLARE_API_TOKEN missing' }, 500);

        const purgedAt = new Date().toISOString();
        const zones = await Promise.all(ZONE_NAMES.map((zoneName) => purgeZone(cfToken, zoneName)));
        const worker = await forceRefreshHome();
        const success = zones.some((z) => z.ok) && worker.ok;

        await addDocAdmin('auditLogs', {
          kind: 'emergency_purge',
          zones,
          worker,
          success,
          purgedAt,
          createdAt: new Date(),
        }).catch(() => undefined);

        return json({
          success,
          purgedAt,
          message: success ? 'Cache purged' : 'Purge attempted; check zone results',
          zones,
          worker,
        }, success ? 200 : 502);
      },
    },
  },
});