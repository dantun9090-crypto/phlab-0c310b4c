/**
 * Admin-only "Sync Wallid payment status" card.
 *
 * Lists Wallid payments that are still NEW/PENDING/PROCESSING on the
 * supabase side (last 7 days) and lets the admin force a one-off
 * reconciliation per order — same atomic transition path as the 5-min
 * cron, but on demand.
 *
 * Also accepts a free-text order ID for orders that aren't in the
 * stuck-list (e.g. when the webhook arrived but the Firestore write
 * failed for some other reason).
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, RotateCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  listStuckWallidPaymentsAdmin,
  syncWallidPaymentAdmin,
  type StuckWallidRow,
  type WallidSyncResult,
} from '@/lib/wallid-sync.functions';

export default function WallidSyncCard() {
  const [rows, setRows] = useState<StuckWallidRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [last, setLast] = useState<WallidSyncResult | null>(null);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const r = await listStuckWallidPaymentsAdmin({ data: { idToken } });
      setRows(r.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load stuck payments');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sync(orderId: string) {
    setSyncing(orderId);
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      const result = await syncWallidPaymentAdmin({ data: { idToken, orderId } });
      setLast(result);
      if (result.ok && result.transitioned) {
        toast.success(`Order ${orderId}: ${result.message}`);
      } else if (result.ok) {
        toast.message(`Order ${orderId}: ${result.message}`);
      } else {
        toast.error(`Order ${orderId}: ${result.message}`);
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="rounded-lg border-2 border-slate-600 bg-slate-800 p-4 text-white">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <RotateCw className="w-4 h-4 text-emerald-400" />
            Sync Wallid payment status
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Force reconcile orders stuck on pending. Same atomic path as the
            5-minute cron, on demand.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loadingList}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {loadingList ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {/* Manual order ID */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={manualId}
          onChange={(e) => setManualId(e.target.value.trim())}
          placeholder="Order ID (e.g. PHP-XXXXXXXX)"
          className="flex-1 min-h-[44px] rounded-lg border-2 border-slate-600 bg-slate-900 px-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => manualId && void sync(manualId)}
          disabled={!manualId || syncing === manualId}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {syncing === manualId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
          Sync
        </button>
      </div>

      {/* Stuck list */}
      <div className="rounded border border-slate-700 bg-slate-900">
        <div className="border-b border-slate-700 px-3 py-2 text-xs font-medium text-slate-300">
          Stuck Wallid payments (last 7 days) — {rows.length}
        </div>
        {rows.length === 0 ? (
          <div className="px-3 py-4 text-xs text-slate-500">
            {loadingList ? 'Loading…' : 'None — all recent Wallid payments are in a terminal state. ✓'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-700">
            {rows.map((r) => (
              <li key={r.orderId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="font-mono text-white truncate">{r.orderId}</div>
                  <div className="text-slate-500">
                    {r.status} · {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void sync(r.orderId)}
                  disabled={syncing === r.orderId}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-600 px-2 py-1 hover:bg-slate-700 disabled:opacity-50"
                >
                  {syncing === r.orderId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCw className="w-3 h-3" />
                  )}
                  Sync
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Last result */}
      {last && (
        <div className="mt-3 rounded border border-slate-700 bg-slate-900 p-3 text-xs">
          <div className="mb-1 flex items-center gap-1 font-medium">
            {last.ok ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            )}
            Last run: {last.orderId}
          </div>
          <div className="text-slate-400">{last.message}</div>
          {last.remoteStatus && (
            <div className="mt-1 text-slate-500">
              Wallid remote: <span className="text-white">{last.remoteStatus}</span>
              {last.firestoreStatus ? <> · Firestore: <span className="text-white">{last.firestoreStatus}</span></> : null}
              {last.priorStatus ? <> · prior: <span className="text-white">{last.priorStatus}</span></> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
