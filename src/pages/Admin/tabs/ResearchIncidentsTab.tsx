/**
 * Admin → Research Incidents tab.
 *
 * Lists overlay/regression events recorded by the in-page guards on
 * /research and /compound, plus a summary card and a sticky alert
 * whenever an overlay event has fired in the last 24h.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { AlertTriangle, RefreshCw, ShieldCheck, Eye } from "lucide-react";
import {
  listResearchIncidents,
  type IncidentRow,
  type IncidentsSummary,
} from "@/lib/research-incidents.functions";

async function getToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.getIdToken();
}

function relTime(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return iso;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function StatCard({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const colour =
    tone === "good"
      ? "border-emerald-700 bg-emerald-950/40 text-emerald-100"
      : tone === "warn"
      ? "border-amber-700 bg-amber-950/40 text-amber-100"
      : tone === "bad"
      ? "border-red-700 bg-red-950/40 text-red-100"
      : "border-slate-600 bg-slate-800 text-white";
  return (
    <div className={`border-2 rounded-lg p-4 ${colour}`}>
      <div className="text-xs uppercase tracking-wider opacity-80 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function ResearchIncidentsTab() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [summary, setSummary] = useState<IncidentsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "research_overlay" | "compound_overlay" | "page_not_found">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getToken();
      const res = await listResearchIncidents({ data: { idToken, limit: 250 } });
      setIncidents(res.incidents);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const filtered = useMemo(
    () => (filter === "all" ? incidents : incidents.filter((i) => i.type === filter)),
    [incidents, filter],
  );

  const recentOverlay =
    summary && (summary.researchOverlay > 0 || summary.compoundOverlay > 0) && (summary.totalLast24h > 0);

  return (
    <div className="space-y-6" role="region" aria-label="Research incidents">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Research / Compound Incidents</h2>
          <p className="text-sm text-slate-400">
            In-page guards on <code>/research</code> and <code>/compound</code> POST overlay
            detections to <code>/api/public/error-monitor</code>. This panel surfaces them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {recentOverlay ? (
        <div
          role="alert"
          className="border-2 border-red-600 bg-red-950/40 rounded-lg p-4 flex items-start gap-3 text-red-100"
        >
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Overlay regression detected in the last 24h</div>
            <div className="text-sm opacity-90">
              {summary?.researchOverlay ?? 0} /research · {summary?.compoundOverlay ?? 0} /compound.
              Verify the live routes and re-run the visual baseline workflow.
            </div>
          </div>
        </div>
      ) : (
        <div
          role="status"
          className="border-2 border-emerald-700 bg-emerald-950/40 rounded-lg p-4 flex items-center gap-3 text-emerald-100"
        >
          <ShieldCheck className="w-5 h-5" />
          <div className="text-sm">No overlay incidents in the last 24h.</div>
        </div>
      )}

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Last 24h" value={summary.totalLast24h} tone={summary.totalLast24h > 0 ? "warn" : "good"} />
          <StatCard label="Last 7 days" value={summary.totalLast7d} />
          <StatCard label="/research overlay" value={summary.researchOverlay} tone={summary.researchOverlay > 0 ? "bad" : "neutral"} />
          <StatCard label="/compound overlay" value={summary.compoundOverlay} tone={summary.compoundOverlay > 0 ? "bad" : "neutral"} />
          <StatCard label="/research 404s" value={summary.pageNotFoundResearch} />
          <StatCard label="Unique UAs" value={summary.uniqueUserAgents} />
          <StatCard label="Last incident" value={summary.lastIncidentAt ? relTime(summary.lastIncidentAt) : "—"} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "research_overlay", "compound_overlay", "page_not_found"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${
              filter === f
                ? "border-emerald-500 bg-emerald-950/40 text-emerald-100"
                : "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            aria-pressed={filter === f}
          >
            {f}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-2">{filtered.length} shown</span>
      </div>

      {error ? (
        <div role="alert" className="border-2 border-red-700 bg-red-950/40 rounded-lg p-3 text-red-100 text-sm">
          {error}
        </div>
      ) : null}

      <div className="border-2 border-slate-700 rounded-lg bg-slate-900 overflow-hidden">
        <table className="w-full text-sm text-slate-200">
          <thead className="bg-slate-800 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th scope="col" className="text-left p-3">When</th>
              <th scope="col" className="text-left p-3">Type</th>
              <th scope="col" className="text-left p-3">Path</th>
              <th scope="col" className="text-left p-3">Message</th>
              <th scope="col" className="text-left p-3">UA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-400">
                  No incidents.
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className="border-t border-slate-800 align-top">
                  <td className="p-3 font-mono text-xs whitespace-nowrap" title={i.createdAt}>{relTime(i.createdAt)}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                        i.type === "research_overlay" || i.type === "compound_overlay"
                          ? "bg-red-900/60 text-red-100"
                          : "bg-slate-800 text-slate-200"
                      }`}
                    >
                      <Eye className="w-3 h-3" /> {i.type}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs break-all">{i.path}</td>
                  <td className="p-3 text-xs">
                    {i.message || "—"}
                    {i.details ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-slate-400 hover:text-white">details</summary>
                        <pre className="mt-1 text-[11px] whitespace-pre-wrap break-all">
                          {JSON.stringify(i.details, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </td>
                  <td className="p-3 text-[11px] text-slate-400 max-w-xs truncate" title={i.userAgent}>{i.userAgent || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
