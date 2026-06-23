/**
 * Admin-only trigger for the Watchdog Bot. Verifies the caller is a
 * Firebase admin, then invokes the public watchdog endpoint server-side
 * with the shared CLEANUP_SECRET header (never exposed to the client).
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const Input = z.object({ idToken: z.string().min(20).max(4096) });
const ENDPOINT = 'https://phlabs.co.uk/api/public/hooks/watchdog';

export const triggerWatchdogRun = createServerFn({ method: 'POST' })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const secret = process.env.CLEANUP_SECRET;
    if (!secret) throw new Error('CLEANUP_SECRET missing');
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-watchdog-secret': secret,
      },
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    if (!res.ok) {
      const detail = typeof body === 'string' ? body : JSON.stringify(body);
      throw new Error(`Watchdog run failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    return {
      ok: true as const,
      status: String(obj.status ?? 'unknown'),
      totalChecks: Number(obj.totalChecks ?? 0),
      failed: Number(obj.failed ?? 0),
    };
  });
