/**
 * Admin → Purge Incidents
 *
 * Correlates Cloudflare cache purges (`cache_purge_history`, written by
 * src/lib/cache-admin.functions.ts) with client-side telemetry events
 * (`sw_telemetry`, written by src/lib/swTelemetry.ts) that occurred in the
 * 10 minutes following each purge. Surfaces silent post-purge regressions
 * (hydration fallback shown, "Update available" overlay, cache resets).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  db,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  Timestamp,
} from '@/lib/firebase';
import { RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface PurgeRow {
  id: string;
  at: string; // ISO
  atMs: number;
  scope: string;
  ok: boolean;
  status: number;
  triggeredBy: string;
  fileCount: number;
  error?: string;
  smokeOk?: boolean | null;
  smokeFailures?: string[];
}

interface TelemetryRow {
  id: string;
  event: string;
  clientTs: number;
  buildId: string;
  sessionId: string;
  url?: string;
}

interface CorrelatedIncident {
  purge: PurgeRow;
  events: TelemetryRow[];
  counts: Record<string, number>;
}

const WINDOW_MS = 10 * 60_000;

function statusColor(incident: CorrelatedIncident): { bg: string; label: string; icon: typeof CheckCircle2 } {
  const errs = incident.events.length;
  if (!incident.purge.ok) return { bg: 'bg-red-500/20 text-red-300 border-red-500/40', label: 'Purge failed', icon: AlertTriangle };
  if (errs === 0) return { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', label: 'Clean', icon: CheckCircle2 };
  if (errs < 5) return { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', label: `${errs} events`, icon: AlertTriangle };
  return { bg: 'bg-red-500/20 text-red-300 border-red-500/40', label: `${errs} events`, icon: AlertTriangle };
}

function toMs(at: unknown): number {
  if (typeof at === 'string') {
    const n = Date.parse(at);
    return isFinite(n) ? n : 0;
  }
  if (at instanceof Timestamp) return at.toMillis();
  if (at && typeof at === 'object' && 'seconds' in (at as Record<string, unknown>)) {
    return Number((at as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export default function PurgeIncidentsTab() {
  const [incidents, setIncidents] = useState<CorrelatedIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshAt, setRefreshAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Recent purges (last 50)
      const purgeSnap = await getDocs(
        query(collection(db, 'cache_purge_history'), orderBy('at', 'desc'), limit(50)),
      );
      const purges: PurgeRow[] = purgeSnap.docs.map((d) => {
        const v = d.data() as Record<string, unknown>;
        const atRaw = v.at;
        const atStr = typeof atRaw === 'string' ? atRaw : new Date(toMs(atRaw)).toISOString();
        const smoke = v.smoke as { ok?: boolean; failures?: string[] } | null | undefined;
        return {
          id: d.id,
          at: atStr,
          atMs: toMs(atRaw),
          scope: String(v.scope ?? 'all'),
          ok: Boolean(v.ok),
          status: Number(v.status ?? 0),
          triggeredBy: String(v.triggeredBy ?? ''),
          fileCount: Number(v.fileCount ?? 0),
          error: typeof v.error === 'string' ? v.error : undefined,
          smokeOk: smoke ? Boolean(smoke.ok) : null,
          smokeFailures: smoke?.failures ?? [],
        };
      });

      if (purges.length === 0) {
        setIncidents([]);
        setRefreshAt(Date.now());
        return;
      }

      // Telemetry window: oldest purge − 0 to newest purge + WINDOW_MS
      const oldest = purges[purges.length - 1].atMs;
      const newest = purges[0].atMs + WINDOW_MS;
      let telemetry: TelemetryRow[] = [];
      try {
        const telSnap = await getDocs(
          query(
            collection(db, 'sw_telemetry'),
            where('clientTs', '>=', oldest),
            where('clientTs', '<=', newest),
            orderBy('clientTs', 'desc'),
            limit(2000),
          ),
        );
        telemetry = telSnap.docs.map((d) => {
          const v = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            event: String(v.event ?? 'unknown'),
            clientTs: Number(v.clientTs ?? 0),
            buildId: String(v.buildId ?? ''),
            sessionId: String(v.sessionId ?? ''),
            url: typeof v.url === 'string' ? v.url : undefined,
          };
        });
      } catch (e) {
        // Telemetry collection may not exist yet — degrade gracefully
        console.warn('[purge-incidents] telemetry query failed', e);
      }

      // Correlate
      const out: CorrelatedIncident[] = purges.map((p) => {
        const evs = telemetry.filter((t) => t.clientTs >= p.atMs && t.clientTs <= p.atMs + WINDOW_MS);
        const counts: Record<string, number> = {};
        for (const e of evs) counts[e.event] = (counts[e.event] ?? 0) + 1;
        return { purge: p, events: evs, counts };
      });
      setIncidents(out);
      setRefreshAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let allEvents = 0;
    let badIncidents = 0;
    for (const i of incidents) {
      allEvents += i.events.length;
      if (!i.purge.ok || i.events.length >= 5) badIncidents++;
    }
    return { allEvents, badIncidents, total: incidents.length };
  }, [incidents]);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Purge Incidents</h2>
          <p className="text-sm text-slate-400">
            Cloudflare cache purges correlated with client-side hydration/cache events in the next 10 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-emerald-600 bg-emerald-700/40 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700/60 disabled:opacity-50 min-h-[44px]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border-2 border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase text-slate-400">Purges</div>
          <div className="text-2xl font-bold text-white">{totals.total}</div>
        </div>
        <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase text-slate-400">Post-purge events</div>
          <div className="text-2xl font-bold text-white">{totals.allEvents}</div>
        </div>
        <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase text-slate-400">Bad incidents</div>
          <div className={`text-2xl font-bold ${totals.badIncidents > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{totals.badIncidents}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border-2 border-slate-700 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left w-8" />
              <th className="px-3 py-2 text-left">Timestamp</th>
              <th className="px-3 py-2 text-left">Scope</th>
              <th className="px-3 py-2 text-left">By</th>
              <th className="px-3 py-2 text-right">Files</th>
              <th className="px-3 py-2 text-right">Hydration fails</th>
              <th className="px-3 py-2 text-right">Stale overlays</th>
              <th className="px-3 py-2 text-right">Cache resets</th>
              <th className="px-3 py-2 text-right">Build mismatch</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {incidents.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-400">
                  No purges recorded yet.
                </td>
              </tr>
            )}
            {incidents.map((inc) => {
              const s = statusColor(inc);
              const Icon = s.icon;
              const open = !!expanded[inc.purge.id];
              const hydrFails = (inc.counts['sw_hydration_fallback_shown'] ?? 0) + (inc.counts['sw_hydration_error'] ?? 0);
              const overlays = inc.counts['sw_stale_reload_shown'] ?? 0;
              const resets = inc.counts['sw_cache_reset_clicked'] ?? 0;
              const mismatch = inc.counts['sw_build_mismatch'] ?? 0;
              return (
                <>
                  <tr key={inc.purge.id} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setExpanded((x) => ({ ...x, [inc.purge.id]: !x[inc.purge.id] }))}
                        className="text-slate-400 hover:text-white"
                        aria-label={open ? 'Collapse' : 'Expand'}
                      >
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-200 whitespace-nowrap">
                      {new Date(inc.purge.atMs).toLocaleString('en-GB')}
                    </td>
                    <td className="px-3 py-2"><code className="text-xs text-emerald-300">{inc.purge.scope}</code></td>
                    <td className="px-3 py-2 text-slate-300 truncate max-w-[180px]">{inc.purge.triggeredBy || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{inc.purge.fileCount || '—'}</td>
                    <td className={`px-3 py-2 text-right ${hydrFails ? 'text-red-300 font-semibold' : 'text-slate-500'}`}>{hydrFails}</td>
                    <td className={`px-3 py-2 text-right ${overlays ? 'text-amber-300 font-semibold' : 'text-slate-500'}`}>{overlays}</td>
                    <td className={`px-3 py-2 text-right ${resets ? 'text-amber-300 font-semibold' : 'text-slate-500'}`}>{resets}</td>
                    <td className={`px-3 py-2 text-right ${mismatch ? 'text-slate-200' : 'text-slate-500'}`}>{mismatch}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${s.bg}`}>
                        <Icon className="h-3 w-3" />
                        {s.label}
                      </span>
                    </td>
                  </tr>
                  {open && (
                    <tr key={inc.purge.id + ':detail'} className="bg-slate-950/50">
                      <td colSpan={10} className="px-6 py-3">
                        {inc.purge.error && (
                          <div className="mb-2 text-xs text-red-300">Purge error: {inc.purge.error}</div>
                        )}
                        {inc.purge.smokeOk === false && (
                          <div className="mb-2 text-xs text-amber-300">
                            Smoke test failures: {(inc.purge.smokeFailures ?? []).join(' · ')}
                          </div>
                        )}
                        <div className="mb-2 text-xs uppercase text-slate-400">
                          Telemetry events in next 10 min ({inc.events.length})
                        </div>
                        {inc.events.length === 0 ? (
                          <div className="text-xs text-slate-500">No client-side events recorded.</div>
                        ) : (
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="text-slate-400">
                                <tr>
                                  <th className="text-left px-2 py-1">Time</th>
                                  <th className="text-left px-2 py-1">Event</th>
                                  <th className="text-left px-2 py-1">Build</th>
                                  <th className="text-left px-2 py-1">URL</th>
                                </tr>
                              </thead>
                              <tbody className="text-slate-300">
                                {inc.events.map((ev) => (
                                  <tr key={ev.id} className="border-t border-slate-800">
                                    <td className="px-2 py-1 whitespace-nowrap">{new Date(ev.clientTs).toLocaleTimeString('en-GB')}</td>
                                    <td className="px-2 py-1"><code>{ev.event}</code></td>
                                    <td className="px-2 py-1 font-mono text-[10px] text-slate-400">{ev.buildId.slice(0, 20)}</td>
                                    <td className="px-2 py-1 truncate max-w-[280px] text-slate-400">{ev.url || ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {refreshAt > 0 && (
        <div className="text-xs text-slate-500">Loaded {new Date(refreshAt).toLocaleTimeString('en-GB')}</div>
      )}
    </div>
  );
}
