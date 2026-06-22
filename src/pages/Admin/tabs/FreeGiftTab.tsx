import { useEffect, useState } from 'react';
import { Gift, Save, Loader2, CheckCircle2 } from 'lucide-react';
import {
  loadFreeGiftConfig,
  saveFreeGiftConfig,
  FREE_GIFT_DEFAULTS,
  type FreeGiftConfig,
} from '@/lib/free-gift-config';

export default function FreeGiftTab() {
  const [cfg, setCfg] = useState<FreeGiftConfig>(FREE_GIFT_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadFreeGiftConfig()
      .then((c) => setCfg(c))
      .finally(() => setLoading(false));
  }, []);

  const onSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      await saveFreeGiftConfig({
        ...cfg,
        title: cfg.title.trim() || FREE_GIFT_DEFAULTS.title,
        description: cfg.description.trim(),
        minSubtotal: Math.max(0, Number(cfg.minSubtotal) || 0),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setErr(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-300 p-6">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 p-1">
      <header className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <Gift className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Free Gift Promo</h1>
          <p className="text-sm text-slate-400">Toggle the free gift shown at checkout.</p>
        </div>
      </header>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={async (e) => {
              const next = { ...cfg, enabled: e.target.checked };
              setCfg(next);
              setSaving(true);
              setErr(null);
              try {
                await saveFreeGiftConfig(next);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              } catch (err: any) {
                setErr(err?.message || 'Could not save toggle');
                setCfg({ ...next, enabled: !e.target.checked });
              } finally {
                setSaving(false);
              }
            }}
            className="mt-1 w-5 h-5 accent-emerald-500"
          />
          <span>
            <span className="block text-white font-semibold">Enable free gift at checkout</span>
            <span className="block text-xs text-slate-400">
              Auto-saves when toggled. Currently: <strong className={cfg.enabled ? 'text-emerald-400' : 'text-slate-400'}>{cfg.enabled ? 'ON' : 'OFF'}</strong>
            </span>
          </span>
        </label>

        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">Gift name</label>
          <input
            type="text"
            value={cfg.title}
            onChange={(e) => setCfg({ ...cfg, title: e.target.value.slice(0, 80) })}
            placeholder="3ml Vial Case"
            className="w-full min-h-[48px] px-4 rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">Short description (shown to customers)</label>
          <textarea
            value={cfg.description}
            onChange={(e) => setCfg({ ...cfg, description: e.target.value.slice(0, 200) })}
            placeholder="Free protective case with every order — limited promo"
            rows={2}
            className="w-full min-h-[64px] px-4 py-3 rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">
            Minimum order subtotal (£) <span className="text-slate-500 font-normal">— 0 = always</span>
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={cfg.minSubtotal}
            onChange={(e) => setCfg({ ...cfg, minSubtotal: Number(e.target.value) })}
            className="w-40 min-h-[48px] px-4 rounded-lg border-2 border-slate-600 bg-slate-800 text-white focus:border-emerald-500 outline-none"
          />
        </div>

        {err && <p className="text-red-400 text-sm">{err}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
          <span
            className={`ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              cfg.enabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {cfg.enabled ? 'Live at checkout' : 'Off'}
          </span>
        </div>
      </div>
    </div>
  );
}
