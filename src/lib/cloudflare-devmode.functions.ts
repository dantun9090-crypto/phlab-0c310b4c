/**
 * Cloudflare Development Mode admin helpers.
 *
 * Dev Mode bypasses the edge cache for the WHOLE zone and auto-expires after
 * exactly 3 hours. When it flips off, Prerender.io may serve stale bot
 * snapshots referencing JS chunks from an older build → blank white page.
 * The admin banner uses `getDevModeStatus` to surface the active window
 * (and remaining time) so we never silently sit in this state.
 *
 * `setDevModeAndPurge` is the "safe" turn-off: it flips Dev Mode off AND
 * fires a full CF cache purge + Prerender.io recache of critical URLs in
 * the same call, so the site can never end up in the "Dev Mode expired,
 * stale prerender snapshot served, blank page" state.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const SETTING_URL = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/development_mode`;
const PURGE_URL = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache`;
const ORIGIN = 'https://phlabs.co.uk';

const TokenInput = z.object({ idToken: z.string().min(20).max(4096) });

async function cfFetch(method: 'GET' | 'PATCH', body?: unknown) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN missing');
  const res = await fetch(SETTING_URL, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as {
    success: boolean;
    result?: { value: 'on' | 'off'; time_remaining?: number; modified_on?: string | null };
    errors?: unknown;
  };
  if (!res.ok || !json.success) {
    throw new Error(`Cloudflare ${method} failed: ${res.status} ${JSON.stringify(json.errors)}`);
  }
  return json.result!;
}

export const getDevModeStatus = createServerFn({ method: 'POST' })
  .validator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const r = await cfFetch('GET');
    return {
      ok: true as const,
      value: r.value,
      timeRemainingSec: r.time_remaining ?? 0,
      modifiedOn: r.modified_on ?? null,
    };
  });

const SetSchema = TokenInput.extend({ value: z.enum(['on', 'off']) });

export const setDevMode = createServerFn({ method: 'POST' })
  .validator((i: unknown) => SetSchema.parse(i))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const r = await cfFetch('PATCH', { value: data.value });
    return { ok: true as const, value: r.value, timeRemainingSec: r.time_remaining ?? 0 };
  });

// ── Turn off + purge + recache (single admin action) ────────────────────
const CRITICAL_URLS = [
  `${ORIGIN}/`,
  `${ORIGIN}/products`,
  `${ORIGIN}/sitemap.xml`,
  `${ORIGIN}/robots.txt`,
  `${ORIGIN}/products/category/metabolic-signaling`,
  `${ORIGIN}/products/category/tissue-repair`,
  `${ORIGIN}/products/category/cognitive-research`,
  `${ORIGIN}/products/category/longevity`,
  `${ORIGIN}/products/category/growth-hormone`,
  `${ORIGIN}/products/category/skin-research`,
  `${ORIGIN}/products/category/blends`,
];

async function purgeEverything(): Promise<{ ok: boolean; status: number; detail?: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { ok: false, status: 0, detail: 'CLOUDFLARE_API_TOKEN missing' };
  try {
    const res = await fetch(PURGE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ purge_everything: true }),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function recachePrerender(): Promise<{
  ok: boolean;
  desktop: { ok: boolean; status: number };
  mobile: { ok: boolean; status: number };
  detail?: string;
}> {
  const token = process.env.PRERENDER_TOKEN;
  if (!token) {
    const stub = { ok: false, status: 0 };
    return { ok: false, desktop: stub, mobile: stub, detail: 'PRERENDER_TOKEN missing' };
  }
  const post = async (adaptiveType: 'desktop' | 'mobile') => {
    try {
      const res = await fetch('https://api.prerender.io/recache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Prerender-Token': token },
        body: JSON.stringify({ prerenderToken: token, urls: CRITICAL_URLS, adaptiveType }),
        signal: AbortSignal.timeout(15_000),
      });
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: 0 };
    }
  };
  const [desktop, mobile] = await Promise.all([post('desktop'), post('mobile')]);
  return { ok: desktop.ok && mobile.ok, desktop, mobile };
}

export const setDevModeAndPurge = createServerFn({ method: 'POST' })
  .validator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    // 1) Flip Dev Mode off (idempotent — safe even if already off).
    const cf = await cfFetch('PATCH', { value: 'off' });
    // 2) Purge everything so no stale entries survive.
    const purge = await purgeEverything();
    // 3) Recache Prerender.io for the critical URLs (bots).
    const prerender = await recachePrerender();
    return {
      ok: true as const,
      devMode: { value: cf.value },
      purge,
      prerender,
      timestamp: new Date().toISOString(),
    };
  });

