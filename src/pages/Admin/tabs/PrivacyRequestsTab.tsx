/**
 * Admin → Privacy Requests (DSR / GDPR)
 *
 * Lists `dsrRequests` from Firestore in real time. Admins can:
 *   - Export the requester's personal data as JSON (Art. 15 / Art. 20)
 *   - Anonymise / erase (Art. 17) — orders kept (HMRC 6y), PII redacted
 *   - Reject a request with a reason
 *   - Add a status note (in_progress, waiting_user, …)
 *
 * All mutations go through /api/dsr/process (admin-gated, service account).
 */
import { useEffect, useMemo, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import {
  collection, query, orderBy, limit, onSnapshot, Timestamp,
} from 'firebase/firestore';
import {
  ShieldCheck, Loader2, Download, Trash2, XCircle, MessageSquare,
  Mail, Clock, Filter, AlertCircle, CheckCircle2,
} from 'lucide-react';

type Status = 'pending' | 'in_progress' | 'waiting_user' | 'completed' | 'rejected';
type RequestType = 'access' | 'rectification' | 'deletion' | 'portability' | 'objection' | 'restriction';

interface DsrDoc {
  id: string;
  type: RequestType;
  email: string;
  fullName: string;
  details?: string;
  status: Status;
  createdAt?: Timestamp;
  fulfilledAt?: Timestamp;
  fulfilledAction?: 'export' | 'delete';
  handledBy?: string;
  notes?: string;
  erasureSummary?: { customers?: number; orders?: number; emailSubscribers?: number };
}

const TYPE_LABEL: Record<RequestType, string> = {
  access: 'Access',
  rectification: 'Correction',
  deletion: 'Deletion',
  portability: 'Export',
  objection: 'Objection',
  restriction: 'Restriction',
};

const STATUS_CLASS: Record<Status, string> = {
  pending:      'bg-amber-500/10 text-amber-300 border-amber-500/30',
  in_progress:  'bg-blue-500/10 text-blue-300 border-blue-500/30',
  waiting_user: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  completed:    'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  rejected:     'bg-red-500/10 text-red-300 border-red-500/30',
};

function fmt(ts?: Timestamp) {
  if (!ts) return '—';
  try { return ts.toDate().toLocaleString('en-GB'); } catch { return '—'; }
}

function dueIn(createdAt?: Timestamp): { label: string; overdue: boolean } {
  if (!createdAt) return { label: '—', overdue: false };
  const due = createdAt.toDate().getTime() + 30 * 86400000;
  const days = Math.ceil((due - Date.now()) / 86400000);
  if (days < 0) return { label: `${-days}d OVERDUE`, overdue: true };
  return { label: `${days}d left`, overdue: false };
}

async function callProcess(payload: {
  requestId: string;
  action: 'export' | 'delete' | 'reject' | 'note';
  notes?: string;
  status?: string;
}) {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in');
  const idToken = await u.getIdToken();
  const res = await fetch('/api/dsr/process', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, idToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function PrivacyRequestsTab() {
  const [rows, setRows] = useState<DsrDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Status>('pending');

  useEffect(() => {
    const q = query(collection(db, 'dsrRequests'), orderBy('createdAt', 'desc'), limit(300));
    const unsub = onSnapshot(q, snap => {
      setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
      setError(null);
    }, err => {
      setError(err?.code || err?.message || 'Failed to load requests');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(
    () => filter === 'all' ? rows : rows.filter(r => r.status === filter),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const c = { pending: 0, in_progress: 0, completed: 0, rejected: 0, overdue: 0 };
    for (const r of rows) {
      if (r.status === 'pending' || r.status === 'in_progress' || r.status === 'waiting_user') {
        if (dueIn(r.createdAt).overdue) c.overdue++;
      }
      if (r.status in c) (c as any)[r.status]++;
    }
    return c;
  }, [rows]);

  const handle = async (
    row: DsrDoc,
    action: 'export' | 'delete' | 'reject' | 'note',
  ) => {
    let notes: string | undefined;
    let status: string | undefined;

    if (action === 'delete') {
      if (!confirm(`ERASE all personal data linked to ${row.email}?\n\nOrders will be kept (HMRC 6y) but PII will be redacted. This cannot be undone.`)) return;
    } else if (action === 'reject') {
      const reason = prompt('Reason for rejecting this request (sent to audit trail):');
      if (!reason) return;
      notes = reason;
    } else if (action === 'note') {
      const next = prompt('New status (in_progress / waiting_user / completed):', 'in_progress');
      if (!next) return;
      status = next;
      notes = prompt('Note (optional):') || undefined;
    }

    setBusyId(row.id);
    try {
      const data = await callProcess({ requestId: row.id, action, notes, status });
      if (action === 'export' && data?.data) {
        downloadJson(`dsr-export-${row.id.slice(0, 8)}-${row.email}.json`, data);
      }
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Privacy Requests (GDPR / DSR)</h1>
          <p className="text-sm text-slate-400">
            Data Subject Requests from /privacy-requests. Statutory deadline: 30 days.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Pending',   value: counts.pending,     color: 'amber' },
          { label: 'In progress', value: counts.in_progress, color: 'blue' },
          { label: 'Completed', value: counts.completed,   color: 'emerald' },
          { label: 'Rejected',  value: counts.rejected,    color: 'red' },
          { label: 'Overdue',   value: counts.overdue,     color: 'red' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border-2 border-slate-700 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color === 'red' ? 'text-red-300' : s.color === 'emerald' ? 'text-emerald-300' : s.color === 'amber' ? 'text-amber-300' : 'text-blue-300'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        {(['all', 'pending', 'in_progress', 'waiting_user', 'completed', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border-2 transition ${
              filter === f
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm bg-slate-900 border-2 border-slate-700 rounded-lg">
          No requests match the current filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const due = dueIn(row.createdAt);
            const busy = busyId === row.id;
            const isFinal = row.status === 'completed' || row.status === 'rejected';
            return (
              <div key={row.id} className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-0.5">
                        {row.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {TYPE_LABEL[row.type] ?? row.type}
                      </span>
                      <span className={`text-[10px] uppercase font-bold tracking-wider border rounded px-2 py-0.5 ${STATUS_CLASS[row.status] ?? STATUS_CLASS.pending}`}>
                        {row.status.replace('_', ' ')}
                      </span>
                      {!isFinal && (
                        <span className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 ${due.overdue ? 'text-red-400' : 'text-slate-400'}`}>
                          <Clock className="w-3 h-3" /> {due.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-200">{row.fullName}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Mail className="w-3 h-3" /> {row.email}
                    </p>
                    <p className="text-[11px] text-slate-500">Submitted {fmt(row.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handle(row, 'export')}
                      className="text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Export JSON
                    </button>
                    <button
                      type="button"
                      disabled={busy || isFinal}
                      onClick={() => handle(row, 'delete')}
                      className="text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Erase PII
                    </button>
                    <button
                      type="button"
                      disabled={busy || isFinal}
                      onClick={() => handle(row, 'note')}
                      className="text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Update status
                    </button>
                    <button
                      type="button"
                      disabled={busy || isFinal}
                      onClick={() => handle(row, 'reject')}
                      className="text-xs font-semibold flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-300 border border-red-500/30 disabled:opacity-40"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>

                {row.details && (
                  <div className="text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
                    {row.details}
                  </div>
                )}

                {(row.notes || row.handledBy || row.fulfilledAt) && (
                  <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-2 space-y-0.5">
                    {row.fulfilledAt && (
                      <p className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Fulfilled {fmt(row.fulfilledAt)} ({row.fulfilledAction ?? '—'})</p>
                    )}
                    {row.handledBy && <p>Handled by <span className="text-slate-300">{row.handledBy}</span></p>}
                    {row.notes && <p className="italic">"{row.notes}"</p>}
                    {row.erasureSummary && (
                      <p>Erased: {row.erasureSummary.customers ?? 0} customer, {row.erasureSummary.orders ?? 0} orders, {row.erasureSummary.emailSubscribers ?? 0} subscribers</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
