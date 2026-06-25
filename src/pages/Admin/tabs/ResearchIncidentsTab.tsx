/**
 * Admin → Research Incidents tab.
 *
 * Lists overlay/regression events recorded by the in-page guards on
 * /research and /compound. Features:
 *  - summary cards + 24h alert banner with snooze/throttling
 *  - free-text search + type/timeframe/route/marker filters
 *  - row selection + JSON/CSV export (including full details payload)
 *  - resolve / dismiss / re-open with optional note + audit trail
 *  - drawer with full details JSON
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  AlertTriangle, RefreshCw, ShieldCheck, Eye, X, BellOff,
  CheckCircle2, Ban, RotateCcw, Download, Search, Filter,
} from "lucide-react";
import {
  listResearchIncidents,
  resolveResearchIncident,
  type IncidentRow,
  type IncidentsSummary,
  type IncidentStatus,
} from "@/lib/research-incidents.functions";

const ALERT_THROTTLE_KEY = "phlabs.researchIncidents.alertSnoozeUntil";
const ALERT_SIGNATURE_KEY = "phlabs.researchIncidents.alertSignature";
const ALERT_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

type TimeframeKey = "1h" | "24h" | "7d" | "30d" | "all";
const TIMEFRAMES: { key: TimeframeKey; label: string; ms: number | null }[] = [
  { key: "1h", label: "Last 1h", ms: 60 * 60 * 1000 },
  { key: "24h", label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All time", ms: null },
];

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

function prettyJson(s?: string): string {
  if (!s) return "—";
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

function extractMarker(detailsJson?: string): string | null {
  if (!detailsJson) return null;
  try {
    const d = JSON.parse(detailsJson) as Record<string, unknown>;
    const candidates = ["marker", "detectedMarker", "source"] as const;
    for (const k of candidates) {
      const v = d[k];
      if (typeof v === "string" && v) return v;
    }
    // Try to derive a marker from common boolean flags
    const flagToMarker: Record<string, string> = {
      hasLegacyResearch: "legacy-research-page",
      hasAdsLanding: "research-ads-landing",
      hasResearchArticles: "stuffed-articles",
    };
    for (const [flag, marker] of Object.entries(flagToMarker)) {
      if (d[flag] === true) return marker;
    }
  } catch { /* ignore */ }
  return null;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function StatusPill({ status }: { status: IncidentStatus }) {
  if (status === "resolved") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-900/60 text-emerald-100"><CheckCircle2 className="w-3 h-3" /> Resolved</span>;
  }
  if (status === "dismissed") {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-700 text-slate-200"><Ban className="w-3 h-3" /> Dismissed</span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-900/60 text-amber-100">Open</span>;
}

