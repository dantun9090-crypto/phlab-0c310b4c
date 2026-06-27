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
import { Activity, AlertTriangle, BellRing, CheckCircle2, RefreshCw } from "lucide-react";

import {
  getWebVitalsSummary,
  type VitalsSummary,
  type VitalsBucket,
} from "@/lib/web-vitals-summary.functions";
import {
  getWebVitalsTrends,
  getWebVitalsAlerts,
  type VitalsTrends,
  type VitalsAlert,
  type DailyVitalsPoint,
} from "@/lib/web-vitals-trends.functions";

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
  const fetchTrends = useServerFn(getWebVitalsTrends);
  const fetchAlerts = useServerFn(getWebVitalsAlerts);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<VitalsSummary | null>(null);
  const [trends, setTrends] = useState<VitalsTrends | null>(null);
  const [alerts, setAlerts] = useState<VitalsAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const [summary, trend, alertRows] = await Promise.all([
        fetchSummary({ data: { days: d } }),
        fetchTrends({ data: { days: d } }),
        fetchAlerts({ data: { days: Math.max(d, 7), limit: 50 } }),
      ]);
      setData(summary);
      setTrends(trend);
      setAlerts(alertRows);
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

      {/* ──────────────────── Trend charts (min/avg/max per day) ──── */}
      <section className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">
            Daily trend — last {trends?.windowDays ?? days} days
          </h2>
          <span className="text-xs text-slate-400">avg line, min/max band</span>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {(["LCP", "INP", "CLS"] as const).map((m) => (
            <TrendChart
              key={m}
              metric={m}
              points={trends?.byMetric?.[m] ?? []}
              format={(v: number) => formatValue(m, v)}
              thresholds={THRESHOLDS[m]}
            />
          ))}
        </div>
      </section>

      {/* ──────────────────── Recent alerts panel ───────────────── */}
      <section className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <BellRing className="w-4 h-4 text-red-400" />
            Recent threshold breaches
          </h2>
          <span className="text-xs text-slate-400">
            {alerts.length} in last {Math.max(days, 7)} day(s)
          </span>
        </header>
        {alerts.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            No alerts — every "poor" sample stayed under the hard threshold.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Metric</th>
                  <th className="text-right px-4 py-2">Value</th>
                  <th className="text-right px-4 py-2">Threshold</th>
                  <th className="text-left px-4 py-2">Path</th>
                  <th className="text-left px-4 py-2">Device</th>
                  <th className="text-left px-4 py-2">Conn</th>
                  <th className="text-left px-4 py-2">Build</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const when = a.createdAt
                    ? new Date(a.createdAt).toLocaleString()
                    : "—";
                  const safePath = a.path?.startsWith("/") ? a.path : `/${a.path || ""}`;
                  return (
                    <tr key={a.id} className="border-t border-slate-800">
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{when}</td>
                      <td className="px-4 py-2 text-white font-semibold">{a.name}</td>
                      <td className="px-4 py-2 text-right text-red-300 font-mono">
                        {formatValue(a.name as MetricName, a.value)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400 font-mono">
                        {formatValue(a.name as MetricName, a.threshold)}
                      </td>
                      <td className="px-4 py-2 text-slate-200 font-mono">
                        <a
                          href={safePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          {safePath}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-slate-300">{a.device || "—"}</td>
                      <td className="px-4 py-2 text-slate-300">{a.conn || "—"}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono text-xs">
                        {a.build ? a.build.slice(0, 12) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data && data.totalSamples === 0 ? (
        <div className="text-slate-400 text-sm bg-slate-900 border border-slate-700 rounded-lg p-6 text-center">
          No samples yet for this window. Beacons are sampled at ~15% (plus all
          poor samples) — give real traffic a few minutes.
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Inline SVG sparkline + min/max band. No chart lib dep — keeps the admin
// bundle lean and avoids hydration mismatches.
// ─────────────────────────────────────────────────────────────────────────
interface TrendChartProps {
  metric: MetricName;
  points: DailyVitalsPoint[];
  format: (v: number) => string;
  thresholds: [number, number];
}

function TrendChart({ metric, points, format, thresholds }: TrendChartProps) {
  if (!points || points.length === 0) {
    return (
      <div className="rounded-lg bg-slate-950 border border-slate-800 p-4 text-center text-xs text-slate-500 h-44 flex flex-col justify-center">
        <div className="text-slate-300 font-semibold mb-1">{metric}</div>
        No data
      </div>
    );
  }

  const W = 280;
  const H = 120;
  const pad = 8;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  const values = points.flatMap((p) => [p.min, p.avg, p.max]);
  const maxV = Math.max(...values, thresholds[1]);
  const minV = 0;
  const xOf = (i: number) =>
    pad + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const yOf = (v: number) => pad + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

  const avgPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(p.avg)}`).join(" ");
  const bandPath =
    points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(p.max)}`).join(" ") +
    " " +
    points
      .slice()
      .reverse()
      .map((p, i) => `L${xOf(points.length - 1 - i)},${yOf(p.min)}`)
      .join(" ") +
    " Z";

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.avg - first.avg;
  const deltaPct = first.avg > 0 ? Math.round((delta / first.avg) * 100) : 0;

  return (
    <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="text-slate-300 font-semibold">{metric}</div>
        <div className={delta <= 0 ? "text-emerald-400" : "text-red-400"}>
          {delta <= 0 ? "▼" : "▲"} {Math.abs(deltaPct)}%
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-28"
        role="img"
        aria-label={`${metric} daily trend chart`}
      >
        {/* threshold guide line (good→ok boundary) */}
        <line
          x1={pad}
          x2={W - pad}
          y1={yOf(thresholds[0])}
          y2={yOf(thresholds[0])}
          stroke="#10b981"
          strokeDasharray="3 3"
          strokeOpacity={0.4}
        />
        <line
          x1={pad}
          x2={W - pad}
          y1={yOf(thresholds[1])}
          y2={yOf(thresholds[1])}
          stroke="#ef4444"
          strokeDasharray="3 3"
          strokeOpacity={0.4}
        />
        <path d={bandPath} fill="#3b82f6" fillOpacity={0.18} />
        <path d={avgPath} stroke="#60a5fa" strokeWidth={1.8} fill="none" />
        {points.map((p, i) => (
          <circle key={p.day} cx={xOf(i)} cy={yOf(p.avg)} r={2.2} fill="#93c5fd">
            <title>{`${p.day} — avg ${format(p.avg)} · min ${format(p.min)} · max ${format(p.max)} · n=${p.samples}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
        <span>{first.day}</span>
        <span>now {format(last.avg)}</span>
        <span>{last.day}</span>
      </div>
    </div>
  );
}
