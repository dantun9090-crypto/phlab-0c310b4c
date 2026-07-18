import { createFileRoute } from '@tanstack/react-router';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getDocAdmin, listDocsAdmin } from '@/lib/server/firestore-admin';

/**
 * Diagnostic: report whether Firestore `_meta/build_state` matches the
 * currently-deployed BUILD_ID, so external monitoring can alert when
 * `/api/public/post-publish-check` stops firing on deploys.
 *
 * Also surfaces the last `auditLogs` entry of kind
 * `post_publish_auto_invalidation` so we can see if purge + recache were
 * requested for the current build.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

function parseTs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof v === 'object' && v !== null && 'seconds' in (v as Record<string, unknown>)) {
    const s = (v as { seconds?: unknown }).seconds;
    return typeof s === 'number' ? s * 1000 : null;
  }
  return null;
}

export const Route = createFileRoute('/api/public/diag/build-state')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await enforceRateLimit(request, 'diag-build-state', {
          limit: 60,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const started = Date.now();
        const currentBuildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown';

        let buildState: Record<string, unknown> | null = null;
        try {
          buildState = await getDocAdmin('_meta', 'build_state');
        } catch (err) {
          console.error('[diag.build-state] firestore read failed:', err instanceof Error ? err.message : String(err));
          return json({
            error: 'firestore_read_failed',
            code: 'FIRESTORE_READ_FAILED',
            currentBuildId,
          }, 500);
        }

        const lastBuildId = (buildState?.lastBuildId as string | undefined) ?? null;
        const updatedAtMs = parseTs(buildState?.updatedAt);
        const secondsSinceUpdate = updatedAtMs !== null
          ? Math.floor((Date.now() - updatedAtMs) / 1000)
          : null;
        const match = lastBuildId !== null && lastBuildId === currentBuildId;

        // Fetch last post-publish-check audit entry for this or previous build.
        let lastAudit: (Record<string, unknown> & { id: string }) | null = null;
        try {
          const rows = await listDocsAdmin('auditLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 1,
            where: { field: 'kind', op: 'EQUAL', value: 'post_publish_auto_invalidation' },
          });
          lastAudit = rows[0] ?? null;
        } catch {
          /* ignore */
        }

        let status: 'ok' | 'stale' | 'unknown';
        if (!lastBuildId) status = 'unknown';
        else if (match) status = 'ok';
        else status = 'stale';

        return json({
          status,
          currentBuildId,
          lastBuildId,
          match,
          updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : null,
          secondsSinceUpdate,
          lastAudit: lastAudit
            ? {
                id: lastAudit.id,
                buildId: lastAudit.buildId ?? null,
                cloudflare: lastAudit.cloudflare ?? null,
                prerender: lastAudit.prerender ?? null,
                createdAt: lastAudit.createdAt ?? null,
                durationMs: lastAudit.durationMs ?? null,
              }
            : null,
          alert: status !== 'ok'
            ? `build_state does not match current build (last: ${lastBuildId ?? 'none'}, current: ${currentBuildId})`
            : null,
          checkDurationMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
        });
      },
    },
  },
});
