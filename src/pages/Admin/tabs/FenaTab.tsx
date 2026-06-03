import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  listFenaWebhookEvents,
  listFenaOrphanPayments,
  type FenaWebhookEventRow,
  type FenaOrphanPaymentRow,
} from '@/lib/fena.functions';

export default function FenaTab() {
  const [rows, setRows] = useState<FenaWebhookEventRow[]>([]);
  const [orphans, setOrphans] = useState<FenaOrphanPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('Not signed in');
        const [events, orphanRows] = await Promise.all([
          listFenaWebhookEvents({ data: { idToken } }),
          listFenaOrphanPayments({ data: { idToken } }),
        ]);
        setRows(events);
        setOrphans(orphanRows);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load events');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Fena Payments</h1>
        <p className="text-sm text-slate-400 mt-1">
          Open Banking integration. Webhook URL:{' '}
          <code className="text-emerald-400">https://phlabs.co.uk/api/public/hooks/fena</code>
        </p>
        <p className="text-sm text-slate-400">
          Customer redirect URL:{' '}
          <code className="text-emerald-400">https://phlabs.co.uk/payment/success</code>
        </p>
      </div>

      <div className="rounded-lg border-2 border-rose-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-1">
          Orphan payments
          <span className="ml-2 text-xs font-normal text-rose-300">
            (Fena confirmed payment, no matching order in our DB)
          </span>
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          These need manual reconciliation: refund the customer in Fena, or
          re-link to an existing order by setting <code>fenaPaymentId</code> on
          the correct order doc.
        </p>
        {loading && <p className="text-slate-400 text-sm">Loading…</p>}
        {!loading && orphans.length === 0 && (
          <p className="text-emerald-400 text-sm">No orphan payments — all clear.</p>
        )}
        {!loading && orphans.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {orphans.map((o) => (
              <div
                key={o.id}
                className="rounded border-2 border-rose-800 bg-rose-950/40 p-3 text-xs font-mono text-slate-200"
              >
                <div className="flex flex-wrap gap-3 mb-1">
                  <span className="text-rose-300">{o.fenaStatus || '?'}</span>
                  <span className="text-white">£{o.amount || '?'}</span>
                  <span className="text-slate-400">ref: {o.reference || '—'}</span>
                  <span className="text-slate-500">
                    last seen: {o.lastSeenAt || o.receivedAt || '—'}
                  </span>
                </div>
                <div className="text-slate-400">
                  fenaPaymentId: <span className="text-amber-300">{o.fenaPaymentId}</span>
                </div>
                {o.reason && (
                  <div className="text-slate-500">reason: {o.reason}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Recent webhook events</h2>
        {loading && <p className="text-slate-400 text-sm">Loading…</p>}
        {err && <p className="text-rose-400 text-sm">{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <p className="text-slate-400 text-sm">
            No events yet. Once Fena POSTs to the webhook, entries will appear here.
          </p>
        )}
        {!loading && rows.length > 0 && (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-slate-300"
              >
                <div className="flex gap-3 mb-1">
                  <span
                    className={
                      r.level === 'error'
                        ? 'text-rose-400'
                        : r.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }
                  >
                    {r.level || 'info'}
                  </span>
                  <span className="text-slate-500">{r.createdAt || ''}</span>
                  <span className="text-white">{r.message}</span>
                </div>
                {r.ctx && (
                  <pre className="text-slate-400 whitespace-pre-wrap break-all">
                    {r.ctx}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
