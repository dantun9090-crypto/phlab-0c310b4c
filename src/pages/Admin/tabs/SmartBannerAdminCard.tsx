import { useEffect, useState } from 'react';
import { Loader2, Save, RefreshCw, CheckCircle2, AlertCircle, Sparkles, X } from 'lucide-react';
import SmartBanner from '@/components/SmartBanner';
import {
  bannerConfig as smartDefaults,
  BANNER_POSITION_OPTIONS,
  BANNER_SIZE_OPTIONS,
  FONT_SIZE_OPTIONS,
  type BannerConfig as SmartBannerConfig,
} from '@/config/banner.config';
import { loadSmartBannerConfig, saveSmartBannerConfig } from '@/lib/smart-banner-config';
import { triggerContentCdnInvalidation, bumpMarketingVersion } from '@/lib/firebase';

/**
 * Admin controls for the text-based <SmartBanner /> — a desktop-only
 * floating popup shown on every public page. Fully independent from the
 * image-based Promo Banner above.
 */
export default function SmartBannerAdminCard() {
  const [cfg, setCfg] = useState<SmartBannerConfig>(smartDefaults);
  const [original, setOriginal] = useState<SmartBannerConfig>(smartDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const c = await loadSmartBannerConfig();
      setCfg(c);
      setOriginal(c);
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to load: ' + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = <K extends keyof SmartBannerConfig>(key: K, val: SmartBannerConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: val }));

  const isDirty = JSON.stringify(cfg) !== JSON.stringify(original);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSmartBannerConfig(cfg);
      try { triggerContentCdnInvalidation(['/']); } catch { /* best-effort */ }
      try { bumpMarketingVersion(); } catch { /* best-effort */ }
      setOriginal(cfg);
      setMsg({ type: 'success', text: 'Smart Banner saved.' });
      setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setMsg({ type: 'error', text: 'Save failed: ' + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full min-h-[48px] border-2 border-slate-600 bg-slate-800 text-white text-sm placeholder-slate-500 py-2 px-3 rounded-lg focus:outline-none focus:border-blue-500';

  return (
    <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-white font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" /> Smart Banner (text popup)
          </p>
          <p className="text-[#2a4a7a] text-xs mt-0.5">
            Desktop-only floating popup shown on every page. Visitors can close it with X.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0f2640]/60 hover:bg-[#0f2640] text-[#8caad4] rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Smart Banner'}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${
            msg.type === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Close" className="ml-auto">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Controls */}
          <div className="space-y-4">
            <label className="flex items-center justify-between bg-[#04101f]/60 border border-white/10 rounded-lg px-4 py-3">
              <div>
                <p className="text-white text-sm font-medium">Enabled</p>
                <p className="text-[#2a4a7a] text-xs">{cfg.enabled ? 'Live on desktop' : 'Hidden'}</p>
              </div>
              <input
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
                className="w-5 h-5 accent-blue-500"
              />
            </label>

            <div>
              <label className="block text-white text-xs font-medium mb-1">Message</label>
              <textarea
                value={cfg.message}
                onChange={(e) => set('message', e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white text-xs font-medium mb-1">CTA label</label>
                <input value={cfg.ctaLabel ?? ''} onChange={(e) => set('ctaLabel', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-white text-xs font-medium mb-1">CTA link</label>
                <input value={cfg.ctaHref ?? ''} onChange={(e) => set('ctaHref', e.target.value)} className={inputCls} placeholder="/products" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white text-xs font-medium mb-1">Background color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={cfg.backgroundColor.startsWith('#') ? cfg.backgroundColor : '#2563EB'}
                    onChange={(e) => set('backgroundColor', e.target.value)}
                    className="h-12 w-14 rounded-lg border-2 border-slate-600 bg-slate-800 cursor-pointer"
                  />
                  <input value={cfg.backgroundColor} onChange={(e) => set('backgroundColor', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-white text-xs font-medium mb-1">Text color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={cfg.textColor.startsWith('#') ? cfg.textColor : '#FFFFFF'}
                    onChange={(e) => set('textColor', e.target.value)}
                    className="h-12 w-14 rounded-lg border-2 border-slate-600 bg-slate-800 cursor-pointer"
                  />
                  <input value={cfg.textColor} onChange={(e) => set('textColor', e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-white text-xs font-medium mb-1">Font size</label>
                <select value={cfg.fontSize} onChange={(e) => set('fontSize', e.target.value as SmartBannerConfig['fontSize'])} className={inputCls}>
                  {FONT_SIZE_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white text-xs font-medium mb-1">Banner size</label>
                <select value={cfg.bannerSize} onChange={(e) => set('bannerSize', e.target.value as SmartBannerConfig['bannerSize'])} className={inputCls}>
                  {BANNER_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-white text-xs font-medium mb-1">Position</label>
                <select value={cfg.position} onChange={(e) => set('position', e.target.value as SmartBannerConfig['position'])} className={inputCls}>
                  {BANNER_POSITION_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white text-xs font-medium mb-1">Delay before show (ms)</label>
                <input
                  type="number"
                  min={0}
                  value={cfg.delayMs}
                  onChange={(e) => set('delayMs', Math.max(0, Number(e.target.value) || 0))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-white text-xs font-medium mb-1">Re-show after dismiss (hours)</label>
                <input
                  type="number"
                  min={0}
                  value={cfg.dismissDurationHours}
                  onChange={(e) => set('dismissDurationHours', Math.max(0, Number(e.target.value) || 0))}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <p className="text-white text-xs font-medium mb-2">Live preview</p>
            <div className="rounded-xl border border-white/10 bg-[#020617] p-6 min-h-[220px] flex items-center justify-center">
              <SmartBanner config={cfg} previewMode />
            </div>
            <p className="text-[#2a4a7a] text-xs mt-2">
              Preview is inline. On the live site it floats {cfg.position === 'center' ? 'in the center with a dimmed backdrop' : `at ${cfg.position}`}, desktop only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
