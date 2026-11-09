/** Admin: temporarily pause the whole checkout (site_config/checkoutPause). */
import { useEffect, useState } from 'react';
import { Loader2, PauseCircle } from 'lucide-react';
import { loadCheckoutPaused, saveCheckoutPaused } from '@/lib/checkout-pause';

export default function CheckoutPauseCard() {
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCheckoutPaused().then(setPaused).finally(() => setLoading(false));
  }, []);

  async function toggle() {
    setSaving(true);
    setError('');
    try {
      await saveCheckoutPaused(!paused);
      setPaused(!paused);
    } catch (err) {
      console.error(err);
      setError('Save failed — check admin permissions.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4 space-y-4">
      <div className="flex items-start gap-3">
        <PauseCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-lg font-bold text-white">Pause checkout</h3>
          <p className="text-sm text-slate-400 mt-1">Stops all new orders. Customers see "Checkout temporarily unavailable".</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-slate-600 bg-slate-800 px-4 min-h-[48px]">
        <span className="text-sm font-medium text-white">
          Status: {loading ? <span className="text-slate-400">loading…</span> : paused ? <span className="text-amber-400">PAUSED — no orders</span> : <span className="text-emerald-400">OPEN</span>}
        </span>
        <button type="button" onClick={toggle} disabled={loading || saving}
          className={`inline-flex items-center gap-2 px-4 py-2 my-2 rounded-lg font-semibold text-white disabled:opacity-50 ${paused ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-600 hover:bg-red-700'}`}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {paused ? 'Re-open checkout' : 'Pause checkout'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
