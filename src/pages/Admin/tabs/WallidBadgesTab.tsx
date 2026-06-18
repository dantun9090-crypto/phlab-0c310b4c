/**
 * Admin: search, pick, and save the trust badges shown on checkout for
 * Wallid Pay-by-Bank. Selection persists to Firestore
 * (site_config/wallid_badges) and is read live by WallidTrustElements.
 */
import { useEffect, useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, Save, RotateCcw, Check, X, ShieldCheck } from 'lucide-react';
import {
  WALLID_BADGE_CATALOG,
  WALLID_CATEGORY_LABELS,
  DEFAULT_WALLID_BADGE_IDS,
  type WallidBadgeCategory,
} from '@/lib/wallid-badge-catalog';
import { loadWallidBadgeIds, saveWallidBadgeIds } from '@/lib/wallid-badge-store';
import WallidTrustElements from '@/components/WallidTrustElements';

function resolveIcon(name: string) {
  const Comp = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Comp ?? ShieldCheck;
}

const CATEGORIES: ('all' | WallidBadgeCategory)[] = [
  'all', 'security', 'compliance', 'banking', 'speed', 'trust', 'privacy',
];

export default function WallidBadgesTab() {
  const [selected, setSelected] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | WallidBadgeCategory>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    loadWallidBadgeIds().then((ids) => {
      setSelected(ids);
      setOriginal(ids);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WALLID_BADGE_CATALOG.filter((b) => {
      if (category !== 'all' && b.category !== category) return false;
      if (!q) return true;
      const hay = [b.label, b.id, b.category, ...(b.keywords ?? [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [query, category]);

  const dirty = useMemo(() => {
    if (selected.length !== original.length) return true;
    const a = [...selected].sort().join('|');
    const b = [...original].sort().join('|');
    return a !== b;
  }, [selected, original]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveWallidBadgeIds(selected);
      setOriginal(selected);
      setToast({ kind: 'ok', msg: `Saved ${selected.length} badge${selected.length === 1 ? '' : 's'} to Firebase` });
    } catch (err) {
      console.error(err);
      setToast({ kind: 'err', msg: 'Failed to save. Check admin permissions.' });
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setSelected(DEFAULT_WALLID_BADGE_IDS);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Wallid Trust Badges</h2>
        <p className="text-sm text-slate-400 mt-1">
          Search and pick which trust badges appear under the Pay-by-Bank option at checkout.
          Saved selection is stored in Firestore (<code className="text-slate-300">site_config/wallid_badges</code>).
        </p>
      </div>

      {/* Search + filters */}
      <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search badges (e.g. 'secure', 'instant', 'fca')"
            className="w-full pl-10 pr-3 min-h-[48px] border-2 border-slate-600 bg-slate-800 text-white rounded-lg placeholder:text-slate-500 focus:border-emerald-500 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                category === c
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
              }`}
            >
              {c === 'all' ? 'All' : WALLID_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          {filtered.length} of {WALLID_BADGE_CATALOG.length} shown · <strong className="text-emerald-400">{selected.length}</strong> selected
        </p>
      </div>

      {/* Picker grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {loading ? (
          <p className="text-slate-400 col-span-full">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400 col-span-full">No badges match your search.</p>
        ) : (
          filtered.map((b) => {
            const Icon = resolveIcon(b.icon);
            const isSelected = selected.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggle(b.id)}
                className={`relative text-left p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 bg-slate-900 hover:border-slate-500'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{b.label}</div>
                    <div className="text-[11px] text-slate-400 capitalize">{b.category}</div>
                  </div>
                </div>
                {isSelected && (
                  <span className="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Live preview */}
      <div className="bg-[#0a1424] border-2 border-slate-700 rounded-lg p-4">
        <p className="text-sm font-semibold text-white mb-3">Live preview (checkout)</p>
        <WallidTrustElements badgeIdsOverride={selected} />
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-slate-950/95 backdrop-blur border-t border-slate-800 flex items-center justify-between gap-3">
        <button
          onClick={resetDefaults}
          className="inline-flex items-center gap-2 px-3 min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500"
        >
          <RotateCcw className="w-4 h-4" /> Reset to defaults
        </button>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 px-4 min-h-[48px] rounded-lg bg-emerald-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save to Firebase'}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border-2 ${
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
