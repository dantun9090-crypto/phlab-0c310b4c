import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle, Clock, ExternalLink, Copy } from 'lucide-react';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  listPaymentTriageAdmin,
  getPaymentTriageDetailAdmin,
  type TriageListRow,
  type TriageDetail,
} from '@/lib/payment-triage.functions';

type StatusFilter = 'all' | 'needs_attention' | 'success' | 'pending' | 'failed';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London' });
  } catch {
    return iso;
  }
}

function providerBadge(s: string) {
  const u = s.toUpperCase();
  if (u === 'SUCCESS' || u === 'PAID' || u === 'COMPLETED')
    return 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
  if (u === 'FAILED' || u === 'DECLINED' || u === 'CANCELLED' || u === 'EXPIRED')
    return 'bg-red-900/40 text-red-300 border-red-700';
  if (u === 'PENDING' || u === 'NEW' || u === 'PROCESSING')
    return 'bg-amber-900/40 text-amber-300 border-amber-700';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

function orderBadge(s: string) {
  const u = s.toLowerCase();
  if (u === 'paid' || u === 'shipped' || u === 'delivered')
    return 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
  if (u === 'failed' || u === 'cancelled' || u === 'expired' || u === 'refunded')
    return 'bg-red-900/40 text-red-300 border-red-700';
  if (u.startsWith('pending') || u === 'processing_payment' || u === 'needs_review')
    return 'bg-amber-900/40 text-amber-300 border-amber-700';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

export default function PaymentTriageTab() {
  const [rows, setRows] = useState<TriageListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, TriageDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await listPaymentTriageAdmin({
        data: { idToken, status, search: search.trim() || undefined, limit: 100 },
      });
      setRows(res.rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  async function toggleRow(orderId: string) {
    if (expanded === orderId) {
      setExpanded(null);
      return;
    }
    setExpanded(orderId);
    if (detail[orderId]) return;
    setDetailLoading(orderId);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const d = await getPaymentTriageDetailAdmin({ data: { idToken, orderId } });
      if (d) setDetail((s) => ({ ...s, [orderId]: d }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(null);
    }
  }

  const counts = {
    total: rows.length,
    needs: rows.filter((r) => r.needsAttention).length,
    reconciled: rows.filter((r) => r.reconciledByCron || r.reconciledManually).length,
    noWebhook: rows.filter((r) => r.webhookCount === 0 && r.providerStatus.toUpperCase() !== 'NEW').length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Payment Triage</h1>
          <p className="text-slate-400 text-sm mt-1">
            Every Wallid payment attempt with webhook delivery + reconciliation status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total attempts" value={counts.total} />
        <Stat label="Needs attention" value={counts.needs} tone={counts.needs ? 'warn' : 'ok'} />
        <Stat label="Reconciled by system" value={counts.reconciled} />
        <Stat label="No webhook received" value={counts.noWebhook} tone={counts.noWebhook ? 'warn' : 'ok'} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-1 p-1 rounded-lg bg-slate-800 border border-slate-700">
          {(['all', 'needs_attention', 'success', 'pending', 'failed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded text-sm transition ${
                status === s ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              {s === 'needs_attention' ? 'Needs attention' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search order ID, api_payment_id, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="flex-1 min-w-[240px] border-2 border-slate-600 bg-slate-800 text-white min-h-[40px] rounded-lg px-3 placeholder-slate-500"
        />
      </div>

      {err && (
        <div className="p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm">{err}</div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="w-8"></th>
              <th className="text-left px-3 py-2">Order</th>
              <th className="text-left px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Provider</th>
              <th className="text-left px-3 py-2">Order status</th>
              <th className="text-left px-3 py-2">Webhooks</th>
              <th className="text-left px-3 py-2">Reconciled</th>
              <th className="text-left px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center p-6 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center p-6 text-slate-400">
                  No payment attempts match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <>
                <tr
                  key={r.apiPaymentId}
                  className={`border-t border-slate-800 hover:bg-slate-800/50 cursor-pointer ${
                    r.needsAttention ? 'bg-amber-950/20' : ''
                  }`}
                  onClick={() => toggleRow(r.orderId)}
                >
                  <td className="px-2">
                    {expanded === r.orderId ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-white">{r.orderId}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[280px]">
                      {r.customerEmail ?? '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-200">
                    {r.amount != null ? `£${r.amount.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${providerBadge(r.providerStatus)}`}>
                      {r.providerStatus || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${orderBadge(r.orderStatus)}`}>
                      {r.orderStatus || '—'}
                    </span>
                    {r.needsAttention && (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-400 text-xs">
                        <AlertTriangle className="w-3 h-3" /> mismatch
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    <span className="text-white">{r.webhookCount}</span>
                    {r.webhookOkCount > 0 && (
                      <span className="ml-1 text-emerald-400">·{r.webhookOkCount} ok</span>
                    )}
                    {r.webhookFailedCount > 0 && (
                      <span className="ml-1 text-red-400">·{r.webhookFailedCount} fail</span>
                    )}
                    {r.duplicateCount > 0 && (
                      <span className="ml-1 text-slate-500">·{r.duplicateCount} dup</span>
                    )}
                    {r.webhookCount === 0 && (
                      <span className="ml-1 text-amber-400 text-xs">none</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.reconciledManually && <span className="text-purple-300">manual</span>}
                    {r.reconciledByCron && !r.reconciledManually && (
                      <span className="text-blue-300">cron</span>
                    )}
                    {!r.reconciledManually && !r.reconciledByCron && (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{fmtDate(r.createdAt)}</td>
                </tr>
                {expanded === r.orderId && (
                  <tr key={r.apiPaymentId + '-d'} className="border-t border-slate-800 bg-slate-900/60">
                    <td colSpan={8} className="p-4">
                      {detailLoading === r.orderId ? (
                        <div className="text-slate-400 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                          Loading detail…
                        </div>
                      ) : (
                        <DetailPanel row={r} detail={detail[r.orderId]} />
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
}) {
  const cls =
    tone === 'warn' && value > 0
      ? 'text-amber-300 border-amber-700 bg-amber-950/20'
      : 'text-white border-slate-700 bg-slate-900';
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function copy(v: string) {
  try {
    void navigator.clipboard.writeText(v);
  } catch {
    // ignore
  }
}

function DetailPanel({ row, detail }: { row: TriageListRow; detail: TriageDetail | undefined }) {
  if (!detail) {
    return <div className="text-slate-400 text-sm">No detail available.</div>;
  }
  return (
    <div className="grid md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/40">
          <div className="text-slate-400 text-xs uppercase mb-2">Payment</div>
          <KV k="api_payment_id" v={detail.apiPaymentId} mono copyable />
          <KV k="Provider status" v={detail.providerStatus} />
          <KV k="Order status" v={detail.orderStatus} />
          <KV k="Amount" v={detail.amount != null ? `£${detail.amount.toFixed(2)} ${detail.currency ?? ''}` : '—'} />
          <KV k="Email" v={detail.customerEmail ?? '—'} />
          <KV k="Created" v={fmtDate(detail.createdAt)} />
          <KV k="Updated" v={fmtDate(detail.updatedAt)} />
          <KV k="Paid at" v={fmtDate(detail.paidAt)} />
          {detail.paymentLink && (
            <div className="mt-2">
              <a
                href={detail.paymentLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-400 hover:underline text-xs"
              >
                Open Wallid payment link <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/40">
          <div className="text-slate-400 text-xs uppercase mb-2 flex items-center gap-2">
            Webhook deliveries
            <span className="text-slate-500 normal-case">
              {detail.webhookCount} total · {detail.duplicateCount} duplicate
              {detail.duplicateCount === 1 ? '' : 's'}
            </span>
          </div>
          {detail.webhookEvents.length === 0 ? (
            <div className="text-amber-400 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4" /> No webhook has been received for this payment.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {detail.webhookEvents.map((e) => (
                <div key={e.id} className="rounded border border-slate-800 p-2 bg-slate-900/60">
                  <div className="flex items-center gap-2 text-xs">
                    {e.status === 'processed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : e.status === 'failed' || e.status === 'conflict' ? (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span className="text-white font-medium">{e.status}</span>
                    {e.source && <span className="text-slate-500">· {e.source}</span>}
                    <span className="ml-auto text-slate-500">
                      {fmtDate(e.processedAt ?? e.occurredAt)}
                    </span>
                  </div>
                  {e.errorMessage && (
                    <div className="text-red-300 text-xs mt-1">{e.errorMessage}</div>
                  )}
                  {e.rawJson && (
                    <details className="mt-1">
                      <summary className="text-xs text-slate-400 cursor-pointer">payload</summary>
                      <pre className="text-[10px] text-slate-300 mt-1 overflow-auto max-h-32">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(e.rawJson), null, 2);
                          } catch {
                            return e.rawJson;
                          }
                        })()}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/40">
          <div className="text-slate-400 text-xs uppercase mb-2">Reconciliation timeline</div>
          {detail.timeline.length === 0 ? (
            <div className="text-slate-500 text-xs">No timeline events recorded.</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {detail.timeline.map((t) => (
                <div key={t.id} className="text-xs border-l-2 border-slate-700 pl-3 py-1">
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-slate-500">{fmtDate(t.timestamp)}</span>
                    <span className="text-emerald-300">{t.actor}</span>
                    <span className="text-white">{t.eventType}</span>
                    {(t.statusFrom || t.statusTo) && (
                      <span className="text-slate-400">
                        {t.statusFrom || '∅'} → {t.statusTo || '∅'}
                      </span>
                    )}
                  </div>
                  {t.metadataJson && (
                    <details className="mt-1">
                      <summary className="text-slate-500 cursor-pointer">metadata</summary>
                      <pre className="text-[10px] text-slate-300 mt-1 overflow-auto max-h-24">
                        {(() => {
                          try {
                            return JSON.stringify(JSON.parse(t.metadataJson!), null, 2);
                          } catch {
                            return t.metadataJson;
                          }
                        })()}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {detail.duplicates.length > 0 && (
          <div className="rounded-lg border border-slate-700 p-3 bg-slate-950/40">
            <div className="text-slate-400 text-xs uppercase mb-2">Duplicate webhook attempts</div>
            <div className="space-y-1 text-xs">
              {detail.duplicates.map((d) => (
                <div key={d.id} className="text-slate-300">
                  {fmtDate(d.duplicateReceivedAt)} · <span className="text-slate-500">ip {d.ip ?? '—'}</span> ·
                  event <span className="font-mono">{d.eventId.slice(0, 12)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.orderDocJson && (
          <details className="rounded-lg border border-slate-700 p-3 bg-slate-950/40">
            <summary className="text-slate-400 text-xs uppercase cursor-pointer">Order document</summary>
            <pre className="text-[10px] text-slate-300 mt-2 overflow-auto max-h-64">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(detail.orderDocJson!), null, 2);
                } catch {
                  return detail.orderDocJson;
                }
              })()}
            </pre>
          </details>
        )}
      </div>

      {/* silence unused-import warning */}
      <span className="hidden">{row.apiPaymentId}</span>
    </div>
  );
}

function KV({ k, v, mono, copyable }: { k: string; v: string; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <span className="text-slate-500 w-32 shrink-0">{k}</span>
      <span className={`text-slate-200 ${mono ? 'font-mono' : ''} truncate`}>{v}</span>
      {copyable && (
        <button
          type="button"
          onClick={() => copy(v)}
          className="text-slate-500 hover:text-white"
          title="Copy"
        >
          <Copy className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
