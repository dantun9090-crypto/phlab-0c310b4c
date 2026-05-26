import { useState, useEffect } from 'react';
import { db, collection, getDocs, doc, setDoc, getDoc } from '@/lib/firebase';
import { Star, Check, Trash2, FlaskConical, Save, Loader2, AlertCircle } from 'lucide-react';
import { getProductImage } from '@/lib/productImages';
import { nameToSlug } from '@/lib/seedProducts';

interface RawProduct {
  id: string;
  name: string;
  slug?: string;
  price?: number;
  lowestPrice?: number;
  category?: string;
  imageUrl?: string;
  images?: string[];
  variants?: { price?: number }[];
  isActive?: boolean;
  stock?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'tissue-repair':        '#22c55e',
  'metabolic-signaling':  '#f59e0b',
  'cellular-aging':       '#8b5cf6',
  'neurological':         '#06b6d4',
  'melanin':              '#ec4899',
  'blends':               '#3b82f6',
  'accessories':          '#9cb8d9',
};

export function FeaturedProductsTab() {
  const [allProducts, setAllProducts] = useState<RawProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  // ── Load all products from Firebase + saved selection ──────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        // 1. All products
        const snap = await getDocs(collection(db, 'product_stock'));
        const list: RawProduct[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as RawProduct));
        setAllProducts(list);

        // 2. Saved featured selection (just array of product IDs)
        const featSnap = await getDoc(doc(db, 'siteSettings', 'featured-products'));
        if (featSnap.exists() && Array.isArray(featSnap.data().ids)) {
          setSelectedIds(featSnap.data().ids);
        }
      } catch (e: any) {
        setError('Failed to load products: ' + (e?.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Toggle a product in/out of featured ────────────────────────
  const toggle = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : prev.length >= 6
          ? prev  // max 6
          : [...prev, id]
    );
    setSaved(false);
  };

  // ── Save to Firestore ───────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Build enriched product objects for the homepage to consume
      const featuredProducts = selectedIds.map(id => {
        const p = allProducts.find(x => x.id === id);
        if (!p) return null;
        const slug = p.slug || nameToSlug(p.name);
        const price = p.variants?.[0]?.price ?? p.lowestPrice ?? p.price ?? 0;
        const color = CATEGORY_COLORS[p.category || ''] || '#3b82f6';
        return {
          id: p.id,
          slug,
          name: p.name,
          price: `£${Number(price).toFixed(2)}`,
          category: p.category || 'Research',
          categoryColor: color,
          badge: 'HPLC ≥99%',
          image: getProductImage(p.name, p.imageUrl, p.images),
        };
      }).filter(Boolean);

      await setDoc(doc(db, 'siteSettings', 'featured-products'), {
        ids: selectedIds,
        products: featuredProducts,
        updatedAt: new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent('admin:save'));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError('Failed to save: ' + (e?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-[#9cb8d9]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading products...</span>
      </div>
    );
  }

  const selectedProducts = selectedIds.map(id => allProducts.find(p => p.id === id)).filter(Boolean) as RawProduct[];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            Featured Products
          </h2>
          <p className="text-[#9cb8d9] text-sm mt-1">
            Choose up to 6 products to show in the "Most Popular" section on the homepage.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            saved
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Selected Products */}
      <div className="p-5 rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07]">
        <h3 className="text-sm font-bold text-[#9cb8d9] uppercase tracking-widest mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          Selected ({selectedIds.length}/6)
        </h3>

        {selectedProducts.length === 0 ? (
          <p className="text-[#3a5a82] text-sm py-4 text-center">No products selected yet — pick from the list below.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedProducts.map(p => {
              const slug = p.slug || nameToSlug(p.name);
              const price = p.variants?.[0]?.price ?? p.lowestPrice ?? p.price ?? 0;
              const color = CATEGORY_COLORS[p.category || ''] || '#3b82f6';
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#060f1e]">
                    <img
                      src={getProductImage(p.name, p.imageUrl, p.images)}
                      alt={p.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-emerald-400 text-xs font-bold">£{Number(price).toFixed(2)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${color}20`, color }}>{p.category}</span>
                    </div>
                    <p className="text-[#3a5a82] text-[10px] mt-0.5 truncate">/products/{slug}</p>
                  </div>
                  <button
                    onClick={() => toggle(p.id)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                    aria-label="Remove featured product"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All Products — pick from list */}
      <div className="p-5 rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07]">
        <h3 className="text-sm font-bold text-[#9cb8d9] uppercase tracking-widest mb-4 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-blue-400" />
          All Products — click to add / remove
          {selectedIds.length >= 6 && (
            <span className="ml-auto text-amber-400 text-xs font-normal normal-case">Max 6 reached</span>
          )}
        </h3>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allProducts.map(p => {
            const isSelected = selectedIds.includes(p.id);
            const price = p.variants?.[0]?.price ?? p.lowestPrice ?? p.price ?? 0;
            const color = CATEGORY_COLORS[p.category || ''] || '#3b82f6';
            const disabled = !isSelected && selectedIds.length >= 6;
            return (
              <button
                key={p.id}
                onClick={() => !disabled && toggle(p.id)}
                disabled={disabled}
                className={`flex items-center gap-3 p-3 rounded-xl text-left w-full transition-all border ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                    : disabled
                      ? 'bg-white/[0.02] border-white/[0.04] opacity-40 cursor-not-allowed'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] cursor-pointer'
                }`}
              >
                <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#060f1e]">
                  <img
                    src={getProductImage(p.name, p.imageUrl, p.images)}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center">
                      <Check className="w-4 h-4 text-emerald-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-[#d0e4f8]'}`}>{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-blue-400 text-xs font-bold">£{Number(price).toFixed(2)}</span>
                    {p.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${color}20`, color }}>{p.category}</span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
