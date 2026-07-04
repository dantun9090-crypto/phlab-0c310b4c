/**
 * Admin → Infrastructure Health dashboard.
 *
 * Reads results written by /api/public/health-deep (cron, 15-min cadence)
 * from Firestore collections:
 *   - health_checks  : full report per run
 *   - health_alerts  : FAIL alerts pending acknowledgement
 *
 * Surfaces:
 *   - Status banner (latest run PASS/FAIL)
 *   - 7 per-check cards with last-5 trend dots
 *   - 50-row history table with "Load More"
 *   - Unacknowledged alerts sticky banner + ack list
 * Auto-refresh: 60s. Auth/admin gating handled by parent AdminPage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  acknowledgeInfraHealthAlert,
  listInfraHealthAlerts,
  listInfraHealthChecks,
  runInfraHealthCheckNow,
} from '@/lib/health-monitor.functions';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Bell,
  PlayCircle,
  Loader2,
} from 'lucide-react';

const CHECK_KEYS = [
  'robots_cache',
  'sitemap_fresh',
  'prerender',
  'edge_cache',
  'worker_cache',
  'ttl_zero',
  'csp',
] as const;
type CheckKey = (typeof CHECK_KEYS)[number];

const CHECK_LABELS: Record<CheckKey, string> = {
  robots_cache: 'robots.txt cache',
  sitemap_fresh: 'sitemap freshness',
  prerender: 'Prerender.io (bot)',
  edge_cache: 'Cloudflare edge',
  worker_cache: 'Worker x-phl-cache',
  ttl_zero: 'htmlTtl ≠ 0',
  csp: 'CSP header',
};

interface CheckEntry {
  status: 'PASS' | 'FAIL';
  detail: string;
}

interface HealthRow {
  id: string;
  timestamp: number;
  overall: 'PASS' | 'FAIL';
  checks: Partial<Record<CheckKey, CheckEntry>>;
}

interface AlertRow {
  id: string;
  timestamp: number;
  failedChecks: string[];
  details: string;
  notified: boolean;
}

interface InfraListResult {
  ok: boolean;
  rows: Array<Record<string, unknown> & { id: string }>;
  error?: string;
}

interface InfraRunResult {
  ok: boolean;
  status: number;
  overall: string | null;
  error?: string;
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === 'object' && v !== null) {
    const o = v as { toMillis?: () => number; seconds?: number };
    if (typeof o.toMillis === 'function') {
      try { return o.toMillis(); } catch { /* noop */ }
    }
    if (typeof o.seconds === 'number') return o.seconds * 1000;
  }
  return 0;
}

function normalizeHealth(id: string, raw: Record<string, unknown>): HealthRow {
  const checksRaw = (raw.checks ?? {}) as Record<string, CheckEntry>;
  const checks: HealthRow['checks'] = {};
  for (const k of CHECK_KEYS) {
    const v = checksRaw[k];
    if (v && (v.status === 'PASS' || v.status === 'FAIL')) {
      checks[k] = { status: v.status, detail: String(v.detail ?? '') };
    }
  }
  return {
    id,
    timestamp: toMillis(raw.timestamp) || toMillis(raw.createdAt),
    overall: raw.overall === 'PASS' ? 'PASS' : 'FAIL',
    checks,
  };
}

function normalizeAlert(id: string, raw: Record<string, unknown>): AlertRow {
  const failedChecks = Array.isArray(raw.failedChecks)
    ? (raw.failedChecks as unknown[]).map(String)
    : typeof raw.failedChecks === 'string'
      ? (raw.failedChecks as string).split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  return {
    id,
    timestamp: toMillis(raw.timestamp) || toMillis(raw.createdAt),
    failedChecks,
    details: typeof raw.details === 'string' ? raw.details : '',
    notified: raw.notified === true,
  };
}

