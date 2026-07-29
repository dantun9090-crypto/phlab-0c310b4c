/**
 * "Match bank transfer → order" card.
 *
 * The merchant bank statement shows `WALLID <ref>` where <ref> is the
 * first ~10 hex chars of the Wallid api_payment_id — not the order
 * number. This card lists recent Wallid payments with that exact ref so
 * the admin can paste the ref from the bank app and instantly see which
 * PHP- order (and customer) the money belongs to.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  listWallidPaymentsForReconcileAdmin,
  type WallidReconcileRow,
} from '@/lib/wallid-sync.functions';

export default function WallidReconcileCard() {
  const [rows, setRows] = useState<WallidReconcileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const r = await listWallidPaymentsForReconcileAdmin({ data: { idToken, days: 45 } });
      setRows(r.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load Wallid payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.bankRef,
        r.apiPaymentId?.replace(/-/g, ''),
        r.orderNumber,
        r.orderId,
        r.customerEmail,
        r.customerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      return hay.includes(q);
    });
  }, [rows, query]);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Match bank transfer → order</h3>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Your bank statement shows <span className="font-mono text-slate-300">WALLID &lt;ref&gt;</span>.
        Paste that ref below to see the matching order. Refs cover the last 45 days.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bank ref (e.g. fb534dc0e4) or order number / email"
          className="w-full min-h-[44px] rounded-lg border-2 border-slate-600 bg-slate-900 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      <div className="rounded border border-slate-700 bg-slate-900 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-left text-slate-400">
              <th className="px-3 py-2 font-medium">Bank ref</th>
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-slate-500">
                  {loading ? 'Loading…' : query ? 'No payment matches that ref.' : 'No Wallid payments in the last 45 days.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={`${r.orderId}-${r.apiPaymentId ?? ''}`} className="text-slate-300">
                  <td className="px-3 py-2 font-mono text-emerald-300">{r.bankRef ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-white">{r.orderNumber ?? r.orderId}</td>
                  <td className="px-3 py-2">
                    {r.amountGbp != null ? `£${r.amountGbp.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-[180px] truncate">{r.customerName ?? '—'}</div>
                    <div className="max-w-[180px] truncate text-slate-500">{r.customerEmail ?? ''}</div>
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
