/**
 * Cloudflare Development Mode admin helpers.
 *
 * Dev Mode bypasses the edge cache for the WHOLE zone and auto-expires after
 * exactly 3 hours. When it flips off, Prerender.io may serve stale bot
 * snapshots referencing JS chunks from an older build → blank white page.
 * The admin banner uses `getDevModeStatus` to surface the active window
 * (and remaining time) so we never silently sit in this state.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const SETTING_URL = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/development_mode`;

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
  .inputValidator((i: unknown) => TokenInput.parse(i))
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
  .inputValidator((i: unknown) => SetSchema.parse(i))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const r = await cfFetch('PATCH', { value: data.value });
    return { ok: true as const, value: r.value, timeRemainingSec: r.time_remaining ?? 0 };
  });
