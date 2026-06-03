import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  listFenaWebhookEvents,
  listFenaOrphanPayments,
  listFenaBankAccountsAdmin,
  reconcileFenaOrphans,
  type FenaWebhookEventRow,
  type FenaOrphanPaymentRow,
  type FenaReconcileResult,
  type FenaBankAccountRow,
} from '@/lib/fena.functions';

export default function FenaTab() {
  const [rows, setRows] = useState<FenaWebhookEventRow[]>([]);
  const [orphans, setOrphans] = useState<FenaOrphanPaymentRow[]>([]);
  const [accounts, setAccounts] = useState<FenaBankAccountRow[]>([]);
  const [env, setEnv] = useState<string>('');
  const [accountsErr, setAccountsErr] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<FenaReconcileResult | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const [events, orphanRows] = await Promise.all([
        listFenaWebhookEvents({ data: { idToken } }),
        listFenaOrphanPayments({ data: { idToken } }),
      ]);
      setRows(events);
      setOrphans(orphanRows);
      // Bank accounts call hits Fena's API live — keep its error isolated
      // so a Fena outage doesn't blank the whole tab.
      try {
        const banks = await listFenaBankAccountsAdmin({ data: { idToken } });
        setAccounts(banks.accounts);
        setEnv(banks.env);
        setAccountsErr('');
      } catch (e: any) {
        setAccountsErr(e?.message || 'Failed to load bank accounts');
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function runReconcile() {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await reconcileFenaOrphans({ data: { idToken } });
      setReconcileResult(res);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || 'Reconcile failed');
    } finally {
      setReconciling(false);
    }
  }


  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Fena Payments
          {env && (
            <span
              className={
                'ml-3 align-middle rounded px-2 py-0.5 text-xs font-semibold ' +
                (env === 'production'
                  ? 'bg-emerald-700 text-emerald-50'
                  : 'bg-amber-700 text-amber-50')
              }
            >
              {env}
            </span>
          )}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Open Banking integration. Webhook URL:{' '}
          <code className="text-emerald-400">https://phlabs.co.uk/api/public/hooks/fena</code>
        </p>
        <p className="text-sm text-slate-400">
          Customer redirect URL:{' '}
          <code className="text-emerald-400">https://phlabs.co.uk/payment/success</code>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Switch sandbox/production by setting the <code>FENA_ENV</code> secret
          (<code>sandbox</code> or <code>production</code>, defaults to production).
        </p>
      </div>

      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-2">Bank accounts</h2>
        {accountsErr && <p className="text-rose-400 text-sm">{accountsErr}</p>}
        {!accountsErr && accounts.length === 0 && (
          <p className="text-slate-400 text-sm">No bank accounts connected in Fena yet.</p>
        )}
        {accounts.length > 0 && (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="rounded border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-slate-200"
              >
                <div className="flex flex-wrap gap-3 mb-1">
                  <span className="text-white font-bold">{a.name || a.bank || a.id}</span>
                  {a.isDefault && (
                    <span className="text-emerald-400">default</span>
                  )}
                  <span className="text-slate-400">{a.status || '—'}</span>
                  <span className="text-slate-400">{a.currency || ''}</span>
                </div>
                <div className="text-slate-500">
                  {a.iban
                    ? <>IBAN: <span className="text-slate-300">{a.iban}</span></>
                    : (a.sortCode || a.accountNumber)
                      ? <>UK: <span className="text-slate-300">{a.sortCode || ''} {a.accountNumber || ''}</span></>
                      : null}
                </div>
                <div className="text-slate-600">id: {a.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>


      <div className="rounded-lg border-2 border-rose-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-1">
          Orphan payments
          <span className="ml-2 text-xs font-normal text-rose-300">
            (Fena confirmed payment, no matching order in our DB)
          </span>
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          These need reconciliation. Use <strong>Reconcile now</strong> to try
          to auto-match each orphan by <code>fenaPaymentId</code> or
          <code>orderNumber</code>; remaining ones must be handled manually
          (refund in Fena, or set <code>fenaPaymentId</code> on the correct
          order doc).
        </p>
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={runReconcile}
            disabled={reconciling}
            className="rounded-lg border-2 border-emerald-600 bg-emerald-700 px-4 min-h-[40px] text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {reconciling ? 'Reconciling…' : 'Reconcile now'}
          </button>
          {reconcileResult && (
            <span className="text-xs text-slate-300">
              scanned {reconcileResult.scanned} · resolved{' '}
              <span className="text-emerald-400">{reconcileResult.resolved}</span> ·
              unresolved{' '}
              <span className="text-amber-400">{reconcileResult.unresolved}</span>
            </span>
          )}
        </div>
        {reconcileResult && reconcileResult.details.length > 0 && (
          <div className="mb-3 rounded border border-slate-700 bg-slate-950 p-2 text-xs font-mono space-y-1 max-h-[200px] overflow-y-auto">
            {reconcileResult.details.map((d, i) => (
              <div key={`${d.fenaPaymentId}-${i}`} className="text-slate-300">
                <span
                  className={
                    d.outcome === 'resolved'
                      ? 'text-emerald-400'
                      : d.outcome === 'no_match'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }
                >
                  {d.outcome}
                </span>{' '}
                <span className="text-amber-300">{d.fenaPaymentId}</span>
                {d.orderId && <> → order {d.orderId} ({d.newStatus})</>}
                {d.message && <span className="text-slate-500"> — {d.message}</span>}
              </div>
            ))}
          </div>
        )}
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
