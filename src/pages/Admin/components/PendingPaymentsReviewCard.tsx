/**
 * Pending payments — manual review.
 *
 * Last-resort rescue tool: the money is on the bank statement but the order
 * never settled (missed webhook, manual bank transfer, session Wallid never
 * reported as SUCCESS). "Mark as paid" runs the same atomic transition as the
 * webhook, queues the confirmation email, alerts Telegram (MANUAL_OVERRIDE)
 * and writes an audit-log entry.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  listPendingOrdersForReviewAdmin,
  markOrderPaidManuallyAdmin,
  type PendingOrderRow,
} from '@/lib/manual-paid.functions';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London' });
  } catch {
    return iso;
  }
}

export default function PendingPaymentsReviewCard() {
  const [rows, setRows] = useState<PendingOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await listPendingOrdersForReviewAdmin({ data: { idToken, days: 7 } });
      setRows(res.rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid(orderId: string) {
    const note = (notes[orderId] ?? '').trim();
    if (note.length < 3) {
      setErr(`Add a note for ${orderId} (e.g. "confirmed via bank statement").`);
      return;
    }
    if (!window.confirm(`Mark ${orderId} as PAID? The customer receives a confirmation email.`)) return;
    setBusy(orderId);
    setErr('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await markOrderPaidManuallyAdmin({ data: { idToken, orderId, note } });
      setDone((s) => ({ ...s, [orderId]: res.message }));
      if (res.ok) setRows((r) => r.filter((x) => x.orderId !== orderId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">Pending payments — manual review</h2>
          <p className="mt-1 text-sm text-slate-400">
            Unsettled orders from the last 7 days. Use only when the transfer is visible on the bank
            statement — this overrides the payment status by hand.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {err && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {Object.entries(done).map(([oid, msg]) => (
        <div
          key={oid}
          className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-200"
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <span className="font-mono">{oid}</span>: {msg}
          </span>
        </div>
      ))}

      {loading && rows.length === 0 && (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="mt-6 text-sm text-slate-400">No unsettled orders in the last 7 days.</p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.orderId} className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-emerald-300">{r.orderNumber ?? r.orderId}</span>
                <span className="rounded border border-amber-700 bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">
                  {r.status || 'unknown'}
                </span>
                <span className="text-white">
                  {r.amount != null
                    ? `${r.currency === 'GBP' ? '£' : `${r.currency} `}${(r.amount > 1000 ? r.amount / 100 : r.amount).toFixed(2)}`
                    : '—'}
                </span>
                <span className="text-slate-300">{r.customerEmail ?? '—'}</span>
                <span className="text-slate-400">{fmt(r.createdAt)}</span>
                {r.paymentProvider && (
                  <span className="text-xs text-slate-500">via {r.paymentProvider}</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={notes[r.orderId] ?? ''}
                  onChange={(e) => setNotes((s) => ({ ...s, [r.orderId]: e.target.value }))}
                  placeholder="Note, e.g. confirmed via bank statement"
                  aria-label={`Note for ${r.orderId}`}
                  className="min-h-[48px] flex-1 min-w-[220px] rounded-lg border-2 border-slate-600 bg-slate-800 px-3 text-white placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => void markPaid(r.orderId)}
                  disabled={busy === r.orderId}
                  className="min-h-[48px] inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === r.orderId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Mark as paid
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
