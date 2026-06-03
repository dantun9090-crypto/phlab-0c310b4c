import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  listFenaWebhookEvents,
  listFenaOrphanPayments,
  listFenaBankAccountsAdmin,
  listFenaTransactionsAdmin,
  reconcileFenaOrphans,
  getFenaIntegrationSettings,
  setFenaIntegrationEnv,
  dryRunFenaConnection,
  type FenaWebhookEventRow,
  type FenaOrphanPaymentRow,
  type FenaReconcileResult,
  type FenaBankAccountRow,
  type FenaDryRunResult,
  type FenaTransactionRow,
} from '@/lib/fena.functions';

type EnvLabel = 'sandbox' | 'production';

export default function FenaTab() {
  const [rows, setRows] = useState<FenaWebhookEventRow[]>([]);
  const [orphans, setOrphans] = useState<FenaOrphanPaymentRow[]>([]);
  const [accounts, setAccounts] = useState<FenaBankAccountRow[]>([]);
  const [transactions, setTransactions] = useState<FenaTransactionRow[]>([]);
  const [txErr, setTxErr] = useState<string>('');
  const [txLoading, setTxLoading] = useState(false);
  const [env, setEnv] = useState<EnvLabel | ''>('');
  const [envSource, setEnvSource] = useState<'settings' | 'secret' | 'default' | ''>('');
  const [hasCreds, setHasCreds] = useState<boolean>(false);
  const [savingEnv, setSavingEnv] = useState(false);
  const [dryRun, setDryRun] = useState<FenaDryRunResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [accountsErr, setAccountsErr] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<FenaReconcileResult | null>(null);

  async function getToken() {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('Not signed in');
    return idToken;
  }

  async function loadAll() {
    setLoading(true);
    try {
      const idToken = await getToken();
      const [events, orphanRows, settings] = await Promise.all([
        listFenaWebhookEvents({ data: { idToken } }),
        listFenaOrphanPayments({ data: { idToken } }),
        getFenaIntegrationSettings({ data: { idToken } }),
      ]);
      setRows(events);
      setOrphans(orphanRows);
      setEnv(settings.env);
      setEnvSource(settings.source);
      setHasCreds(settings.hasCredentials);
      try {
        const banks = await listFenaBankAccountsAdmin({ data: { idToken } });
        setAccounts(banks.accounts);
        setAccountsErr('');
      } catch (e: any) {
        setAccountsErr(e?.message || 'Failed to load bank accounts');
      }
      void loadTransactions();
    } catch (e: any) {
      setErr(e?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  async function loadTransactions() {
    setTxLoading(true);
    try {
      const idToken = await getToken();
      const res = await listFenaTransactionsAdmin({ data: { idToken } });
      setTransactions(res.transactions);
      setTxErr('');
    } catch (e: any) {
      setTxErr(e?.message || 'Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function changeEnv(next: EnvLabel) {
    if (next === env) return;
    if (next === 'production' && !confirm('Switch Fena integration to PRODUCTION? Real bank payments will be processed.')) return;
    setSavingEnv(true);
    try {
      const idToken = await getToken();
      await setFenaIntegrationEnv({ data: { idToken, env: next } });
      await loadAll();
      setDryRun(null);
    } catch (e: any) {
      setErr(e?.message || 'Failed to switch environment');
    } finally {
      setSavingEnv(false);
    }
  }

  async function runDryRun() {
    setDryRunLoading(true);
    setDryRun(null);
    try {
      const idToken = await getToken();
      const res = await dryRunFenaConnection({ data: { idToken } });
      setDryRun(res);
    } catch (e: any) {
      setDryRun({
        ok: false,
        env: (env || 'production') as EnvLabel,
        accountCount: 0,
        error: e?.message || 'Dry-run failed',
        durationMs: 0,
      });
    } finally {
      setDryRunLoading(false);
    }
  }

  async function runReconcile() {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const idToken = await getToken();
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
      </div>

      {/* Environment toggle + dry-run */}
      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-2">Integration environment</h2>
        <p className="text-xs text-slate-400 mb-3">
          Stored in <code className="text-slate-300">settings/fena.env</code>. Overrides the
          <code className="text-slate-300"> FENA_ENV</code> secret. Cached for 30 s on the server.
          <br />
          <span className="text-amber-300">
            Note: Fena uses a single API host for both environments. "Sandbox" mode is selected
            on the hosted payment page by picking a Sandbox bank (e.g. Natwest / RBS sandbox) —
            no real funds move. There is no separate sandbox API endpoint.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(['sandbox', 'production'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => changeEnv(opt)}
              disabled={savingEnv}
              className={
                'rounded-lg border-2 px-4 min-h-[40px] text-sm font-semibold transition ' +
                (env === opt
                  ? opt === 'production'
                    ? 'border-emerald-500 bg-emerald-700 text-white'
                    : 'border-amber-500 bg-amber-700 text-white'
                  : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700') +
                (savingEnv ? ' opacity-50 cursor-wait' : '')
              }
            >
              {opt}
            </button>
          ))}
          <span className="text-xs text-slate-500 ml-2">
            source: <span className="text-slate-300">{envSource || '—'}</span>
            {!hasCreds && (
              <span className="ml-2 text-rose-400">
                · FENA_TERMINAL_ID / FENA_TERMINAL_SECRET missing
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runDryRun}
            disabled={dryRunLoading}
            className="rounded-lg border-2 border-slate-600 bg-slate-800 px-4 min-h-[40px] text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {dryRunLoading ? 'Testing…' : 'Test connection (dry-run)'}
          </button>
          {dryRun && (
            <span className="text-xs font-mono">
              <span className={dryRun.ok ? 'text-emerald-400' : 'text-rose-400'}>
                {dryRun.ok ? 'OK' : 'FAIL'}
              </span>{' '}
              <span className="text-slate-400">
                · {dryRun.env} · {dryRun.accountCount} accounts · {dryRun.durationMs}ms
              </span>
              {dryRun.defaultAccount && (
                <span className="text-slate-300 ml-2">
                  default: {dryRun.defaultAccount.name || dryRun.defaultAccount.id}
                  {dryRun.defaultAccount.status ? ` (${dryRun.defaultAccount.status})` : ''}
                </span>
              )}
              {dryRun.error && (
                <span className="text-rose-300 block mt-1">{dryRun.error}</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Bank accounts (live from Fena) */}
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
                  {a.isDefault && <span className="text-emerald-400">default</span>}
                  <span className="text-slate-400">{a.status || '—'}</span>
                  <span className="text-slate-400">{a.currency || ''}</span>
                </div>
                <div className="text-slate-500">
                  {a.iban ? (
                    <>IBAN: <span className="text-slate-300">{a.iban}</span></>
                  ) : a.sortCode || a.accountNumber ? (
                    <>UK: <span className="text-slate-300">{a.sortCode || ''} {a.accountNumber || ''}</span></>
                  ) : null}
                </div>
                <div className="text-slate-600">id: {a.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transactions (live from Fena) */}
      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">
            Transactions
            <span className="ml-2 text-xs font-normal text-slate-400">
              (live from Fena · last 50)
            </span>
          </h2>
          <button
            type="button"
            onClick={() => void loadTransactions()}
            disabled={txLoading}
            className="rounded-lg border-2 border-slate-600 bg-slate-800 px-3 min-h-[36px] text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {txLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {txErr && <p className="text-rose-400 text-sm">{txErr}</p>}
        {!txErr && !txLoading && transactions.length === 0 && (
          <p className="text-slate-400 text-sm">No transactions yet.</p>
        )}
        {transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-slate-200">
              <thead className="text-slate-400 text-[11px] uppercase">
                <tr className="border-b border-slate-800">
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Amount</th>
                  <th className="text-left py-2 pr-3">Reference</th>
                  <th className="text-left py-2 pr-3">Order</th>
                  <th className="text-left py-2 pr-3">Customer</th>
                  <th className="text-left py-2 pr-3">Created</th>
                  <th className="text-left py-2 pr-3">Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const s = t.status.toLowerCase();
                  const statusColor =
                    s === 'paid'
                      ? 'bg-emerald-700 text-emerald-50'
                      : s === 'cancelled' || s === 'expired' || s === 'failed'
                        ? 'bg-rose-700 text-rose-50'
                        : 'bg-amber-700 text-amber-50';
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-slate-800/60 hover:bg-slate-950/40"
                    >
                      <td className="py-2 pr-3">
                        <span
                          className={
                            'rounded px-2 py-0.5 text-[10px] font-semibold ' + statusColor
                          }
                        >
                          {t.status || '?'}
                        </span>
                        {t.isSandbox && (
                          <span className="ml-1 text-[10px] text-amber-300">sandbox</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-white">
                        {t.currency || 'GBP'} {t.amount || '?'}
                      </td>
                      <td className="py-2 pr-3 text-slate-300">{t.reference || '—'}</td>
                      <td className="py-2 pr-3">
                        {t.orderId ? (
                          <a
                            href={`/payment?orderId=${encodeURIComponent(t.orderId)}`}
                            className="text-emerald-400 hover:underline"
                          >
                            {t.orderNumber || t.orderId}
                          </a>
                        ) : (
                          <span className="text-rose-400">unlinked</span>
                        )}
                        {t.orderStatus && (
                          <span className="ml-1 text-slate-500">({t.orderStatus})</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-400">
                        {t.customerName || t.customerEmail || '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">
                        {t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-3 text-amber-300 truncate max-w-[160px]">
                        {t.id}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* Orphan payments + reconcile */}
      <div className="rounded-lg border-2 border-rose-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-1">
          Orphan payments
          <span className="ml-2 text-xs font-normal text-rose-300">
            (Fena confirmed payment, no matching order in our DB)
          </span>
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Use <strong>Reconcile now</strong> to auto-match each orphan by{' '}
          <code>fenaPaymentId</code> or <code>orderNumber</code>.
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
                {o.reason && <div className="text-slate-500">reason: {o.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhook events with match info */}
      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white mb-3">Recent webhook events</h2>
        <p className="text-xs text-slate-400 mb-3">
          Each event shows whether we matched it to an order, why it failed, or that it
          was a duplicate. Click the row body to see the raw context payload.
        </p>
        {loading && <p className="text-slate-400 text-sm">Loading…</p>}
        {err && <p className="text-rose-400 text-sm">{err}</p>}
        {!loading && !err && rows.length === 0 && (
          <p className="text-slate-400 text-sm">
            No events yet. Once Fena POSTs to the webhook, entries will appear here.
          </p>
        )}
        {!loading && rows.length > 0 && (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {rows.map((r) => {
              const outcomeColors: Record<typeof r.matchOutcome, string> = {
                matched: 'bg-emerald-700 text-emerald-50',
                orphan: 'bg-rose-700 text-rose-50',
                duplicate: 'bg-slate-600 text-slate-50',
                bank_account: 'bg-indigo-700 text-indigo-50',
                error: 'bg-rose-800 text-rose-50',
                info: 'bg-slate-700 text-slate-200',
              };
              const outcomeLabels: Record<typeof r.matchOutcome, string> = {
                matched: 'MATCHED',
                orphan: 'ORPHAN',
                duplicate: 'DUPLICATE',
                bank_account: 'BANK ACCOUNT',
                error: 'ERROR',
                info: 'INFO',
              };
              return (
                <details
                  key={r.id}
                  className="rounded border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-slate-300"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span
                        className={
                          'rounded px-2 py-0.5 text-[10px] font-semibold ' +
                          outcomeColors[r.matchOutcome]
                        }
                      >
                        {outcomeLabels[r.matchOutcome]}
                      </span>
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
                    <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
                      {r.orderId && (
                        <span className="text-emerald-300">
                          order: <span className="text-white">{r.orderId}</span>
                          {r.newStatus && (
                            <span className="text-slate-400"> → {r.newStatus}</span>
                          )}
                        </span>
                      )}
                      {r.fenaPaymentId && (
                        <span className="text-amber-300">
                          paymentId: <span className="text-slate-300">{r.fenaPaymentId}</span>
                        </span>
                      )}
                      {r.fenaStatus && (
                        <span className="text-slate-400">
                          fena: <span className="text-slate-200">{r.fenaStatus}</span>
                        </span>
                      )}
                      {r.reason && (
                        <span className="text-rose-300">reason: {r.reason}</span>
                      )}
                    </div>
                  </summary>
                  {r.ctx && (
                    <pre className="mt-2 text-slate-400 whitespace-pre-wrap break-all">
                      {r.ctx}
                    </pre>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
