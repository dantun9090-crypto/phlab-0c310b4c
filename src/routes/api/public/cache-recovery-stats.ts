/**
 * Cache recovery telemetry stats (public read).
 *
 * Aggregates the last 24h of `sw_telemetry` events into a compact JSON
 * summary used by:
 *   - the scheduled Slack/Telegram alert workflow
 *     (.github/workflows/cache-recovery-monitor.yml)
 *   - the Admin → SW Telemetry Debug tab quick-glance card
 *
 * We deliberately expose this without auth: it contains ONLY counters
 * (no user IDs, no URLs, no PII) so anyone monitoring the site can
 * scrape it. If we ever include per-user data here, gate it behind
 * requireSupabaseAuth + has_role('admin').
 *
 * Query params:
 *   ?hours=1..168  window in hours (default 24)
 */
import { createFileRoute } from "@tanstack/react-router";
import { listDocsAdmin } from "@/lib/server/firestore-admin";

interface TelemetryRow {
  event: string;
  buildId?: string;
  browserName?: string;
  browserVersion?: string;
  os?: string;
  mobile?: boolean;
  clientTs?: number;
  extra?: string | null;
}

const CRITICAL_ROUTES = ["/cart", "/checkout", "/payment", "/register", "/vip"];

function tallyPath(row: TelemetryRow): string | null {
  try {
    if (!row.extra) return null;
    const parsed = JSON.parse(row.extra) as { path?: string };
    const p = (parsed.path || "").toLowerCase();
    for (const r of CRITICAL_ROUTES) if (p.startsWith(r)) return r;
    return null;
  } catch { return null; }
}

export const Route = createFileRoute("/api/public/cache-recovery-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const hours = Math.min(Math.max(Number(url.searchParams.get("hours") || "24"), 1), 168);
        const since = new Date(Date.now() - hours * 3600_000);

        let rows: TelemetryRow[] = [];
        try {
          rows = (await listDocsAdmin("sw_telemetry", {
            orderBy: "clientTs",
            direction: "DESCENDING",
            limit: 5000,
            rangeFilter: { field: "clientTs", gte: since.getTime() },
          })) as unknown as TelemetryRow[];
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error)?.message?.slice(0, 200) || "listDocsAdmin failed" }),
            { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } },
          );
        }

        const eventCounts: Record<string, number> = {};
        const browserCounts: Record<string, number> = {};
        const buildCounts: Record<string, number> = {};
        const routeCounts: Record<string, number> = {};
        let recoveryTriggered = 0;
        let recoveryFailed = 0;
        let cacheResetShown = 0;

        for (const r of rows) {
          eventCounts[r.event] = (eventCounts[r.event] || 0) + 1;
          if (r.event === "sw_cache_recovery_triggered") recoveryTriggered++;
          if (r.event === "sw_cache_recovery_failed") recoveryFailed++;
          if (r.event === "sw_cache_reset_shown" || r.event === "sw_stale_reload_shown")
            cacheResetShown++;
          if (r.browserName) {
            const key = `${r.browserName} ${r.browserVersion || "?"}${r.mobile ? " (mobile)" : ""}`;
            browserCounts[key] = (browserCounts[key] || 0) + 1;
          }
          if (r.buildId) buildCounts[r.buildId] = (buildCounts[r.buildId] || 0) + 1;
          const rt = tallyPath(r);
          if (rt) routeCounts[rt] = (routeCounts[rt] || 0) + 1;
        }

        const body = {
          ok: true,
          windowHours: hours,
          generatedAt: new Date().toISOString(),
          totals: {
            events: rows.length,
            recoveryTriggered,
            recoveryFailed,
            cacheResetShown,
          },
          eventCounts,
          browserCounts,
          topBuilds: Object.entries(buildCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([buildId, count]) => ({ buildId, count })),
          criticalRouteRecoveries: routeCounts,
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=60, s-maxage=60",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
