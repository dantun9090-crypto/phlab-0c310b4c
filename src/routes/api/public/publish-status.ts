import { createFileRoute } from '@tanstack/react-router';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getDocAdmin, listDocsAdmin } from '@/lib/server/firestore-admin';

/**
 * Aggregated publish-status feed for the admin panel `Publish Status` tab.
 *
 * Returns only non-sensitive diagnostic fields (build IDs, booleans,
 * timestamps) — safe to expose on /api/public/*. Rate-limited.
 */

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
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

export const Route = createFileRoute('/api/public/publish-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await enforceRateLimit(request, 'publish-status', {
          limit: 60,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const currentBuildId = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown';

        const [buildState, auditRows, errorRows] = await Promise.all([
          getDocAdmin('_meta', 'build_state').catch(() => null),
          listDocsAdmin('auditLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 1,
            where: { field: 'kind', op: 'EQUAL', value: 'post_publish_auto_invalidation' },
          }).catch(() => [] as Array<Record<string, unknown> & { id: string }>),
          listDocsAdmin('errorLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 5,
            where: { field: 'type', op: 'EQUAL', value: 'audit_log_failure' },
          }).catch(() => [] as Array<Record<string, unknown> & { id: string }>),
        ]);

        const lastBuildId = (buildState?.lastBuildId as string | undefined) ?? null;
        const updatedAtMs = parseTs(buildState?.updatedAt);
        const buildMatch = lastBuildId !== null && lastBuildId === currentBuildId;

        const lastAudit = auditRows[0] ?? null;
        const cf = (lastAudit?.cloudflare as { ok?: boolean; status?: number } | undefined) ?? null;
        const pr = (lastAudit?.prerender as { ok?: boolean; urls?: number } | undefined) ?? null;

        return json({
          currentBuildId,
          lastBuildId,
          buildMatch,
          buildState: {
            lastBuildId,
            previousBuildId: buildState?.previousBuildId ?? null,
            updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : null,
          },
          lastCheckTime: parseTs(lastAudit?.createdAt),
          lastCheckSuccess: !!lastAudit,
          lastCheckBuildId: lastAudit?.buildId ?? null,
          lastPurgeRequested: cf !== null,
          lastPurgeOk: cf?.ok === true,
          lastPurgeStatus: cf?.status ?? null,
          lastRecacheRequested: pr !== null,
          lastRecacheOk: pr?.ok === true,
          lastRecacheUrls: pr?.urls ?? null,
          recentAuditFailures: errorRows.length,
          recentAuditFailureSample: errorRows.slice(0, 3).map((r) => ({
            id: r.id,
            error: r.error ?? null,
            createdAt: r.createdAt ?? null,
          })),
          checkedAt: new Date().toISOString(),
        });
      },
    },
  },
});
