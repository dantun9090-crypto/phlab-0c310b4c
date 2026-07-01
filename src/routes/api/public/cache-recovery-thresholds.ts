/**
 * Percentile-based alert thresholds for cache-recovery telemetry.
 *
 * Computes hourly buckets of `sw_cache_recovery_triggered`,
 * `sw_cache_recovery_failed`, and cache-reset-shown events over the last
 * 7 days, then returns the p50/p95/p99 per event type so the monitor
 * workflow can alert only on genuine anomalies instead of a fixed count.
 *
 * The rolling baseline dramatically reduces false alarms during quiet
 * weeks (where 3 fires/hour is huge) and prevents alert fatigue during
 * noisy weeks (where 3 fires/hour is normal). It still catches instant
 * regressions — the "cache reset shown" event has a hard-floor threshold
 * because a single occurrence is always significant.
 *
 * Public, no PII, safe to expose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { listDocsAdmin } from "@/lib/server/firestore-admin";

interface Row {
  event: string;
  clientTs?: number;
}

const LOOKBACK_HOURS = 24 * 7;
const HARD_FLOOR = {
  recoveryTriggered: 3, // never alert below this per hour
  recoveryFailed: 1,
  cacheResetShown: 1,   // instant — one occurrence is significant
  criticalRoute: 1,
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function bucketize(rows: Row[], eventName: string, hours: number): number[] {
  const now = Date.now();
  const buckets = new Array(hours).fill(0) as number[];
  for (const r of rows) {
    if (r.event !== eventName) continue;
    const ts = Number(r.clientTs || 0);
    if (!ts) continue;
    const ageH = Math.floor((now - ts) / 3600_000);
    if (ageH < 0 || ageH >= hours) continue;
    buckets[ageH] += 1;
  }
  return buckets.sort((a, b) => a - b);
}

export const Route = createFileRoute("/api/public/cache-recovery-thresholds")({
  server: {
    handlers: {
      GET: async () => {
        const since = Date.now() - LOOKBACK_HOURS * 3600_000;
        let rows: Row[] = [];
        try {
          rows = (await listDocsAdmin("sw_telemetry", {
            orderBy: "clientTs",
            direction: "DESCENDING",
            limit: 20000,
            rangeFilter: { field: "clientTs", gte: since },
          })) as unknown as Row[];
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error)?.message?.slice(0, 200) }),
            { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } },
          );
        }

        const buckets = {
          recoveryTriggered: bucketize(rows, "sw_cache_recovery_triggered", LOOKBACK_HOURS),
          recoveryFailed: bucketize(rows, "sw_cache_recovery_failed", LOOKBACK_HOURS),
          cacheResetShown: bucketize(rows, "sw_cache_reset_shown", LOOKBACK_HOURS),
        };

        const build = (b: number[], floor: number) => ({
          p50: percentile(b, 50),
          p95: percentile(b, 95),
          p99: percentile(b, 99),
          max: b[b.length - 1] || 0,
          // Recommended alert threshold: max(p95 + 1, hard floor).
          // +1 avoids alerting exactly at baseline; hard floor prevents
          // "0 is normal so 1 is a 100% spike" alerts on quiet weeks.
          suggested: Math.max(Math.ceil((percentile(b, 95) || 0) + 1), floor),
        });

        const body = {
          ok: true,
          windowHours: LOOKBACK_HOURS,
          samples: rows.length,
          generatedAt: new Date().toISOString(),
          thresholds: {
            recoveryTriggered: build(buckets.recoveryTriggered, HARD_FLOOR.recoveryTriggered),
            recoveryFailed: build(buckets.recoveryFailed, HARD_FLOOR.recoveryFailed),
            cacheResetShown: build(buckets.cacheResetShown, HARD_FLOOR.cacheResetShown),
            criticalRoute: { p50: 0, p95: 0, p99: 0, max: 0, suggested: HARD_FLOOR.criticalRoute },
          },
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=300, s-maxage=300",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
