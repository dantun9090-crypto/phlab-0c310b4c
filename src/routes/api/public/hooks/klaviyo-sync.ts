/**
 * Scheduled Klaviyo reconciliation hook — run daily via GitHub Actions cron.
 *
 * POST /api/public/hooks/klaviyo-sync
 * Header: x-klaviyo-sync-secret: <KLAVIYO_SYNC_SECRET>
 *
 * Subscribes active Firestore subscribers to the Klaviyo newsletter list and
 * suppresses unsubscribed/bounced/deleted ones. Idempotent — safe to re-run.
 * Catches any sign-up whose real-time mirror failed (Klaviyo outage, network
 * hiccup) and keeps marketing consent enforceable in Klaviyo.
 *
 * Auth: dedicated pre-shared secret (KLAVIYO_SYNC_SECRET env var). The route
 * lives under /api/public/* so it bypasses edge auth — verification is here.
 */
import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqualStr } from '@/lib/timing-safe-equal';
import { enforceRateLimit } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/public/hooks/klaviyo-sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ENDPOINT = '/api/public/hooks/klaviyo-sync';

        // 1) Default per-IP throttle.
        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 120,
        });
        if (limited) return limited;

        const expected = process.env.KLAVIYO_SYNC_SECRET;
        const provided = request.headers.get('x-klaviyo-sync-secret');
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          // 2) Separate bad-auth bucket.
          const badAuthLimited = await enforceRateLimit(request, ENDPOINT, {
            limit: 10,
            windowMs: 60_000,
            retryAfterSec: 120,
            bucketKind: 'bad-auth',
          });
          if (badAuthLimited) return badAuthLimited;
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          const { reconcileKlaviyoList, saveKlaviyoConfig } = await import('@/lib/klaviyo.server');
          const { addDocAdmin } = await import('@/lib/server/firestore-admin');
          const result = await reconcileKlaviyoList();
          const now = new Date().toISOString();
          await saveKlaviyoConfig({ lastSyncAt: now, lastSyncResult: result });
          await addDocAdmin('auditLogs', {
            action: 'klaviyo.scheduled_sync',
            adminUid: 'cron',
            adminEmail: null,
            details: result,
            timestamp: new Date(),
          }).catch(() => undefined);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error('[klaviyo-sync] reconciliation failed:', err);
          return Response.json({ ok: false, error: 'sync_failed' }, { status: 500 });
        }
      },
    },
  },
});
