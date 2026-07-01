/**
 * Admin panel: managed Firestore → Cloud Storage backups.
 *
 * Talks to /api/public/firestore-backups (Firebase-admin gated).
 * The scheduled cron lives at /api/public/hooks/firestore-backup and is
 * triggered nightly by pg_cron.
 */
import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  RefreshCw,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cloud,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface BackupRow {
  id: string;
  operation_name: string | null;
  run_id: string;
  output_uri_prefix: string;
  collection_ids: string[] | null;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

const PAGE = 50;

function fmt(dt: string | null): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return dt;
  }
}

function duration(start: string, end: string | null): string {
  if (!end) return 'running…';
  try {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    const sec = Math.max(0, Math.round((e - s) / 1000));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  } catch {
    return '—';
  }
}

export default function FirestoreBackupsTab() {
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [backupBase, setBackupBase] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const u = auth.currentUser;
    if (!u) throw new Error('Not signed in');
    const idToken = await u.getIdToken();
    const res = await fetch('/api/public/firestore-backups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, idToken }),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    if (!res.ok) {
      const detail = (data as { detail?: string; error?: string } | null)?.detail
        || (data as { error?: string } | null)?.error
        || text
        || `HTTP ${res.status}`;
      throw new Error(detail);
    }
    return data as Record<string, unknown>;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await call({ action: 'list', limit: PAGE, offset: 0 });
      setRows((data.rows as BackupRow[]) ?? []);
      setTotal((data.total as number) ?? 0);
      setBackupBase((data.backupBase as string) ?? '');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const trigger = useCallback(async () => {
    setBusy('trigger');
    setErr(null); setMsg(null);
    try {
      const data = await call({ action: 'trigger' });
      const t = data.trigger as { runId?: string } | undefined;
      setMsg(`Backup started: ${t?.runId ?? 'ok'}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [call, load]);

  const poll = useCallback(async () => {
    setBusy('poll');
    setErr(null); setMsg(null);
    try {
      const data = await call({ action: 'poll' });
      setMsg(`Polled ${data.checked ?? 0} running · updated ${data.updated ?? 0}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [call, load]);

  const lastSuccess = rows.find((r) => r.status === 'DONE');
  const runningCount = rows.filter((r) => r.status === 'RUNNING').length;
  const failedRecent = rows.slice(0, 7).filter((r) => r.status === 'FAILED').length;

  return (
    <div className="text-slate-200 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Cloud className="w-6 h-6 text-emerald-400" />
            Firestore Backups
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Managed Firestore <span className="text-emerald-300">exportDocuments</span> runs
            nightly and writes to <code className="text-emerald-400 text-xs break-all">{backupBase || 'gs://…'}</code>.
            Restore with <code className="text-emerald-400 text-xs">gcloud firestore import</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void poll()}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 hover:bg-slate-700 text-white text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {busy === 'poll' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh status
          </button>
          <button
            onClick={() => void trigger()}
            disabled={busy !== null}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm flex items-center gap-2 disabled:opacity-50 border-2 border-emerald-500"
          >
            {busy === 'trigger' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Run backup now
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-900 border-2 border-slate-700 p-4">
          <div className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Last successful</div>
          <div className="text-white font-mono text-sm mt-1">
            {lastSuccess ? fmt(lastSuccess.completed_at || lastSuccess.started_at) : '—'}
          </div>
        </div>
        <div className="rounded-xl bg-slate-900 border-2 border-slate-700 p-4">
          <div className="text-xs text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Currently running</div>
          <div className="text-white font-mono text-sm mt-1">{runningCount}</div>
        </div>
        <div className="rounded-xl bg-slate-900 border-2 border-slate-700 p-4">
          <div className="text-xs text-slate-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Failed (last 7)</div>
          <div className={`font-mono text-sm mt-1 ${failedRecent ? 'text-red-400' : 'text-white'}`}>{failedRecent}</div>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border-2 border-red-500 bg-red-950/60 text-red-200 px-3 py-2 text-sm">
          {err}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-950/40 text-emerald-200 px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      <div className="rounded-xl bg-slate-900 border-2 border-slate-700 overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-700 flex justify-between items-center">
          <div className="text-sm text-slate-300">Backup history · {total} total</div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/50 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Started</th>
                <th className="px-3 py-2 text-left">Duration</th>
                <th className="px-3 py-2 text-left">Run ID</th>
                <th className="px-3 py-2 text-left">Trigger</th>
                <th className="px-3 py-2 text-left">Output</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No backups yet — click "Run backup now" or wait for the nightly job.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                  <td className="px-3 py-2">
                    {r.status === 'DONE' && <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />DONE</span>}
                    {r.status === 'RUNNING' && <span className="inline-flex items-center gap-1 text-blue-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />RUNNING</span>}
                    {r.status === 'FAILED' && <span className="inline-flex items-center gap-1 text-red-400" title={r.error || ''}><AlertTriangle className="w-3.5 h-3.5" />FAILED</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{fmt(r.started_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{duration(r.started_at, r.completed_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.run_id}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{r.triggered_by}</td>
                  <td className="px-3 py-2 font-mono text-xs text-emerald-300 break-all max-w-[380px]">
                    {r.output_uri_prefix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="rounded-xl bg-slate-900 border-2 border-slate-700 p-4">
        <summary className="cursor-pointer text-slate-200 font-semibold">How to restore</summary>
        <div className="mt-3 text-sm text-slate-300 space-y-2">
          <p>Every backup writes an <code className="text-emerald-400">*.overall_export_metadata</code> file at its run folder. Restore full or per-collection:</p>
          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs overflow-x-auto text-emerald-300">
{`# Full restore (overwrites existing docs with same IDs)
gcloud firestore import \\
  <output_uri_prefix>/<run_id>.overall_export_metadata \\
  --project=prohealthpeptides-a0808

# Restore only orders + customers
gcloud firestore import \\
  <output_uri_prefix>/<run_id>.overall_export_metadata \\
  --collection-ids=orders,customers \\
  --project=prohealthpeptides-a0808`}
          </pre>
          <p className="text-slate-400 text-xs">Retention: set a GCS lifecycle rule on <code className="text-emerald-400">{backupBase || 'the backup bucket'}</code> to auto-delete objects older than 90 days.</p>
        </div>
      </details>
    </div>
  );
}
