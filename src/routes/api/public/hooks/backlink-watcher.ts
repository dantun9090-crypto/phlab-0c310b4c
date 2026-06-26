/**
 * Backlink Watcher — weekly cron.
 *
 * Snapshots Semrush referring-domains for phlabs.co.uk, diffs against the
 * previous snapshot, and alerts (Telegram + email) on:
 *   - any new referring domain that matches a spam pattern
 *   - large Authority Score drop (>= 2 points)
 *   - significant refdomain churn (>= 5 new or >= 5 lost in one run)
 *
 * Storage: Firestore collection `backlink_snapshots`
 *   - doc `latest`           → most recent successful snapshot (used as diff baseline)
 *   - doc `run-{iso-ts}`     → full historical run (rolling, kept indefinitely)
 *
 * Auth: `x-watchdog-secret` or `x-cleanup-secret` header must equal CLEANUP_SECRET.
 * Schedule: weekly via pg_cron, e.g.
 *   SELECT cron.schedule('backlink-watcher-weekly', '0 7 * * 1', $$
 *     SELECT net.http_post(
 *       url := 'https://phlabs.co.uk/api/public/hooks/backlink-watcher',
 *       headers := '{"x-watchdog-secret":"<CLEANUP_SECRET>","Content-Type":"application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     );
 *   $$);
 */
import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqualStr } from '@/lib/timing-safe-equal';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  runBacklinkWatcher,
  type BacklinkWatcherResult,
} from '@/lib/backlink-watcher.server';

const ENDPOINT = '/api/public/hooks/backlink-watcher';

export const Route = createFileRoute('/api/public/hooks/backlink-watcher')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 4,
          windowMs: 60_000,
          retryAfterSec: 120,
        });
        if (limited) return limited;

        const expected = process.env.CLEANUP_SECRET;
        const provided =
          request.headers.get('x-watchdog-secret') ||
          request.headers.get('x-cleanup-secret');
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          const result: BacklinkWatcherResult = await runBacklinkWatcher({
            triggeredBy: 'cron',
          });
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error('[backlink-watcher] failed', e);
          return Response.json(
            { ok: false, error: String(e?.message ?? e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