function fmtTime(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}
function fmtFull(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

function StatusDot({ status, size = 10 }: { status: 'PASS' | 'FAIL' | null; size?: number }) {
  const cls =
    status === 'PASS' ? 'bg-emerald-400'
    : status === 'FAIL' ? 'bg-red-500'
    : 'bg-slate-600';
  return (
    <span
      aria-label={status ?? 'unknown'}
      className={`inline-block rounded-full ${cls}`}
      style={{ width: size, height: size }}
    />
  );
}

export default function InfraHealthTab() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

  const loadAll = useCallback(async (size: number) => {
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      const res = await listInfraHealthChecks({ data: { idToken, limit: size } }) as InfraListResult;
      if (!res.ok) throw new Error(res.error || 'Failed to load health checks');
      setRows(res.rows.map((d) => normalizeHealth(d.id, d as Record<string, unknown>)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      const res = await listInfraHealthAlerts({ data: { idToken } }) as InfraListResult;
      if (!res.ok) throw new Error(res.error || 'Failed to load health alerts');
      const all = res.rows.map((d) => normalizeAlert(d.id, d as Record<string, unknown>));
      setAlerts(all);
    } catch {
      // collection may not exist yet — silent
      setAlerts([]);
    }
  }, []);

  useEffect(() => { loadAll(pageSize); loadAlerts(); }, [loadAll, loadAlerts, pageSize]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = window.setInterval(() => {
      loadAll(pageSize);
      loadAlerts();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [loadAll, loadAlerts, pageSize]);

  const latest = rows[0] ?? null;
  const unacked = useMemo(() => alerts.filter((a) => !a.notified), [alerts]);

  const acknowledgeAlert = async (id: string) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      await acknowledgeInfraHealthAlert({ data: { idToken, id } });
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, notified: true } : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const triggerManual = async () => {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      const res = await runInfraHealthCheckNow({ data: { idToken } }) as InfraRunResult;
      setTriggerMsg(`HTTP ${res.status} — overall: ${res.overall ?? '?'}`);
      await loadAll(pageSize);
      await loadAlerts();
    } catch (e) {
      setTriggerMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  };

  // Per-check trend = last 5 runs (rows are already desc)
  const trendFor = (key: CheckKey): ('PASS' | 'FAIL' | null)[] => {
    const arr: ('PASS' | 'FAIL' | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const r = rows[i];
      arr.push(r?.checks[key]?.status ?? null);
    }
    return arr; // newest first
  };

  return (
    <div className="space-y-6">
      {/* Unacked alerts sticky banner */}
      {unacked.length > 0 && (
        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-red-950/80 border-y-2 border-red-700 backdrop-blur flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-red-100">
            <Bell className="w-5 h-5" />
            <strong>{unacked.length} unacknowledged alert{unacked.length === 1 ? '' : 's'}</strong>
          </div>
          <button
            onClick={() => setShowAlerts(true)}
            className="min-h-[40px] px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold text-sm"
          >
            View Alerts
          </button>
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Infrastructure Health Monitor</h1>
          <p className="text-sm text-slate-400">
            Auto-refresh every 60s · Source: <code className="text-emerald-400">health_checks</code> · Endpoint:{' '}
            <code className="text-emerald-400">/api/public/health-deep</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadAll(pageSize)}
            disabled={loading}
            className="flex items-center gap-2 min-h-[40px] px-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={triggerManual}
            disabled={triggering}
            className="flex items-center gap-2 min-h-[40px] px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
          >
            {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Run check now
          </button>
        </div>
      </header>

      {triggerMsg && (
        <div className="text-xs font-mono text-slate-300 bg-slate-800 border border-slate-700 rounded px-3 py-2">
          {triggerMsg}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/40 border border-red-800 rounded p-3 font-mono">
          {error}
        </div>
      )}

      {/* Status banner */}
      {loading && !latest ? (
        <div className="h-28 rounded-xl bg-slate-800 animate-pulse" />
      ) : !latest ? (
        <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-6 text-slate-300">
          No health checks recorded yet. The cron job may not have run.
          <button
            onClick={triggerManual}
            disabled={triggering}
            className="ml-3 inline-flex items-center gap-2 min-h-[40px] px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
          >
            <PlayCircle className="w-4 h-4" /> Trigger now
          </button>
        </div>
      ) : (
        <div
          className={`rounded-xl border-2 p-5 flex items-start gap-4 ${
            latest.overall === 'PASS'
              ? 'border-emerald-700 bg-emerald-950/40'
              : 'border-red-700 bg-red-950/40'
          }`}
        >
          {latest.overall === 'PASS' ? (
            <CheckCircle2 className="w-10 h-10 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-red-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-xl font-bold ${latest.overall === 'PASS' ? 'text-emerald-200' : 'text-red-200'}`}>
              {latest.overall === 'PASS' ? 'All Systems Operational' : 'Infrastructure Alert'}
            </p>
            {latest.overall === 'FAIL' && (
              <p className="text-sm text-red-200/90 mt-1">
                Failing checks:{' '}
                <span className="font-mono">
                  {CHECK_KEYS.filter((k) => latest.checks[k]?.status === 'FAIL').join(', ') || '—'}
                </span>
              </p>
            )}
            <p className="text-xs text-slate-400 mt-2">
              Last checked: {fmtFull(latest.timestamp)}
            </p>
          </div>
        </div>
      )}

      {/* Per-check grid */}
      <section
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        {CHECK_KEYS.map((key) => {
          const c = latest?.checks[key];
          const trend = trendFor(key);
          const ok = c?.status === 'PASS';
          return (
            <div
              key={key}
              className={`rounded-lg p-4 bg-slate-900 border border-slate-800 ${
                c ? (ok ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-500 bg-slate-900/80') : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">{CHECK_LABELS[key]}</p>
                  <p className="text-xs text-slate-500 font-mono">{key}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded ${
                    c
                      ? ok
                        ? 'text-emerald-200 bg-emerald-900/50'
                        : 'text-red-200 bg-red-900/50'
                      : 'text-slate-400 bg-slate-800'
                  }`}
                >
                  <StatusDot status={c?.status ?? null} />
                  {c?.status ?? 'N/A'}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono break-words min-h-[2.5em]">
                {c?.detail ?? '—'}
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="text-[10px] uppercase text-slate-500 mr-1">last 5</span>
                {trend.map((s, i) => (
                  <StatusDot key={i} status={s} size={9} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* History table */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">History (last {rows.length})</h2>
          {rows.length >= pageSize && (
            <button
              onClick={() => setPageSize((n) => n + 50)}
              className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded font-semibold"
            >
              Load more
            </button>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-800/60 text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Time</th>
                <th className="text-left px-3 py-2 font-semibold">Overall</th>
                {CHECK_KEYS.map((k) => (
                  <th key={k} className="text-center px-2 py-2 font-mono font-normal" title={CHECK_LABELS[k]}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={2 + CHECK_KEYS.length} className="px-3 py-8 text-center text-slate-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={2 + CHECK_KEYS.length} className="px-3 py-8 text-center text-slate-500">No runs yet.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-200 font-mono" title={fmtFull(r.timestamp)}>
                      {fmtTime(r.timestamp)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${r.overall === 'PASS' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.overall}
                      </span>
                    </td>
                    {CHECK_KEYS.map((k) => {
                      const s = r.checks[k]?.status ?? null;
                      return (
                        <td key={k} className="px-2 py-2 text-center" title={r.checks[k]?.detail ?? 'no data'}>
                          <StatusDot status={s} />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Alerts section */}
      {(showAlerts || alerts.length > 0) && (
        <section id="alerts" className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">
              Alert history ({alerts.length}, {unacked.length} unacknowledged)
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-800/60 text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Timestamp</th>
                  <th className="text-left px-3 py-2 font-semibold">Failed checks</th>
                  <th className="text-left px-3 py-2 font-semibold">Details</th>
                  <th className="text-right px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No alerts.</td></tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.id} className={`border-t border-slate-800 ${a.notified ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2 font-mono text-slate-200" title={fmtFull(a.timestamp)}>
                        {fmtTime(a.timestamp)}
                      </td>
                      <td className="px-3 py-2 font-mono text-red-300">{a.failedChecks.join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-slate-300 max-w-md truncate" title={a.details}>{a.details}</td>
                      <td className="px-3 py-2 text-right">
                        {a.notified ? (
                          <span className="text-emerald-400 text-xs">acknowledged</span>
                        ) : (
                          <button
                            onClick={() => acknowledgeAlert(a.id)}
                            className="min-h-[36px] px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                          >
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
