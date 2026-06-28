/**
 * Weekly /compound query history cron.
 *
 * Auth: `x-cleanup-secret` header must equal CLEANUP_SECRET env (reused
 * shared secret — same pattern as health-check / watchdog hooks).
 *
 * Behaviour:
 *  - Loads thresholds from settings/compoundQueryThresholds.
 *  - Runs analyzeCompoundQueries() for /compound and /landing/phlabs.
 *  - Writes one summary doc per page to compound_query_history.
 *
 * Recommended schedule: weekly (Mon 06:00 UTC) via pg_cron.
 */
import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqualStr } from '@/lib/timing-safe-equal';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  analyzeCompoundQueries,
  DEFAULT_THRESHOLDS,
  validateThresholds,
  retryWithBackoff,
  type CompoundThresholds,
} from '@/lib/compound-queries.functions';
import { addDocAdmin, getDocAdmin } from '@/lib/server/firestore-admin';

function newRunCorrelationId(): string {
  return `cron-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}


const ENDPOINT = '/api/public/hooks/compound-query-history';

export const Route = createFileRoute('/api/public/hooks/compound-query-history')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, ENDPOINT, {
          limit: 10,
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

        let thresholds: CompoundThresholds = DEFAULT_THRESHOLDS;
        try {
          const d = (await getDocAdmin('settings', 'compoundQueryThresholds')) as
            | Partial<CompoundThresholds>
            | null;
          if (d) {
            try {
              thresholds = validateThresholds({
                minImpressions: Number(d.minImpressions),
                growthRatio: Number(d.growthRatio),
                windowDays: Number(d.windowDays),
              });
            } catch {
              // Stored thresholds are invalid — fall back to defaults rather
              // than running the job with bad inputs.
              thresholds = DEFAULT_THRESHOLDS;
            }
          }
        } catch { /* use defaults */ }


        const pages: Array<'/compound' | '/landing/phlabs'> = ['/compound', '/landing/phlabs'];
        const correlationId = newRunCorrelationId();
        const results: Array<{
          pagePath: string;
          ok: boolean;
          error?: string;
          attempts?: Array<{ attempt: number; delayMs: number; error?: string }>;
        }> = [];

        for (const p of pages) {
          let attempts: Array<{ attempt: number; delayMs: number; error?: string }> = [];
          try {
            const { result: r, attempts: a } = await retryWithBackoff(
              () => analyzeCompoundQueries(thresholds.windowDays, p, thresholds),
              { maxAttempts: 3, baseDelayMs: 800 },
            );
            attempts = a;
            const slim = r.rows.slice(0, 100).map((row) => ({
              query: row.query,
              clicks: row.clicks,
              impressions: row.impressions,
              ctr: Number(row.ctr.toFixed(4)),
              position: Number(row.position.toFixed(1)),
              deltaImpressions: row.deltaImpressions,
              deltaClicks: row.deltaClicks,
              trending: row.trending,
              riskTokens: row.riskTokens,
            }));
            await addDocAdmin('compound_query_history', {
              correlationId,
              pagePath: r.pagePath,
              siteUrl: r.siteUrl,
              startDate: r.startDate,
              endDate: r.endDate,
              days: r.days,
              thresholds: r.thresholds,
              totalRows: r.totalRows,
              totalImpressions: r.totalImpressions,
              totalClicks: r.totalClicks,
              riskyCount: r.riskyCount,
              riskyTrendingCount: r.riskyTrendingCount,
              riskyTrendingQueries: r.rows
                .filter((x) => x.riskTokens.length > 0 && x.trending)
                .map((x) => x.query)
                .slice(0, 50),
              topRows: slim,
              retryAttempts: attempts,
              fetchedAt: r.fetchedAt,
              createdAt: new Date(),
            });
            results.push({ pagePath: p, ok: true, attempts });
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            // Audit failed runs too so retry history is preserved.
            try {
              await addDocAdmin('compound_query_history', {
                correlationId,
                pagePath: p,
                ok: false,
                error: errorMsg,
                retryAttempts: attempts,
                thresholds,
                createdAt: new Date(),
              });
            } catch { /* non-fatal */ }
            results.push({ pagePath: p, ok: false, error: errorMsg, attempts });
          }
        }

        return new Response(
          JSON.stringify({ ok: true, correlationId, results, ranAt: new Date().toISOString() }),
          { headers: { 'content-type': 'application/json' } },
        );

      },
    },
  },
});
