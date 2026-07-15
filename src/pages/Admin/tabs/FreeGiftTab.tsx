import { useEffect, useState } from 'react';
import { Gift, Save, Loader2, CheckCircle2, Plus, Trash2, GripVertical } from 'lucide-react';
import {
  loadFreeGiftConfig,
  saveFreeGiftConfig,
  FREE_GIFT_DEFAULTS,
  type FreeGiftConfig,
  type FreeGiftItem,
} from '@/lib/free-gift-config';

function newGift(): FreeGiftItem {
  return {
    id: `gift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    description: '',
    minSubtotal: 0,
    enabled: true,
  };
}

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

  const persist = async (next: FreeGiftConfig) => {
    setSaving(true);
    setErr(null);
    try {
      await saveFreeGiftConfig(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setErr(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => persist({
    ...cfg,
    title: cfg.title.trim() || FREE_GIFT_DEFAULTS.title,
    description: cfg.description.trim(),
    minSubtotal: Math.max(0, Number(cfg.minSubtotal) || 0),
    items: cfg.items.map((it) => ({
      ...it,
      title: it.title.trim(),
      description: it.description.trim(),
      minSubtotal: Math.max(0, Number(it.minSubtotal) || 0),
    })),
  });

  const addItem = () => setCfg({ ...cfg, items: [...cfg.items, newGift()] });
  const updateItem = (id: string, patch: Partial<FreeGiftItem>) =>
    setCfg({ ...cfg, items: cfg.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const removeItem = (id: string) =>
    setCfg({ ...cfg, items: cfg.items.filter((it) => it.id !== id) });
  const moveItem = (idx: number, dir: -1 | 1) => {
    const next = [...cfg.items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setCfg({ ...cfg, items: next });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-300 p-6">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 p-1">
      <header className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <Gift className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Free Gift Promo</h1>
          <p className="text-sm text-slate-400">
            Offer a free gift at checkout. Add multiple options and the customer picks one.
          </p>
        </div>
      </header>

      {/* Master enable + legacy single-gift fallback */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={async (e) => {
              const next = { ...cfg, enabled: e.target.checked };
              setCfg(next);
              await persist(next);
            }}
            className="mt-1 w-5 h-5 accent-emerald-500"
          />
          <span>
            <span className="block text-white font-semibold">Enable free gift at checkout</span>
            <span className="block text-xs text-slate-400">
              Auto-saves when toggled. Currently:{' '}
              <strong className={cfg.enabled ? 'text-emerald-400' : 'text-slate-400'}>
                {cfg.enabled ? 'ON' : 'OFF'}
              </strong>
            </span>
          </span>
        </label>

        <div className="pt-2 border-t border-slate-800">
          <p className="text-xs text-slate-400 mb-3">
            Default gift — used when no <em>extra options</em> are configured below.
          </p>
          <div className="grid gap-4">
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
              <label className="block text-sm font-semibold text-white mb-1.5">
                Short description (shown to customers)
              </label>
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
                Minimum order subtotal (£){' '}
                <span className="text-slate-500 font-normal">— 0 = always</span>
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
          </div>
        </div>
      </div>

      {/* Extra gift options — customer chooses one */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div>
            <h2 className="text-white font-semibold">Extra gift options</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Add multiple gifts (pen, case, sticker…). The customer picks one at checkout.
              When empty, the default gift above is used.
            </p>
          </div>
          <button
            onClick={addItem}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Add gift
          </button>
        </div>

        {cfg.items.length === 0 ? (
          <p className="text-slate-500 text-sm italic border border-dashed border-slate-700 rounded-lg p-4 text-center">
            No extra options yet. Add one to let customers choose.
          </p>
        ) : (
          <ul className="space-y-3">
            {cfg.items.map((it, idx) => (
              <li
                key={it.id}
                className="rounded-lg border-2 border-slate-700 bg-slate-800/60 p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="text-slate-500 hover:text-white disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={it.enabled}
                      onChange={(e) => updateItem(it.id, { enabled: e.target.checked })}
                      className="accent-emerald-500"
                    />
                    Active
                  </label>
                  <span className="text-slate-500 text-xs">#{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="ml-auto inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white mb-1">Gift name</label>
                  <input
                    type="text"
                    value={it.title}
                    onChange={(e) => updateItem(it.id, { title: e.target.value.slice(0, 80) })}
                    placeholder="e.g. Research Pen"
                    className="w-full min-h-[48px] px-4 rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white mb-1">
                    Short description
                  </label>
                  <textarea
                    value={it.description}
                    onChange={(e) => updateItem(it.id, { description: e.target.value.slice(0, 240) })}
                    placeholder="e.g. Free branded PH Labs pen with orders over £50"
                    rows={2}
                    className="w-full min-h-[64px] px-4 py-3 rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white mb-1">
                    Minimum subtotal (£){' '}
                    <span className="text-slate-500 font-normal">— 0 = always</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.minSubtotal}
                    onChange={(e) =>
                      updateItem(it.id, { minSubtotal: Number(e.target.value) })
                    }
                    className="w-40 min-h-[48px] px-4 rounded-lg border-2 border-slate-600 bg-slate-800 text-white focus:border-emerald-500 outline-none"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save all changes
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
          <span
            className={`w-1.5 h-1.5 rounded-full ${cfg.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`}
          />
          {cfg.enabled ? 'Live at checkout' : 'Off'}
        </span>
      </div>
    </div>
  );
}
