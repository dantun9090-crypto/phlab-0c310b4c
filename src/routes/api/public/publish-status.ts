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

        const [buildState, recentAuditRows, recentErrorRows] = await Promise.all([
          getDocAdmin('_meta', 'build_state').catch(() => null),
          listDocsAdmin('auditLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 100,
          }).catch(() => [] as Array<Record<string, unknown> & { id: string }>),
          listDocsAdmin('errorLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 50,
          }).catch(() => [] as Array<Record<string, unknown> & { id: string }>),
        ]);

        const lastBuildId = (buildState?.lastBuildId as string | undefined) ?? null;
        const updatedAtMs = parseTs(buildState?.updatedAt);
        const buildMatch = lastBuildId !== null && lastBuildId === currentBuildId;

        const lastAudit = recentAuditRows.find((row) => row.kind === 'post_publish_auto_invalidation') ?? null;
        const errorRows = recentErrorRows.filter((row) => row.type === 'audit_log_failure').slice(0, 5);
        const cf = (lastAudit?.cloudflare as { ok?: boolean; status?: number } | undefined) ?? null;
        const pr = (lastAudit?.prerender as { ok?: boolean; urls?: number } | undefined) ?? null;
        const buildStatePurgeRequested = buildState?.lastPurgeOk !== undefined || buildState?.lastPurgeStatus !== undefined;
        const lastPurgeRequested = cf !== null || buildStatePurgeRequested;
        const lastPurgeOk = cf?.ok ?? buildState?.lastPurgeOk ?? false;
        const lastPurgeStatus = cf?.status ?? buildState?.lastPurgeStatus ?? null;
        const buildStateRecacheRequested = buildState?.lastRecacheOk !== undefined || buildState?.lastRecacheUrls !== undefined;
        const lastRecacheRequested = pr !== null || buildStateRecacheRequested;
        const lastRecacheOk = pr?.ok ?? buildState?.lastRecacheOk ?? false;
        const lastRecacheUrls = pr?.urls ?? buildState?.lastRecacheUrls ?? null;
        const lastInvalidationBuildId = (buildState?.lastInvalidationBuildId as string | undefined) ?? null;
        const lastInvalidationAt = buildState?.lastInvalidationAt ?? null;
        const lastCheckTime = parseTs(lastAudit?.createdAt) ?? parseTs(lastInvalidationAt);

        return json({
          currentBuildId,
          lastBuildId,
          buildMatch,
          buildState: {
            lastBuildId,
            previousBuildId: buildState?.previousBuildId ?? null,
            updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : null,
            lastInvalidationBuildId,
            lastInvalidationAt,
            lastPurgeOk: buildState?.lastPurgeOk ?? null,
            lastPurgeStatus: buildState?.lastPurgeStatus ?? null,
            lastRecacheOk: buildState?.lastRecacheOk ?? null,
            lastAuditOk: buildState?.lastAuditOk ?? null,
          },
          lastCheckTime,
          lastCheckSuccess: !!lastAudit || lastInvalidationBuildId === currentBuildId,
          lastCheckBuildId: lastAudit?.buildId ?? lastInvalidationBuildId,
          lastPurgeRequested,
          lastPurgeOk,
          lastPurgeStatus,
          lastRecacheRequested,
          lastRecacheOk,
          lastRecacheUrls,
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
