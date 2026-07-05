import { createFileRoute } from '@tanstack/react-router';
import { enforceRateLimit } from '@/lib/rate-limit';
import { listDocsAdmin } from '@/lib/server/firestore-admin';

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

export const Route = createFileRoute('/api/public/post-publish-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await enforceRateLimit(request, '/api/public/post-publish-status', {
          limit: 60,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const [stepRows, summaryRows] = await Promise.all([
          listDocsAdmin('auditLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 10,
            where: { field: 'kind', op: 'EQUAL', value: 'post_publish_step' },
          }),
          listDocsAdmin('auditLogs', {
            orderBy: 'createdAt',
            direction: 'DESCENDING',
            limit: 10,
            where: { field: 'kind', op: 'EQUAL', value: 'post_publish_auto_invalidation' },
          }),
        ]).catch((e) => {
          throw new Error(e instanceof Error ? e.message : String(e));
        });

        const entries = [...stepRows, ...summaryRows]
          .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
          .slice(0, 10)
          .map((row) => ({
            id: row.id,
            kind: row.kind ?? null,
            message: row.message ?? null,
            buildId: row.buildId ?? null,
            previousBuildId: row.previousBuildId ?? null,
            changed: row.changed ?? null,
            needsInvalidation: row.needsInvalidation ?? null,
            status: row.status ?? null,
            ok: row.ok ?? null,
            cloudflare: row.cloudflare ?? null,
            worker: row.worker ?? null,
            prerender: row.prerender ?? null,
            durationMs: row.durationMs ?? null,
            createdAt: row.createdAt ?? null,
          }));

        return json({
          ok: true,
          currentBuildId: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
          count: entries.length,
          entries,
          checkedAt: new Date().toISOString(),
        });
      },
    },
  },
});