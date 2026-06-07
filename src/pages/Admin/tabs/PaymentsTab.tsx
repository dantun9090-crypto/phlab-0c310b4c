import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw, Star, ArrowDown,
  Eye, EyeOff, ExternalLink,
} from 'lucide-react';
import {
  listPaymentGateways,
  togglePaymentGateway,
  setPaymentGatewayPriority,
  setPaymentGatewaySandbox,
  testPaymentGateway,
} from '@/lib/payment-gateways.functions';
import type { PaymentGatewayConfig } from '@/lib/payments/types';

type TestResult = { ok: boolean; durationMs: number; message: string; at: number };

export default function PaymentsTab() {
  const [rows, setRows] = useState<PaymentGatewayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [editing, setEditing] = useState<PaymentGatewayConfig | null>(null);

  async function getToken() {
    const t = await auth.currentUser?.getIdToken();
    if (!t) throw new Error('Not signed in');
    return t;
  }

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const idToken = await getToken();
      const result = await listPaymentGateways({ data: { idToken } });
      setRows(result);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load gateways');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleEnabled(row: PaymentGatewayConfig, next: boolean) {
    setBusy(`${row.id}:toggle`);
    try {
      const idToken = await getToken();
      const r = await togglePaymentGateway({
        data: { idToken, gateway: row.id, enabled: next },
      });
      setRows(r.gateways);
    } catch (e: any) {
      setErr(e?.message || 'Toggle failed');
    } finally {
      setBusy('');
    }
  }

  async function changePriority(row: PaymentGatewayConfig, priority: 'primary' | 'backup' | 'disabled') {
    setBusy(`${row.id}:priority`);
    try {
      const idToken = await getToken();
      const r = await setPaymentGatewayPriority({
        data: { idToken, gateway: row.id, priority },
      });
      setRows(r.gateways);
    } catch (e: any) {
      setErr(e?.message || 'Priority change failed');
    } finally {
      setBusy('');
    }
  }

  async function changeSandbox(row: PaymentGatewayConfig, sandbox: boolean) {
    setBusy(`${row.id}:sandbox`);
    try {
      const idToken = await getToken();
      const r = await setPaymentGatewaySandbox({
        data: { idToken, gateway: row.id, sandbox },
      });
      setRows(r.gateways);
    } catch (e: any) {
      setErr(e?.message || 'Sandbox toggle failed');
    } finally {
      setBusy('');
    }
  }

  async function runTest(row: PaymentGatewayConfig) {
    setBusy(`${row.id}:test`);
    try {
      const idToken = await getToken();
      const r = await testPaymentGateway({ data: { idToken, gateway: row.id } });
      setTests((prev) => ({ ...prev, [row.id]: { ...r, at: Date.now() } }));
      await load();
    } catch (e: any) {
      setTests((prev) => ({
        ...prev,
        [row.id]: { ok: false, durationMs: 0, message: e?.message || 'Failed', at: Date.now() },
      }));
    } finally {
      setBusy('');
    }
  }

  const primaryRow = rows.find((r) => r.priority === 'primary' && r.enabled);
  const backupRows = rows.filter((r) => r.priority === 'backup' && r.enabled);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Payment Gateways</h1>
        <p className="text-sm text-slate-400 mt-1">
          Toggle, prioritise and test the Open Banking providers used at checkout.
          Customers always see the <strong className="text-emerald-400">Primary</strong> gateway first;
          checkout will not silently switch to a <strong className="text-blue-400">Backup</strong> provider if the primary fails.
          If no primary is available, the manual bank transfer fallback is shown.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border-2 border-red-700 bg-red-950/40 p-3 text-red-200 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{err}</div>
          <button onClick={() => setErr('')} className="text-red-300 hover:text-white text-xs">dismiss</button>
        </div>
      )}

      {/* Checkout preview banner */}
      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Customer will see at checkout</p>
        {primaryRow ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-emerald-700 text-emerald-50 px-2 py-0.5 text-xs font-semibold">
              {primaryRow.name} {primaryRow.sandbox && '(sandbox)'}
            </span>
            <span className="text-slate-400 text-xs">primary</span>
            {backupRows.map((b) => (
              <span key={b.id} className="rounded bg-slate-700 text-slate-200 px-2 py-0.5 text-xs">
                {b.name} (backup)
              </span>
            ))}
            <span className="text-slate-500 text-xs">+ Manual bank transfer fallback if customer selects it</span>
          </div>
        ) : (
          <p className="text-amber-300 text-sm">
            ⚠️ No primary gateway enabled — only manual bank transfer is shown to customers.
          </p>
        )}
      </div>

      {/* Gateway table */}
      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-slate-700">
          <h2 className="text-base font-semibold text-white">Configured gateways</h2>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border-2 border-slate-600 bg-slate-800 px-3 min-h-[36px] text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-200">
            <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
              <tr className="border-b border-slate-800">
                <th className="text-left py-2 px-3">Gateway</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Priority</th>
                <th className="text-left py-2 px-3">API key</th>
                <th className="text-left py-2 px-3">Mode</th>
                <th className="text-left py-2 px-3">Last test</th>
                <th className="text-left py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="py-6 text-center text-slate-400">Loading…</td></tr>
              )}
              {!loading && rows.map((row) => {
                const test = tests[row.id];
                const dotColor =
                  row.status === 'pending' ? 'bg-amber-400'
                  : !row.enabled ? 'bg-slate-500'
                  : row.testStatus === 'fail' ? 'bg-red-500'
                  : 'bg-emerald-400';
                const priorityDisabled = row.status === 'pending' || !row.credentialsConfigured;
                return (
                  <tr key={row.id} className="border-b border-slate-800/60 hover:bg-slate-950/40 align-middle">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className={'w-2 h-2 rounded-full ' + dotColor} />
                        <span className="font-semibold text-white">{row.name}</span>
                        {row.priority === 'primary' && row.enabled && (
                          <Star className="w-3.5 h-3.5 text-amber-400" aria-label="primary" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">{row.id}</p>
                    </td>

                    <td className="py-3 px-3">
                      {row.status === 'pending' ? (
                        <span className="rounded bg-amber-800 text-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase">
                          Coming Soon
                        </span>
                      ) : (
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            disabled={!row.credentialsConfigured || busy === `${row.id}:toggle`}
                            onChange={(e) => toggleEnabled(row, e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-xs font-semibold text-slate-200">
                            {row.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </label>
                      )}
                      {!row.credentialsConfigured && row.status !== 'pending' && (
                        <p className="text-[10px] text-rose-400 mt-1">missing secrets</p>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <select
                        value={row.priority}
                        disabled={priorityDisabled || busy === `${row.id}:priority`}
                        onChange={(e) => changePriority(row, e.target.value as any)}
                        className="rounded-lg border-2 border-slate-600 bg-slate-800 text-white text-xs px-2 min-h-[36px] disabled:opacity-50"
                      >
                        <option value="primary">★ Primary</option>
                        <option value="backup">Backup</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-mono text-xs text-slate-300">
                        {row.apiKeyMasked ?? <span className="text-rose-400">—</span>}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <button
                        onClick={() => changeSandbox(row, !row.sandbox)}
                        disabled={!row.credentialsConfigured || busy === `${row.id}:sandbox`}
                        className={
                          'rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ' +
                          (row.sandbox
                            ? 'bg-amber-700 text-amber-50 hover:bg-amber-600'
                            : 'bg-emerald-700 text-emerald-50 hover:bg-emerald-600')
                        }
                      >
                        {row.sandbox ? 'Sandbox' : 'Live'}
                      </button>
                    </td>

                    <td className="py-3 px-3 text-xs">
                      {test ? (
                        <span className={test.ok ? 'text-emerald-400' : 'text-rose-400'}>
                          {test.ok ? <CheckCircle2 className="w-3.5 h-3.5 inline" /> : <XCircle className="w-3.5 h-3.5 inline" />}{' '}
                          {test.ok ? `OK (${test.durationMs}ms)` : 'Failed'}
                        </span>
                      ) : row.lastTestedAt ? (
                        <span className={row.testStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
                          {row.testStatus === 'ok' ? '✓' : '✗'} {new Date(row.lastTestedAt).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-500">never</span>
                      )}
                      {test && !test.ok && (
                        <p className="text-rose-300 text-[10px] mt-1 max-w-[220px]">{test.message}</p>
                      )}
                      {!test && row.errorMessage && (
                        <p className="text-rose-300 text-[10px] mt-1 max-w-[220px]">{row.errorMessage}</p>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => runTest(row)}
                          disabled={!row.credentialsConfigured || busy === `${row.id}:test`}
                          className="rounded-lg border-2 border-slate-600 bg-slate-800 px-2 min-h-[32px] text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {busy === `${row.id}:test` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                        </button>
                        <button
                          onClick={() => setEditing(row)}
                          className="rounded-lg border-2 border-slate-600 bg-slate-800 px-2 min-h-[32px] text-[11px] font-semibold text-white hover:bg-slate-700"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Priority hint */}
      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4 text-xs text-slate-400 leading-relaxed">
        <p className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
          <ArrowDown className="w-3.5 h-3.5" /> Fallback order
        </p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Primary gateway is tried first when the customer clicks "Pay by Bank".</li>
          <li>If it errors (rejected credentials, downtime, network), the first enabled Backup is tried automatically.</li>
          <li>If all gateways fail, the customer sees manual bank transfer instructions.</li>
        </ol>
      </div>

      {/* Details modal */}
      {editing && (
        <DetailsModal row={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function DetailsModal({ row, onClose }: { row: PaymentGatewayConfig; onClose: () => void }) {
  const [showKey, setShowKey] = useState(false);
  const envVars: Record<string, string[]> = {
    fena: ['FENA_TERMINAL_ID', 'FENA_TERMINAL_SECRET', 'FENA_ENV'],
    truelayer: ['TRUELAYER_CLIENT_ID', 'TRUELAYER_CLIENT_SECRET', 'TRUELAYER_MERCHANT_ACCOUNT_ID', 'TRUELAYER_ENV'],
    yapily: ['YAPILY_APPLICATION_ID', 'YAPILY_APPLICATION_SECRET'],
  };
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{row.name}</h3>
            <p className="text-xs text-slate-400 font-mono">{row.id}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">×</button>
        </div>

        <div className="space-y-3 text-sm">
          <Field label="Status">
            <span className={
              row.status === 'pending' ? 'text-amber-400'
              : row.enabled ? 'text-emerald-400' : 'text-slate-400'
            }>
              {row.status === 'pending' ? 'Pending (awaiting credentials)' : row.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </Field>
          <Field label="Priority">
            <span className="capitalize">{row.priority}</span>
          </Field>
          <Field label="Mode">
            <span className={row.sandbox ? 'text-amber-400' : 'text-emerald-400'}>
              {row.sandbox ? 'Sandbox' : 'Live'}
            </span>
          </Field>
          <Field label="API key">
            <span className="font-mono text-xs flex items-center gap-2">
              {showKey ? row.apiKeyMasked ?? '—' : '••••••••'}
              <button
                onClick={() => setShowKey((v) => !v)}
                className="text-slate-400 hover:text-white"
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </span>
          </Field>
          <Field label="Webhook URL">
            <code className="text-emerald-400 text-xs break-all">{row.webhookUrl}</code>
          </Field>
          {row.id === 'truelayer' && (
            <Field label="Return URI">
              <code className="text-emerald-400 text-xs break-all">https://phlabs.co.uk/payment/success</code>
            </Field>
          )}
          <Field label="Last tested">
            {row.lastTestedAt ? (
              <span className={row.testStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
                {row.testStatus === 'ok' ? '✓' : '✗'} {new Date(row.lastTestedAt).toLocaleString()}
              </span>
            ) : <span className="text-slate-500">never</span>}
          </Field>
          {row.errorMessage && (
            <Field label="Last error">
              <span className="text-rose-300 text-xs">{row.errorMessage}</span>
            </Field>
          )}
        </div>

        <div className="border-t border-slate-700 pt-3 text-xs text-slate-400">
          <p className="text-slate-300 font-semibold mb-1">Credentials are stored server-side</p>
          <p className="mb-2">
            For security, API keys for this gateway are kept as encrypted Lovable secrets — they
            never travel to the browser. To rotate them, update these secrets in Project Settings:
          </p>
          <ul className="font-mono text-[11px] text-slate-300 space-y-0.5">
            {(envVars[row.id] || []).map((k) => (
              <li key={k}>• {k}</li>
            ))}
          </ul>
        </div>

        <a
          href={
            row.id === 'fena' ? 'https://merchant.fena.co'
            : row.id === 'truelayer' ? 'https://console.truelayer.com'
            : 'https://dashboard.yapily.com'
          }
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-xs font-semibold"
        >
          Open {row.name} dashboard <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-400 text-xs uppercase tracking-wider">{label}</span>
      <span className="text-slate-200 text-right">{children}</span>
    </div>
  );
}
