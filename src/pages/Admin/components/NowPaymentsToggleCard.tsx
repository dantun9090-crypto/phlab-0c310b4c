/**
 * Admin: on/off switch for the NOWPayments crypto checkout method.
 *
 * Persists to Firestore site_config/nowpayments { enabled } — read live by the
 * checkout page AND enforced server-side in /api/payments/nowpayments-create,
 * so turning it off fully closes the method, not just the UI tile.
 *
 * Wallid Pay by Bank is never affected by this switch.
 */
import { useEffect, useState } from 'react';
import { Bitcoin, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { loadNowPaymentsEnabled, saveNowPaymentsEnabled } from '@/lib/nowpayments-toggle';

export default function NowPaymentsToggleCard() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    loadNowPaymentsEnabled()
      .then(setEnabled)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleToggle(next: boolean) {
    setSaving(true);
    try {
      await saveNowPaymentsEnabled(next);
      setEnabled(next);
      setToast({
        kind: 'ok',
        msg: next ? 'Crypto (NOWPayments) is now ON at checkout' : 'Crypto (NOWPayments) is now OFF at checkout',
      });
    } catch (err) {
      console.error(err);
      setToast({ kind: 'err', msg: 'Save failed — check admin permissions.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Bitcoin className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white">Crypto — NOWPayments</h3>
          <p className="text-sm text-slate-400 mt-1">
            Hosted crypto invoice (BTC, ETH, USDT and 300+ assets). Prices are quoted in GBP and
            settled to the payout wallet configured in NOWPayments (USDT TRC20). Turning this off
            hides the option and blocks the payment endpoint. Pay by Bank is not affected.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-slate-600 bg-slate-800 px-4 min-h-[48px]">
        <span className="text-sm font-medium text-white">
          Status:{' '}
          {loading ? (
            <span className="text-slate-400">loading…</span>
          ) : enabled ? (
            <span className="text-emerald-400">ON — visible at checkout</span>
          ) : (
            <span className="text-amber-400">OFF — hidden at checkout</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => handleToggle(!enabled)}
          disabled={loading || saving}
          aria-pressed={enabled}
          className={`inline-flex items-center gap-2 px-4 py-2 my-2 rounded-lg font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${
            enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-500 hover:bg-emerald-600'
          }`}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : enabled ? (
            <X className="w-4 h-4" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {saving ? 'Saving…' : enabled ? 'Turn OFF' : 'Turn ON'}
        </button>
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-400">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p>
            IPN callback URL to paste in NOWPayments → Settings → Payments:{' '}
            <code className="text-slate-300">https://phlabs.co.uk/api/public/nowpayments-webhook</code>
          </p>
          <p>
            Required secrets: <code className="text-slate-300">NOWPAYMENTS_API_KEY</code>,{' '}
            <code className="text-slate-300">NOWPAYMENTS_IPN_SECRET</code> (optional{' '}
            <code className="text-slate-300">NOWPAYMENTS_PAYOUT_CURRENCY=usdttrc20</code>).
            Underpaid (partially_paid) invoices are flagged for review and never auto-complete.
          </p>
          <p>
            Invoices open on <strong className="text-slate-200">USDT (TRC20)</strong> so shoppers
            never land on a coin that shows &quot;currently unavailable&quot;. Override with{' '}
            <code className="text-slate-300">NOWPAYMENTS_PAY_CURRENCY</code>. Orders under the
            coin&apos;s network minimum (~£8) still show the full coin picker.
          </p>

        </div>
      </div>

      {toast && (
        <div
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm ${
            toast.kind === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-200'
              : 'bg-red-500/10 border-red-500 text-red-200'
          }`}
        >
          {toast.kind === 'ok' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
