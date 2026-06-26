/**
 * Admin → SEO → "Web Vitals" tab.
 *
 * Renders Core Web Vitals aggregates from the `web_vitals` Firestore
 * collection (populated by /api/public/web-vitals beacons). Shows global
 * p75 per metric with pass/fail colors, then a per-route table so we can
 * see which pages regress LCP / INP / CLS.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

import {
  getWebVitalsSummary,
  type VitalsSummary,
  type VitalsBucket,
} from "@/lib/web-vitals-summary.functions";

type MetricName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";

const THRESHOLDS: Record<MetricName, [number, number]> = {
  LCP: [2500, 4000],
  CLS: [100, 250], // stored ×1000
  INP: [200, 500],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

function formatValue(name: MetricName, v: number): string {
  if (name === "CLS") return (v / 1000).toFixed(3);
  return `${v}ms`;
}

function ratingFor(name: MetricName, v: number): "good" | "needs-improvement" | "poor" {
  const [g, p] = THRESHOLDS[name];
  if (v <= g) return "good";
  if (v <= p) return "needs-improvement";
  return "poor";
}

function ratingClass(r: "good" | "needs-improvement" | "poor"): string {
  if (r === "good") return "text-emerald-400";
  if (r === "needs-improvement") return "text-amber-400";
  return "text-red-400";
}

export default function WebVitalsTab() {
  const fetchSummary = useServerFn(getWebVitalsSummary);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<VitalsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSummary({ data: { days: d } });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics: MetricName[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];

  const byMetric = useMemo(() => {
    const map = new Map<MetricName, VitalsBucket[]>();
    if (!data) return map;
    for (const row of data.byRoute) {
      const arr = map.get(row.metric) ?? [];
      arr.push(row);
      map.set(row.metric, arr);
    }
    return map;
  }, [data]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" />
            Web Vitals (Real-User)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            p75 by metric &amp; route from <code>web_vitals</code> beacons. Last{" "}
            {data?.windowDays ?? days} days · {data?.totalSamples ?? 0} samples.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => {
              const d = Number(e.target.value);
              setDays(d);
              void load(d);
            }}
            className="border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg px-3"
            aria-label="Time window"
          >
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            type="button"
            onClick={() => void load(days)}
            disabled={loading}
            className="border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg px-4 flex items-center gap-2 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      ) : null}

      {/* Global p75 cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map((m) => {
          const v = data?.globalP75?.[m];
          const poor = data?.globalPoorPct?.[m] ?? 0;
          const r = v != null ? ratingFor(m, v) : "good";
          return (
            <div
              key={m}
              className="bg-slate-900 border border-slate-700 rounded-lg p-4"
            >
              <div className="text-xs uppercase tracking-wide text-slate-400">{m} p75</div>
              <div className={`text-2xl font-bold mt-1 ${v != null ? ratingClass(r) : "text-slate-500"}`}>
                {v != null ? formatValue(m, v) : "—"}
              </div>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                {r === "good" ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                )}
                {poor}% poor
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-route breakdown grouped by metric */}
      {metrics.map((m) => {
        const rows = byMetric.get(m);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={m} className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            <header className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-white font-semibold">{m} by route</h2>
              <span className="text-xs text-slate-400">
                Target: ≤ {formatValue(m, THRESHOLDS[m][0])} good · ≤ {formatValue(m, THRESHOLDS[m][1])} ok
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="text-left px-4 py-2">Route</th>
                    <th className="text-right px-4 py-2">Samples</th>
                    <th className="text-right px-4 py-2">p50</th>
                    <th className="text-right px-4 py-2">p75</th>
                    <th className="text-right px-4 py-2">p95</th>
                    <th className="text-right px-4 py-2">% poor</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((row) => {
                    const r = ratingFor(m, row.p75);
                    return (
                      <tr key={`${m}-${row.pathBucket}`} className="border-t border-slate-800">
                        <td className="px-4 py-2 text-slate-200 font-mono">{row.pathBucket}</td>
                        <td className="px-4 py-2 text-right text-slate-400">{row.samples}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{formatValue(m, row.p50)}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${ratingClass(r)}`}>
                          {formatValue(m, row.p75)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400">{formatValue(m, row.p95)}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{row.poorPct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {data && data.totalSamples === 0 ? (
        <div className="text-slate-400 text-sm bg-slate-900 border border-slate-700 rounded-lg p-6 text-center">
          No samples yet for this window. Beacons are sampled at ~15% (plus all
          poor samples) — give real traffic a few minutes.
        </div>
      ) : null}
    </div>
  );
}