function ResolveModal({
  incident, action, onClose, onSubmit, working,
}: {
  incident: IncidentRow;
  action: Exclude<IncidentStatus, "open"> | "open";
  onClose: () => void;
  onSubmit: (note: string) => void;
  working: boolean;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const verb = action === "resolved" ? "Resolve" : action === "dismissed" ? "Dismiss" : "Re-open";
  return (
    <div role="dialog" aria-modal="true" aria-label={`${verb} incident`} className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-lg p-5 text-slate-200">
        <h3 className="text-lg font-bold text-white mb-1">{verb} incident</h3>
        <p className="text-xs text-slate-400 mb-4 font-mono break-all">{incident.id}</p>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder={action === "resolved" ? "What was the root cause / fix?" : action === "dismissed" ? "Why is this not a real regression?" : "Why are you re-opening?"}
          className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 min-h-[48px]"
          maxLength={2000}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-sm">Cancel</button>
          <button
            type="button"
            disabled={working}
            onClick={() => onSubmit(note)}
            className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
              action === "resolved" ? "bg-emerald-700 hover:bg-emerald-600" :
              action === "dismissed" ? "bg-slate-700 hover:bg-slate-600" :
              "bg-amber-700 hover:bg-amber-600"
            }`}
          >
            {working ? "Working…" : verb}
          </button>
        </div>
      </div>
    </div>
  );
}

function IncidentDrawer({ incident, onClose }: { incident: IncidentRow | null; onClose: () => void }) {
  useEffect(() => {
    if (!incident) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [incident, onClose]);

  if (!incident) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Incident details" className="fixed inset-0 z-50 flex">
      <button type="button" aria-label="Close drawer" onClick={onClose} className="flex-1 bg-black/60" />
      <div className="w-full max-w-xl bg-slate-950 border-l-2 border-slate-700 overflow-y-auto p-5 text-slate-200">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Incident details</h3>
            <p className="text-xs text-slate-400 font-mono break-all">{incident.id}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-3"><StatusPill status={incident.status} /></div>

        <dl className="grid grid-cols-3 gap-2 text-xs mb-4">
          <dt className="text-slate-400">Type</dt><dd className="col-span-2 font-mono">{incident.type || "—"}</dd>
          <dt className="text-slate-400">Path</dt><dd className="col-span-2 font-mono break-all">{incident.path || "—"}</dd>
          <dt className="text-slate-400">When</dt><dd className="col-span-2 font-mono">{incident.createdAt || "—"} <span className="text-slate-500">({relTime(incident.createdAt)})</span></dd>
          <dt className="text-slate-400">Referrer</dt><dd className="col-span-2 font-mono break-all">{incident.referrer || "—"}</dd>
          <dt className="text-slate-400">User-Agent</dt><dd className="col-span-2 font-mono break-all">{incident.userAgent || "—"}</dd>
          <dt className="text-slate-400">IP</dt><dd className="col-span-2 font-mono break-all">{incident.ip || "—"}</dd>
          <dt className="text-slate-400">Message</dt><dd className="col-span-2">{incident.message || "—"}</dd>
          {incident.resolvedBy ? (<><dt className="text-slate-400">Resolved by</dt><dd className="col-span-2 font-mono break-all">{incident.resolvedBy}</dd></>) : null}
          {incident.resolvedAt ? (<><dt className="text-slate-400">Resolved at</dt><dd className="col-span-2 font-mono">{incident.resolvedAt}</dd></>) : null}
          {incident.note ? (<><dt className="text-slate-400">Note</dt><dd className="col-span-2 whitespace-pre-wrap">{incident.note}</dd></>) : null}
        </dl>

        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Details payload</h4>
          {incident.detailsJson ? (
            <button type="button"
              onClick={() => navigator.clipboard?.writeText(prettyJson(incident.detailsJson)).catch(() => undefined)}
              className="text-xs px-2 py-1 rounded border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-white">
              Copy JSON
            </button>
          ) : null}
        </div>
        <pre className="text-[11px] whitespace-pre-wrap break-all bg-slate-900 border-2 border-slate-700 rounded-lg p-3 max-h-[60vh] overflow-auto">
          {prettyJson(incident.detailsJson)}
        </pre>
      </div>
    </div>
  );
}

export default function ResearchIncidentsTab() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [summary, setSummary] = useState<IncidentsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | "research_overlay" | "compound_overlay" | "page_not_found">("all");
  const [timeframe, setTimeframe] = useState<TimeframeKey>("7d");
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [markerFilter, setMarkerFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  // Selection + drawer + modal
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<IncidentRow | null>(null);
  const [resolveTarget, setResolveTarget] = useState<{ row: IncidentRow; action: IncidentStatus } | null>(null);
  const [resolving, setResolving] = useState(false);

  const [snoozeUntil, setSnoozeUntil] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(ALERT_THROTTLE_KEY) || 0);
  });

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

  // Derive dynamic filter options
  const routes = useMemo(() => {
    const s = new Set<string>();
    incidents.forEach((i) => i.path && s.add(i.path));
    return Array.from(s).sort();
  }, [incidents]);

  const markers = useMemo(() => {
    const s = new Set<string>();
    incidents.forEach((i) => { const m = extractMarker(i.detailsJson); if (m) s.add(m); });
    return Array.from(s).sort();
  }, [incidents]);

  const filtered = useMemo(() => {
    const tf = TIMEFRAMES.find((t) => t.key === timeframe);
    const cutoff = tf?.ms ? Date.now() - tf.ms : 0;
    const q = query.trim().toLowerCase();
    return incidents.filter((i) => {
      if (!showClosed && i.status !== "open") return false;
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (routeFilter !== "all" && i.path !== routeFilter) return false;
      if (markerFilter !== "all" && extractMarker(i.detailsJson) !== markerFilter) return false;
      if (cutoff) {
        const ts = i.createdAt ? Date.parse(i.createdAt) : 0;
        if (!ts || ts < cutoff) return false;
      }
      if (q) {
        const hay = `${i.path}\n${i.message ?? ""}\n${i.userAgent ?? ""}\n${i.referrer ?? ""}\n${i.detailsJson ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, typeFilter, routeFilter, markerFilter, timeframe, query, showClosed]);

  // Throttling — uses summary.openLast24h so closed incidents stop the alarm
  const alertSignature = useMemo(() => {
    if (!summary) return "";
    return `${summary.researchOverlay}|${summary.compoundOverlay}|${summary.lastIncidentAt ?? ""}`;
  }, [summary]);

  const overlayActive = !!summary && summary.openLast24h > 0 && (summary.researchOverlay > 0 || summary.compoundOverlay > 0);
  const now = Date.now();
  const lastSignature = typeof window !== "undefined" ? window.localStorage.getItem(ALERT_SIGNATURE_KEY) ?? "" : "";
  const newSignatureSinceSnooze = alertSignature && alertSignature !== lastSignature;
  const snoozeActive = snoozeUntil > now && !newSignatureSinceSnooze;
  const showAlert = overlayActive && !snoozeActive;

  const dismissAlert = useCallback(() => {
    const until = Date.now() + ALERT_THROTTLE_MS;
    setSnoozeUntil(until);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ALERT_THROTTLE_KEY, String(until));
      window.localStorage.setItem(ALERT_SIGNATURE_KEY, alertSignature);
    }
  }, [alertSignature]);

  // Selection helpers
  const allOnPageSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) filtered.forEach((i) => next.delete(i.id));
      else filtered.forEach((i) => next.add(i.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Export
  const selectedRows = useMemo(() => incidents.filter((i) => selectedIds.has(i.id)), [incidents, selectedIds]);

  const exportJson = () => {
    const rows = (selectedRows.length ? selectedRows : filtered).map((i) => ({
      ...i,
      details: i.detailsJson ? (() => { try { return JSON.parse(i.detailsJson!); } catch { return i.detailsJson; } })() : null,
    }));
    downloadBlob(`incidents-${new Date().toISOString().slice(0, 19)}.json`, JSON.stringify(rows, null, 2), "application/json");
  };

  const exportCsv = () => {
    const rows = selectedRows.length ? selectedRows : filtered;
    const headers = ["id","createdAt","type","path","status","resolvedBy","resolvedAt","note","message","referrer","userAgent","ip","detailsJson"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.id, r.createdAt, r.type, r.path, r.status,
        r.resolvedBy ?? "", r.resolvedAt ?? "", r.note ?? "",
        r.message ?? "", r.referrer ?? "", r.userAgent ?? "", r.ip ?? "",
        r.detailsJson ?? "",
      ].map(csvEscape).join(","));
    }
    downloadBlob(`incidents-${new Date().toISOString().slice(0, 19)}.csv`, lines.join("\n"), "text/csv");
  };

  // Resolve action
  const submitResolve = async (note: string) => {
    if (!resolveTarget) return;
    setResolving(true);
    try {
      const idToken = await getToken();
      await resolveResearchIncident({ data: {
        idToken, id: resolveTarget.row.id, action: resolveTarget.action, note,
      } });
      setResolveTarget(null);
      clearSelection();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResolving(false);
    }
  };

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

      {showAlert ? (
        <div role="alert" className="border-2 border-red-600 bg-red-950/40 rounded-lg p-4 flex items-start gap-3 text-red-100">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Overlay regression detected (open) in the last 24h</div>
            <div className="text-sm opacity-90">
              {summary?.researchOverlay ?? 0} open /research · {summary?.compoundOverlay ?? 0} open /compound.
              Verify the live routes, then resolve each incident below.
            </div>
          </div>
          <button type="button" onClick={dismissAlert}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border-2 border-red-700 bg-red-900/60 hover:bg-red-900 text-red-100 text-xs"
            aria-label="Snooze alert for 15 minutes"
            title="Snooze for 15 min (re-arms automatically when new incidents arrive)">
            <BellOff className="w-3 h-3" /> Snooze 15m
          </button>
        </div>
      ) : overlayActive && snoozeActive ? (
        <div role="status" className="border-2 border-amber-700 bg-amber-950/40 rounded-lg p-3 flex items-center gap-3 text-amber-100 text-xs">
          <BellOff className="w-4 h-4" />
          <div className="flex-1">Alert snoozed until {new Date(snoozeUntil).toLocaleTimeString()} — will re-arm on new incident.</div>
          <button type="button"
            onClick={() => { setSnoozeUntil(0); if (typeof window !== "undefined") window.localStorage.removeItem(ALERT_THROTTLE_KEY); }}
            className="px-2 py-1 rounded border-2 border-amber-700 bg-amber-900/40 hover:bg-amber-900 text-amber-100">
            Un-snooze
          </button>
        </div>
      ) : (
        <div role="status" className="border-2 border-emerald-700 bg-emerald-950/40 rounded-lg p-4 flex items-center gap-3 text-emerald-100">
          <ShieldCheck className="w-5 h-5" />
          <div className="text-sm">No open overlay incidents in the last 24h.</div>
        </div>
      )}

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Last 24h" value={summary.totalLast24h} tone={summary.openLast24h > 0 ? "warn" : "good"} />
          <StatCard label="Open (24h)" value={summary.openLast24h} tone={summary.openLast24h > 0 ? "bad" : "good"} />
          <StatCard label="Last 7 days" value={summary.totalLast7d} />
          <StatCard label="/research overlay (open)" value={summary.researchOverlay} tone={summary.researchOverlay > 0 ? "bad" : "neutral"} />
          <StatCard label="/compound overlay (open)" value={summary.compoundOverlay} tone={summary.compoundOverlay > 0 ? "bad" : "neutral"} />
          <StatCard label="/research 404s" value={summary.pageNotFoundResearch} />
          <StatCard label="Unique UAs" value={summary.uniqueUserAgents} />
          <StatCard label="Last incident" value={summary.lastIncidentAt ? relTime(summary.lastIncidentAt) : "—"} />
        </div>
      ) : null}

      {/* Filter bar */}
      <div className="border-2 border-slate-700 bg-slate-900 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search path, message, UA, referrer, details…"
              className="w-full pl-10 pr-4 py-3 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 min-h-[48px]"
              aria-label="Search incidents"
            />
          </div>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as TimeframeKey)}
            className="px-3 py-3 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm min-h-[48px]"
            aria-label="Timeframe">
            {TIMEFRAMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}
            className="px-3 py-3 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm min-h-[48px]"
            aria-label="Route">
            <option value="all">All routes</option>
            {routes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={markerFilter} onChange={(e) => setMarkerFilter(e.target.value)}
            disabled={markers.length === 0}
            className="px-3 py-3 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-sm min-h-[48px] disabled:opacity-50"
            aria-label="Detected marker">
            <option value="all">Any marker</option>
            {markers.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          {(["all", "research_overlay", "compound_overlay", "page_not_found"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${
                typeFilter === f
                  ? "border-emerald-500 bg-emerald-950/40 text-emerald-100"
                  : "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
              aria-pressed={typeFilter === f}>
              {f}
            </button>
          ))}
          <label className="ml-2 inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)}
              className="h-4 w-4 accent-emerald-500" />
            Show resolved / dismissed
          </label>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} shown · {selectedIds.size} selected</span>
        </div>
      </div>

      {/* Export toolbar */}
      {selectedIds.size > 0 || filtered.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">
            {selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : `Export ${filtered.length} filtered`}:
          </span>
          <button type="button" onClick={exportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-xs">
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
          <button type="button" onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-xs">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          {selectedIds.size > 0 ? (
            <button type="button" onClick={clearSelection}
              className="px-3 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-xs">
              Clear selection
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="border-2 border-red-700 bg-red-950/40 rounded-lg p-3 text-red-100 text-sm">{error}</div>
      ) : null}

      <div className="border-2 border-slate-700 rounded-lg bg-slate-900 overflow-hidden">
        <table className="w-full text-sm text-slate-200">
          <thead className="bg-slate-800 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th scope="col" className="p-3 w-8">
                <input type="checkbox" aria-label="Select all on page"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-emerald-500" />
              </th>
              <th scope="col" className="text-left p-3">When</th>
              <th scope="col" className="text-left p-3">Type</th>
              <th scope="col" className="text-left p-3">Status</th>
              <th scope="col" className="text-left p-3">Path</th>
              <th scope="col" className="text-left p-3">Message</th>
              <th scope="col" className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">No incidents match your filters.</td></tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className={`border-t border-slate-800 align-top ${selectedIds.has(i.id) ? "bg-emerald-950/20" : ""}`}>
                  <td className="p-3">
                    <input type="checkbox" aria-label={`Select incident ${i.id}`}
                      checked={selectedIds.has(i.id)}
                      onChange={() => toggleOne(i.id)}
                      className="h-4 w-4 accent-emerald-500" />
                  </td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap" title={i.createdAt}>{relTime(i.createdAt)}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                      i.type === "research_overlay" || i.type === "compound_overlay"
                        ? "bg-red-900/60 text-red-100"
                        : "bg-slate-800 text-slate-200"
                    }`}>
                      <Eye className="w-3 h-3" /> {i.type}
                    </span>
                  </td>
                  <td className="p-3"><StatusPill status={i.status} /></td>
                  <td className="p-3 font-mono text-xs break-all">{i.path}</td>
                  <td className="p-3 text-xs">
                    <div>{i.message || "—"}</div>
                    {i.note ? <div className="mt-1 text-[11px] text-slate-400 italic">Note: {i.note}</div> : null}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <button type="button" onClick={() => setDrawer(i)}
                        className="px-2 py-1 rounded border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-xs"
                        aria-label="Open incident details drawer">
                        View
                      </button>
                      {i.status === "open" ? (
                        <>
                          <button type="button" onClick={() => setResolveTarget({ row: i, action: "resolved" })}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border-2 border-emerald-700 bg-emerald-900/40 hover:bg-emerald-900 text-emerald-100 text-xs"
                            aria-label="Resolve incident">
                            <CheckCircle2 className="w-3 h-3" /> Resolve
                          </button>
                          <button type="button" onClick={() => setResolveTarget({ row: i, action: "dismissed" })}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border-2 border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                            aria-label="Dismiss incident">
                            <Ban className="w-3 h-3" /> Dismiss
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setResolveTarget({ row: i, action: "open" })}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border-2 border-amber-700 bg-amber-900/40 hover:bg-amber-900 text-amber-100 text-xs"
                          aria-label="Re-open incident">
                          <RotateCcw className="w-3 h-3" /> Re-open
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <IncidentDrawer incident={drawer} onClose={() => setDrawer(null)} />
      {resolveTarget ? (
        <ResolveModal
          incident={resolveTarget.row}
          action={resolveTarget.action}
          working={resolving}
          onClose={() => setResolveTarget(null)}
          onSubmit={submitResolve}
        />
      ) : null}
    </div>
  );
}
