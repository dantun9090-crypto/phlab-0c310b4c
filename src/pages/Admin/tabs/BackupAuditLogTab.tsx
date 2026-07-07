/**
 * Admin: /admin/backupauditlog
 *
 * Reads the `backup_audit_log` Firestore collection directly (rules limit
 * read to admins). Every accepted or rejected trigger of
 * /api/public/hooks/firestore-backup writes one row here — see
 * `src/routes/api/public/hooks/firestore-backup.ts`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Shield, Filter, RefreshCw, Loader2, Search } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit as fsLimit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';

interface AuditRow {
  id: string;
  endpoint?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  result?: string | null;
  authMethod?: string | null;
  authReason?: string | null;
  detail?: string | null;
  runId?: string | null;
  actor?: string | null;
  createdAt?: Timestamp | null;
}

const STATUS_BUCKETS: { id: string; label: string; match: (s: number | null | undefined) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: '2xx', label: 'Success (2xx)', match: (s) => !!s && s >= 200 && s < 300 },
  { id: '401', label: 'Unauthorized (401)', match: (s) => s === 401 },
  { id: '403', label: 'Locked (403)', match: (s) => s === 403 },
  { id: '429', label: 'Throttled (429)', match: (s) => s === 429 },
  { id: '5xx', label: 'Server (5xx)', match: (s) => !!s && s >= 500 },
];

const ACTORS: { id: string; label: string }[] = [
  { id: 'all', label: 'Any actor' },
  { id: 'apikey', label: 'pg_cron (apikey)' },
  { id: 'cron_secret', label: 'x-cron-secret' },
  { id: 'unauthenticated', label: 'Unauthenticated' },
];

const TIME_RANGES: { id: string; label: string; ms: number | null }[] = [
  { id: '1h', label: 'Last 1h', ms: 60 * 60 * 1000 },
  { id: '24h', label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: 'Last 7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: 'all', label: 'All loaded', ms: null },
];

function statusColor(s: number | null | undefined): string {
  if (!s) return 'bg-slate-700/40 text-slate-300 border-slate-600';
  if (s >= 200 && s < 300) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  if (s === 401) return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  if (s === 403) return 'bg-red-500/10 text-red-300 border-red-500/30';
  if (s === 429) return 'bg-orange-500/10 text-orange-300 border-orange-500/30';
  if (s >= 500) return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
  return 'bg-slate-700/40 text-slate-300 border-slate-600';
}

export default function BackupAuditLogTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<string>('24h');
  const [ipQuery, setIpQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(200);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'backup_audit_log'),
        orderBy('createdAt', 'desc'),
        fsLimit(pageSize),
      );
      const snap = await getDocs(q);
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditRow, 'id'>) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backup audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const now = Date.now();
  const rangeMs = TIME_RANGES.find((r) => r.id === rangeFilter)?.ms ?? null;
  const statusBucket = STATUS_BUCKETS.find((b) => b.id === statusFilter) ?? STATUS_BUCKETS[0];
  const ipQ = ipQuery.trim().toLowerCase();

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!statusBucket.match(r.status ?? null)) return false;
      if (actorFilter !== 'all' && (r.actor ?? 'unauthenticated') !== actorFilter) return false;
      if (rangeMs !== null) {
        const t = r.createdAt?.toMillis?.() ?? null;
        if (t === null || now - t > rangeMs) return false;
      }
      if (ipQ && !(r.ip ?? '').toLowerCase().includes(ipQ)) return false;
      return true;
    });
  }, [rows, statusBucket, actorFilter, rangeMs, ipQ, now]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" />
            Backup Audit Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Every call to <code className="text-slate-300">/api/public/hooks/firestore-backup</code>
            {' '}— accepted or rejected. Retention 90 days (auto-purged by security-cleanup cron).
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 hover:bg-slate-700 text-white text-sm min-h-[48px]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
            <Filter className="inline w-3 h-3 mr-1" />Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3"
          >
            {STATUS_BUCKETS.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Actor</label>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3"
          >
            {ACTORS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Time range</label>
          <select
            value={rangeFilter}
            onChange={(e) => setRangeFilter(e.target.value)}
            className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3"
          >
            {TIME_RANGES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
            <Search className="inline w-3 h-3 mr-1" />IP contains
          </label>
          <input
            value={ipQuery}
            onChange={(e) => setIpQuery(e.target.value)}
            placeholder="e.g. 203.0.113"
            className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-3 placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Showing {filtered.length} of {rows.length} loaded rows</span>
        <label className="flex items-center gap-2">
          Page size:
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border-2 border-slate-600 bg-slate-800 text-white px-2 py-1"
          >
            {[100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border-2 border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Result</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">IP</th>
              <th className="px-3 py-2 text-left">Run ID</th>
              <th className="px-3 py-2 text-left">Detail</th>
              <th className="px-3 py-2 text-left">User-Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No audit entries match these filters.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/40 align-top">
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap font-mono text-xs">
                  {r.createdAt?.toDate?.().toISOString().replace('T', ' ').slice(0, 19) ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-mono ${statusColor(r.status)}`}>
                    {r.status ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-300 text-xs">{r.result ?? '—'}</td>
                <td className="px-3 py-2 text-slate-300 text-xs">
                  {r.actor ?? 'unauthenticated'}
                  {r.authReason ? <span className="text-slate-500"> · {r.authReason}</span> : null}
                </td>
                <td className="px-3 py-2 text-slate-400 font-mono text-xs">{r.ip ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500 font-mono text-xs max-w-[160px] truncate" title={r.runId ?? ''}>
                  {r.runId ?? '—'}
                </td>
                <td className="px-3 py-2 text-slate-400 text-xs max-w-[260px] truncate" title={r.detail ?? ''}>
                  {r.detail ?? '—'}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs max-w-[260px] truncate" title={r.userAgent ?? ''}>
                  {r.userAgent ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
