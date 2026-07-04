import { useEffect, useMemo, useState } from 'react';
import {
  Mail, RefreshCw, CheckCircle2, AlertCircle, Clock, Loader2, Send, Search, Filter,
} from 'lucide-react';
import { db, collection, query, orderBy, limit as fbLimit, getDocs } from '@/lib/firebase';

type DeliveryState = 'PENDING' | 'PROCESSING' | 'RETRY' | 'SUCCESS' | 'ERROR';
type UiStatus = 'queued' | 'sent' | 'failed' | 'unknown';

interface MailRow {
  id: string;
  source: 'mail' | 'emailQueue';
  to: string;
  subject: string;
  createdAt: Date | null;
  sentAt: Date | null;
  attempts: number;
  state: DeliveryState | string | null;
  status: UiStatus;
  error: string | null;
  template: string | null;
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) try { return v.toDate(); } catch { /* noop */ }
  if (v?.seconds) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const mapMailState = (state: any, hasError: boolean): UiStatus => {
  const s = (state || '').toString().toUpperCase();
  if (s === 'SUCCESS') return 'sent';
  if (s === 'ERROR' || hasError) return 'failed';
  if (s === 'PENDING' || s === 'PROCESSING' || s === 'RETRY') return 'queued';
  return hasError ? 'failed' : 'unknown';
};

