/**
 * Admin: search, pick, reorder and save the UK bank tiles shown on
 * checkout for Wallid Pay-by-Bank. Selection persists to Firestore
 * (site_config/wallid_banks) and is read live by WallidTrustElements.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Save, RotateCcw, Check, X, ArrowUp, ArrowDown } from 'lucide-react';
import {
  WALLID_BANK_CATALOG,
  WALLID_BANK_CATEGORY_LABELS,
  DEFAULT_WALLID_BANK_IDS,
  BankMark,
  type WallidBankCategory,
} from '@/lib/wallid-bank-catalog';
import { loadWallidBankIds, saveWallidBankIds } from '@/lib/wallid-bank-store';
import WallidTrustElements from '@/components/WallidTrustElements';

const CATEGORIES: ('all' | WallidBankCategory)[] = [
  'all', 'high-street', 'digital', 'building-society', 'business',
];

export default function WallidBanksTab() {
  const [selected, setSelected] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | WallidBankCategory>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    loadWallidBankIds().then((ids) => {
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
    return WALLID_BANK_CATALOG.filter((b) => {
      if (category !== 'all' && b.category !== category) return false;
      if (!q) return true;
      const hay = [b.name, b.id, b.category, ...(b.keywords ?? [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [query, category]);

  const dirty = useMemo(
    () => selected.join('|') !== original.join('|'),
    [selected, original],
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function move(id: string, dir: -1 | 1) {
    setSelected((s) => {
      const i = s.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveWallidBankIds(selected);
      setOriginal(selected);
      setToast({ kind: 'ok', msg: `Saved ${selected.length} bank${selected.length === 1 ? '' : 's'} to Firebase` });
      window.dispatchEvent(new Event('admin:save'));
    } catch (err) {
      console.error(err);
      setToast({ kind: 'err', msg: 'Failed to save. Check admin permissions.' });
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setSelected(DEFAULT_WALLID_BANK_IDS);
  }

  const selectedDefs = selected
    .map((id) => WALLID_BANK_CATALOG.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Wallid Bank Tiles</h2>
        <p className="text-sm text-slate-400 mt-1">
          Search and pick which UK bank tiles appear under the Pay-by-Bank option at checkout.
          Selection order = display order. Stored in <code className="text-slate-300">site_config/wallid_banks</code>.
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
            placeholder="Search banks (e.g. 'lloyds', 'monzo', 'business')"
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
              {c === 'all' ? 'All' : WALLID_BANK_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          {filtered.length} of {WALLID_BANK_CATALOG.length} shown · <strong className="text-emerald-400">{selected.length}</strong> selected
        </p>
      </div>

      {/* Picker grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {loading ? (
          <p className="text-slate-400 col-span-full">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400 col-span-full">No banks match your search.</p>
        ) : (
          filtered.map((b) => {
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
                <div className="flex items-center gap-3 min-w-0 pr-5">
                  <BankMark bank={b} size={48} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{b.name}</div>
                    <div className="text-[11px] text-slate-400 capitalize">
                      {WALLID_BANK_CATEGORY_LABELS[b.category]}
                    </div>
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

      {/* Reorder list */}
      {selectedDefs.length > 0 && (
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4">
          <p className="text-sm font-semibold text-white mb-3">
            Display order ({selectedDefs.length})
          </p>
          <ul className="space-y-2">
            {selectedDefs.map((b, i) => (
              <li
                key={b.id}
                className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
              >
                <span className="text-slate-500 text-xs w-5 text-right">{i + 1}.</span>
                <BankMark bank={b} size={36} />
                <span className="text-white text-sm flex-1 truncate">{b.name}</span>
                <button
                  onClick={() => move(b.id, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(b.id, 1)}
                  disabled={i === selectedDefs.length - 1}
                  aria-label="Move down"
                  className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggle(b.id)}
                  aria-label="Remove"
                  className="p-1.5 rounded-md text-red-300 hover:bg-red-500/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live preview */}
      <div className="bg-[#0a1424] border-2 border-slate-700 rounded-lg p-4">
        <p className="text-sm font-semibold text-white mb-3">Live preview (checkout)</p>
        <WallidTrustElements bankIdsOverride={selected} />
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
