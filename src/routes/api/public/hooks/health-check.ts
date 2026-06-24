/**
 * Auto Health Check — cron-driven (every 5 min via external scheduler).
 *
 * Auth: `x-cleanup-secret` header must equal CLEANUP_SECRET env (reused
 * shared secret — no new secret needed). Same pattern as watchdog hook.
 *
 * Behaviour:
 *  - Runs runHealthProbe() against phlabs.co.uk.
 *  - Writes summary doc to `admin_health_logs`.
 *  - If buildMismatch || staleChunksDetected → fires a Cloudflare
 *    `purge_everything` and tags the log with autoAction: 'PURGE_EXECUTED'.
 *  - If devModeOn → inserts a critical row into `admin_alerts`.
 */
import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqualStr } from '@/lib/timing-safe-equal';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  runHealthProbe,
  purgeCloudflareEverything,
} from '@/lib/health-monitor.functions';
import { addDocAdmin } from '@/lib/server/firestore-admin';

const ENDPOINT = '/api/public/hooks/health-check';

export const Route = createFileRoute('/api/public/hooks/health-check')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 120,
        });
        if (limited) return limited;

        const expected = process.env.CLEANUP_SECRET;
        const provided =
          request.headers.get('x-cleanup-secret') ||
          request.headers.get('x-watchdog-secret');
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          const bad = await enforceRateLimit(request, ENDPOINT, {
            limit: 10,
            windowMs: 60_000,
            retryAfterSec: 120,
            bucketKind: 'bad-auth',
          });
          if (bad) return bad;
          return new Response('Unauthorized', { status: 401 });
        }

        const result = await runHealthProbe();

        let autoAction: string | null = null;
        let purgeStatus = 0;
        if (result.buildMismatch || result.staleChunksDetected) {
          const purge = await purgeCloudflareEverything();
          autoAction = purge.ok ? 'PURGE_EXECUTED' : 'PURGE_FAILED';
          purgeStatus = purge.status;
        }

        try {
          await addDocAdmin('admin_health_logs', {
            ...result,
            staleChunksList: result.staleChunksList.join(','),
            errors: result.errors.join(' | '),
            autoAction,
            purgeStatus,
            createdAt: new Date().toISOString(),
          });
        } catch {
          /* best-effort */
        }

        if (result.devModeOn) {
          try {
            await addDocAdmin('admin_alerts', {
              severity: 'critical',
              message: 'Cloudflare Development Mode is ON — edge cache is bypassed.',
              source: 'health-check',
              acknowledged: false,
              timestamp: Date.now(),
              createdAt: new Date().toISOString(),
            });
          } catch {
            /* best-effort */
          }
        }

        return Response.json({
          ok: result.ok,
          autoAction,
          purgeStatus,
          result,
        });
      },
    },
  },
});
