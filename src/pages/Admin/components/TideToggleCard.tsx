/**
 * Admin: on/off switch for the "Pay with Tide" checkout method
 * (hosted Tide payment link — QR code / Open Banking).
 *
 * Persists to Firestore site_config/tide { enabled } and is read live by the
 * checkout page, so turning it off hides the Tide tile immediately.
 *
 * Wallid Pay by Bank and Manual Bank Transfer are never affected.
 */
import { useEffect, useState } from 'react';
import { QrCode, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { loadTideEnabled, saveTideEnabled } from '@/lib/tide-toggle';

export default function TideToggleCard() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    loadTideEnabled()
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
      await saveTideEnabled(next);
      setEnabled(next);
      setToast({
        kind: 'ok',
        msg: next ? 'Pay with Tide is now ON at checkout' : 'Pay with Tide is now OFF at checkout',
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
        <QrCode className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white">Pay with Tide (QR / Open Banking)</h3>
          <p className="text-sm text-slate-400 mt-1">
            Shows the hosted Tide payment link at checkout with a scannable QR code. Customers pay
            from their banking app; payments are reconciled manually in Tide. Turning this off hides
            the tile at checkout. Pay by Bank and Bank Transfer are not affected.
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
        <p>
          Hosted payment link:{' '}
          <code className="text-slate-300">
            https://pay.tide.co/pay/f054694d-bfda-4f38-9e42-62d4177525cb
          </code>
          . Tide does not send webhooks, so mark these orders as paid manually in Orders once the
          funds land.
        </p>
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
