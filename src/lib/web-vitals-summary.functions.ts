/**
 * Server function for the admin "Web Vitals" tab.
 *
 * Loads the last N days of `web_vitals` rows from Firestore (via the
 * service-account REST helper), then computes p75 per (metric × route bucket)
 * — the percentile Google uses for Core Web Vitals pass/fail.
 *
 * Returned shape is intentionally tiny so the admin tab renders fast even
 * with thousands of samples.
 */
import { createServerFn } from "@tanstack/react-start";

import { listDocsAdmin } from "@/lib/server/firestore-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type MetricName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";

interface VitalRow {
  name: MetricName;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  path: string;
  pathBucket: string;
  device: "mobile" | "tablet" | "desktop";
  conn: string;
  build: string;
  createdAt: string;
}

export interface VitalsBucket {
  pathBucket: string;
  metric: MetricName;
  samples: number;
  p50: number;
  p75: number;
  p95: number;
  poorPct: number;
}

export interface VitalsSummary {
  windowDays: number;
  totalSamples: number;
  generatedAt: string;
  byRoute: VitalsBucket[];
  globalP75: Partial<Record<MetricName, number>>;
  globalPoorPct: Partial<Record<MetricName, number>>;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

export const getWebVitalsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number } | undefined) => ({
    days: Math.min(Math.max(d?.days ?? 7, 1), 30),
  }))
  .handler(async ({ data }): Promise<VitalsSummary> => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
    const rows = (await listDocsAdmin("web_vitals", {
      orderBy: "createdAt",
      direction: "DESCENDING",
      limit: 10_000,
      rangeFilter: { field: "createdAt", gte: since.toISOString() },
    })) as unknown as VitalRow[];

    // Group by (pathBucket, metric)
    const groups = new Map<string, number[]>();
    const groupPoor = new Map<string, number>();
    const globalByMetric = new Map<MetricName, number[]>();
    const globalPoorByMetric = new Map<MetricName, number>();

    for (const r of rows) {
      if (!r?.name || typeof r.value !== "number") continue;
      const bucket = r.pathBucket || "/";
      const key = `${bucket}|${r.name}`;
      let arr = groups.get(key);
      if (!arr) {
        arr = [];
        groups.set(key, arr);
      }
      arr.push(r.value);
      if (r.rating === "poor") groupPoor.set(key, (groupPoor.get(key) ?? 0) + 1);

      let g = globalByMetric.get(r.name);
      if (!g) {
        g = [];
        globalByMetric.set(r.name, g);
      }
      g.push(r.value);
      if (r.rating === "poor") {
        globalPoorByMetric.set(r.name, (globalPoorByMetric.get(r.name) ?? 0) + 1);
      }
    }

    const byRoute: VitalsBucket[] = [];
    for (const [key, arr] of groups) {
      const [pathBucket, metric] = key.split("|") as [string, MetricName];
      const sorted = arr.slice().sort((a, b) => a - b);
      byRoute.push({
        pathBucket,
        metric,
        samples: arr.length,
        p50: Math.round(percentile(sorted, 0.5)),
        p75: Math.round(percentile(sorted, 0.75)),
        p95: Math.round(percentile(sorted, 0.95)),
        poorPct: Math.round(((groupPoor.get(key) ?? 0) / arr.length) * 1000) / 10,
      });
    }
    byRoute.sort((a, b) => b.samples - a.samples);

    const globalP75: Partial<Record<MetricName, number>> = {};
    const globalPoorPct: Partial<Record<MetricName, number>> = {};
    for (const [name, arr] of globalByMetric) {
      const sorted = arr.slice().sort((a, b) => a - b);
      globalP75[name] = Math.round(percentile(sorted, 0.75));
      globalPoorPct[name] =
        Math.round(((globalPoorByMetric.get(name) ?? 0) / arr.length) * 1000) / 10;
    }

    return {
      windowDays: data.days,
      totalSamples: rows.length,
      generatedAt: new Date().toISOString(),
      byRoute,
      globalP75,
      globalPoorPct,
    };
  });