const StatusBadge = ({ status }: { status: UiStatus }) => {
  const map: Record<UiStatus, { label: string; cls: string; Icon: typeof Clock }> = {
    queued:  { label: 'Queued',  cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',  Icon: Clock },
    sent:    { label: 'Sent',    cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', Icon: CheckCircle2 },
    failed:  { label: 'Failed',  cls: 'bg-red-500/10 text-red-300 border-red-500/30',        Icon: AlertCircle },
    unknown: { label: 'Unknown', cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30',  Icon: Mail },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
};

const fmt = (d: Date | null) =>
  d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

const secondsBetween = (a: Date | null, b: Date | null) => {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 1000);
};

const humanDelay = (secs: number | null) => {
  if (secs == null) return '—';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
};

export default function EmailQueueTab() {
  const [rows, setRows] = useState<MailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | UiStatus>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'mail' | 'emailQueue'>('all');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(100);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mailSnap, queueSnap] = await Promise.all([
        getDocs(query(collection(db, 'mail'), orderBy('delivery.startTime', 'desc'), fbLimit(pageSize))).catch(() =>
          getDocs(query(collection(db, 'mail'), fbLimit(pageSize)))
        ),
        getDocs(query(collection(db, 'emailQueue'), orderBy('createdAt', 'desc'), fbLimit(pageSize))).catch(() =>
          getDocs(query(collection(db, 'emailQueue'), fbLimit(pageSize)))
        ),
      ]);

      const mailRows: MailRow[] = mailSnap.docs.map((d) => {
        const data: any = d.data() || {};
        const delivery = data.delivery || {};
        const createdAt = toDate(delivery.startTime) || toDate(data.createdAt);
        const sentAt = toDate(delivery.endTime) || toDate(delivery.leaseExpireTime);
        const state = delivery.state as DeliveryState | undefined;
        const err = delivery.error || null;
        const to = Array.isArray(data.to) ? data.to.join(', ') : (data.to || data.toUids?.join(', ') || '');
        return {
          id: d.id,
          source: 'mail',
          to,
          subject: data.message?.subject || data.template?.name || '(no subject)',
          createdAt,
          sentAt,
          attempts: delivery.attempts || 0,
          state: state ?? null,
          status: mapMailState(state, !!err),
          error: err,
          template: data.template?.name || null,
        };
      });
      const mailStatusById = new Map(mailRows.map((row) => [row.id, row]));

      const queueRows: MailRow[] = queueSnap.docs.map((d) => {
        const data: any = d.data() || {};
        const createdAt = toDate(data.createdAt);
        const linkedMail = typeof data.mailDocId === 'string' ? mailStatusById.get(data.mailDocId) : undefined;
        const sentAt = linkedMail?.sentAt || toDate(data.sentAt) || toDate(data.processedAt);
        const status: UiStatus = linkedMail?.status ||
          data.status === 'sent' ? 'sent'
          : data.status === 'failed' || data.error ? 'failed'
          : data.status === 'processing' || data.status === 'pending' || !data.status ? 'queued'
          : 'unknown';
        return {
          id: d.id,
          source: 'emailQueue',
          to: data.to || data.recipient || `${data.recipientCount ?? '?'} recipients`,
          subject: data.subject || data.template || '(no subject)',
          createdAt,
          sentAt,
          attempts: linkedMail?.attempts || data.attempts || 0,
          state: linkedMail?.state || data.status || null,
          status,
          error: linkedMail?.error || data.error || null,
          template: data.template || null,
        };
      });

      const merged = [...mailRows, ...queueRows].sort((a, b) => {
        const at = a.createdAt?.getTime() || 0;
        const bt = b.createdAt?.getTime() || 0;
        return bt - at;
      });
      setRows(merged);
    } catch (e: any) {
      setError(e?.message || 'Failed to load email queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pageSize]);

  const stats = useMemo(() => {
    const s = { total: rows.length, queued: 0, sent: 0, failed: 0, avgDelaySec: 0 };
    let delaySum = 0, delayCount = 0;
    for (const r of rows) {
      if (r.status === 'queued') s.queued++;
      else if (r.status === 'sent') s.sent++;
      else if (r.status === 'failed') s.failed++;
      const delta = secondsBetween(r.createdAt, r.sentAt);
      if (delta != null && delta >= 0) { delaySum += delta; delayCount++; }
    }
    s.avgDelaySec = delayCount ? Math.round(delaySum / delayCount) : 0;
    return s;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (q && !(`${r.to} ${r.subject} ${r.template ?? ''} ${r.id}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, statusFilter, sourceFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Send className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Email Queue &amp; Delivery Status</h2>
            <p className="text-sm text-slate-400">Debug delays — shows Firebase <code className="text-slate-300">mail</code> (transactional) and <code className="text-slate-300">emailQueue</code> (marketing) collections.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border-2 border-slate-600 bg-slate-800 text-white rounded-lg px-3 min-h-[40px] text-sm"
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={250}>Last 250</option>
            <option value={500}>Last 500</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, cls: 'text-white' },
          { label: 'Queued', value: stats.queued, cls: 'text-amber-300' },
          { label: 'Sent', value: stats.sent, cls: 'text-emerald-300' },
          { label: 'Failed', value: stats.failed, cls: 'text-red-300' },
          { label: 'Avg delay', value: humanDelay(stats.avgDelaySec), cls: 'text-slate-200' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className={`text-2xl font-semibold mt-1 ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
          {(['all', 'queued', 'sent', 'failed'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize ${
                statusFilter === k ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-1">
          {([
            { k: 'all', label: 'All sources' },
            { k: 'mail', label: 'Send queue (mail)' },
            { k: 'emailQueue', label: 'Marketing history' },
          ] as const).map((s) => (
            <button
              key={s.k}
              onClick={() => setSourceFilter(s.k as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                sourceFilter === s.k ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient, subject, template, id…"
            className="w-full pl-9 pr-3 min-h-[40px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white text-sm placeholder:text-slate-500"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-sm p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-300 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Recipient</th>
                <th className="text-left px-3 py-2">Subject</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-left px-3 py-2">Created</th>
                <th className="text-left px-3 py-2">Sent</th>
                <th className="text-left px-3 py-2">Delay</th>
                <th className="text-left px-3 py-2">Attempts</th>
                <th className="text-left px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  <Filter className="w-5 h-5 inline mr-2" /> No emails match the current filters.
                </td></tr>
              )}
              {filtered.map((r) => {
                const delay = secondsBetween(r.createdAt, r.sentAt);
                return (
                  <tr key={`${r.source}-${r.id}`} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-3 py-2 align-top"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2 align-top text-slate-200 max-w-[220px] truncate" title={r.to}>{r.to || '—'}</td>
                    <td className="px-3 py-2 align-top text-slate-200 max-w-[280px] truncate" title={r.subject}>{r.subject}</td>
                    <td className="px-3 py-2 align-top">
                      <span className={`text-xs px-2 py-0.5 rounded border ${
                        r.source === 'mail' ? 'border-sky-500/30 text-sky-300 bg-sky-500/10'
                                            : 'border-purple-500/30 text-purple-300 bg-purple-500/10'
                      }`}>{r.source}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300 whitespace-nowrap">{fmt(r.createdAt)}</td>
                    <td className="px-3 py-2 align-top text-slate-300 whitespace-nowrap">{fmt(r.sentAt)}</td>
                    <td className="px-3 py-2 align-top text-slate-300 whitespace-nowrap">
                      <span className={delay != null && delay > 300 ? 'text-amber-300' : ''}>{humanDelay(delay)}</span>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">{r.attempts || '—'}</td>
                    <td className="px-3 py-2 align-top text-red-300 max-w-[280px] truncate" title={r.error || ''}>{r.error || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-500 leading-relaxed">
        <p><strong className="text-slate-300">Why marketing feels slow:</strong> the Firebase Trigger Email extension processes the <code>mail</code> collection sequentially, throttled by your SMTP provider's rate limit. Transactional emails (orders) enter <code>mail</code> one at a time, so they send within seconds. A marketing campaign enqueues many rows into <code>mail</code> at once, so later recipients wait behind the whole batch — normal for bulk sends.</p>
        <p className="mt-2">If <code>delivery.state</code> stays <code>PENDING</code> for more than a few minutes with no attempts, the extension worker may be down — check Firebase Extensions logs.</p>
      </div>
    </div>
  );
}
