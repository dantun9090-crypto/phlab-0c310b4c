/**
 * Daily trend buckets for Core Web Vitals — backs the line/bar charts in
 * the admin Web Vitals tab.
 *
 * Groups the last N days of `web_vitals` rows by (metric × UTC day) and
 * returns min / avg / max per day, so we can plot a trend line and confirm
 * a deploy actually improved LCP/INP/CLS instead of guessing from p75.
 *
 * Cheap helper — reads the same collection that powers
 * `getWebVitalsSummary`, but reshapes per-day instead of per-route.
 */
import { createServerFn } from "@tanstack/react-start";

import { listDocsAdmin } from "@/lib/server/firestore-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type MetricName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";

interface VitalRow {
  name: MetricName;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  createdAt: string;
}

export interface DailyVitalsPoint {
  /** YYYY-MM-DD (UTC) */
  day: string;
  samples: number;
  min: number;
  avg: number;
  max: number;
  poorPct: number;
}

export interface VitalsTrends {
  windowDays: number;
  totalSamples: number;
  generatedAt: string;
  byMetric: Partial<Record<MetricName, DailyVitalsPoint[]>>;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

export const getWebVitalsTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number } | undefined) => ({
    days: Math.min(Math.max(d?.days ?? 7, 1), 30),
  }))
  .handler(async ({ data }): Promise<VitalsTrends> => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
    const rows = (await listDocsAdmin("web_vitals", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: 10_000,
      rangeFilter: { field: "createdAt", gte: since.toISOString() },
    })) as unknown as VitalRow[];

    // (metric → day → array of values)
    const buckets = new Map<MetricName, Map<string, number[]>>();
    const poorCounts = new Map<MetricName, Map<string, number>>();

    for (const r of rows) {
      if (!r?.name || typeof r.value !== "number") continue;
      const day = dayKey(r.createdAt);
      let m = buckets.get(r.name);
      if (!m) {
        m = new Map();
        buckets.set(r.name, m);
      }
      let arr = m.get(day);
      if (!arr) {
        arr = [];
        m.set(day, arr);
      }
      arr.push(r.value);

      if (r.rating === "poor") {
        let pm = poorCounts.get(r.name);
        if (!pm) {
          pm = new Map();
          poorCounts.set(r.name, pm);
        }
        pm.set(day, (pm.get(day) ?? 0) + 1);
      }
    }

    const byMetric: VitalsTrends["byMetric"] = {};
    for (const [metric, dayMap] of buckets) {
      const points: DailyVitalsPoint[] = [];
      const days = [...dayMap.keys()].sort();
      for (const day of days) {
        const arr = dayMap.get(day)!;
        const sum = arr.reduce((a, b) => a + b, 0);
        const poor = poorCounts.get(metric)?.get(day) ?? 0;
        points.push({
          day,
          samples: arr.length,
          min: Math.round(Math.min(...arr)),
          avg: Math.round(sum / arr.length),
          max: Math.round(Math.max(...arr)),
          poorPct: Math.round((poor / arr.length) * 1000) / 10,
        });
      }
      byMetric[metric] = points;
    }

    return {
      windowDays: data.days,
      totalSamples: rows.length,
      generatedAt: new Date().toISOString(),
      byMetric,
    };
  });

// ─────────────────────────────────────────────────────────────────────────
// Recent alerts list (powers the "Recent alerts" panel in the admin tab).
// Reads from `web_vitals_alerts` written by /api/public/web-vitals when a
// "poor" sample crosses the configured hard threshold.
// ─────────────────────────────────────────────────────────────────────────
export interface VitalsAlert {
  id: string;
  name: MetricName;
  value: number;
  threshold: number;
  path: string;
  pathBucket: string;
  device: string;
  conn: string;
  build: string;
  createdAt: string;
}

export const getWebVitalsAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; days?: number } | undefined) => ({
    limit: Math.min(Math.max(d?.limit ?? 50, 1), 200),
    days: Math.min(Math.max(d?.days ?? 7, 1), 30),
  }))
  .handler(async ({ data }): Promise<VitalsAlert[]> => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
    const rows = (await listDocsAdmin("web_vitals_alerts", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: data.limit,
      rangeFilter: { field: "createdAt", gte: since.toISOString() },
    })) as unknown as Array<VitalsAlert & Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      value: Number(r.value) || 0,
      threshold: Number(r.threshold) || 0,
      path: String(r.path ?? ""),
      pathBucket: String(r.pathBucket ?? ""),
      device: String(r.device ?? ""),
      conn: String(r.conn ?? ""),
      build: String(r.build ?? ""),
      createdAt: String(r.createdAt ?? ""),
    }));
  });
