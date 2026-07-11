import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Edit2, Trash2, AlertTriangle,
  Loader2, X, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, Toaster as SonnerToaster } from 'sonner';
import {
  Product,
  getAllProducts, updateProduct, deleteProduct,
} from '@/lib/firebase';

import { ProductEditor } from '@/components/ProductEditor';
import { submitToIndexNow } from '@/lib/indexnow.functions';

const LOW_STOCK_THRESHOLD = 10;

/**
 * Inline-editable cell for numeric fields (price / stock).
 * Click → input opens with current value; Enter or blur saves via updateProduct;
 * Esc cancels. Shows a spinner during save and a green tick briefly on success.
 */
function InlineNumberCell({
  productId,
  field,
  value,
  variants,
  format,
  step,
  min,
  onSaved,
}: {
  productId: string;
  field: 'price' | 'stock';
  value: number;
  variants?: Product['variants'];
  format: (n: number) => string;
  step: string;
  min: number;
  onSaved: (n: number, patch?: Partial<Product>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = async () => {
    const parsed = field === 'stock' ? parseInt(draft, 10) : parseFloat(draft);
    if (isNaN(parsed) || parsed < min) {
      toast.error(`Invalid ${field}`);
      setDraft(String(value));
      setEditing(false);
      return;
    }
    if (parsed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      // CRITICAL: when the product has variants, the customer-facing
      // stock/price is derived from variants[] (sum of stock, min of price)
      // by src/lib/firestore-rest.ts. Writing only the root field is
      // invisible to the storefront. So also propagate the change into
      // variants[] whenever they exist.
      const patch: any = { [field]: parsed };
      if (variants && variants.length > 0) {
        if (field === 'stock') {
          const oldSum = variants.reduce((s, v: any) => s + (Number(v?.stock) || 0), 0);
          let running = 0;
          patch.variants = variants.map((v: any, i: number) => {
            let next: number;
            if (oldSum > 0) {
              next = i === variants.length - 1
                ? Math.max(0, parsed - running)
                : Math.round((Number(v?.stock) || 0) / oldSum * parsed);
            } else {
              const each = Math.floor(parsed / variants.length);
              next = i === variants.length - 1 ? parsed - each * (variants.length - 1) : each;
            }
            running += next;
            return { ...v, stock: next };
          });
        } else {
          patch.variants = variants.map((v: any) => ({ ...v, price: parsed }));
        }
      }
      await updateProduct(productId, patch);
      onSaved(parsed, patch);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1200);
      toast.success(`${field === 'price' ? 'Price' : 'Stock'} updated`);
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message || 'unknown error'}`);
      setDraft(String(value));
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };


  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-500/15 transition-colors group cursor-pointer"
        title={`Click to edit ${field}`}
      >
        <span>{format(value)}</span>
        {justSaved && <Check className="w-3 h-3 text-green-400" />}
        {!justSaved && <Edit2 className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        value={draft}
        step={step}
        min={min}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
        }}
        onBlur={commit}
        className="w-20 px-2 py-1 bg-[#1e293b] border-2 border-blue-500 rounded text-white text-sm text-right focus:outline-none"
      />
      {saving && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
    </div>
  );
}

/** Inline visibility dropdown — saves immediately on change. */
function InlineVisibility({
  productId,
  value,
  onSaved,
}: {
  productId: string;
  value: 'active' | 'hidden' | 'out_of_stock';
  onSaved: (v: 'active' | 'hidden' | 'out_of_stock') => void;
}) {
  const [saving, setSaving] = useState(false);
  const styles: Record<string, string> = {
    active: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30',
    hidden: 'bg-gray-800 text-gray-400 border-gray-600',
    out_of_stock: 'bg-red-900/40 text-red-300 border-red-500/30',
  };
  return (
    <select
      value={value}
      disabled={saving}
      onChange={async (e) => {
        const next = e.target.value as 'active' | 'hidden' | 'out_of_stock';
        setSaving(true);
        try {
          await updateProduct(productId, { visibility: next });
          onSaved(next);
          toast.success(`Set to ${next.replace('_', ' ')}`);
        } catch (err: any) {
          toast.error(`Save failed: ${err?.message || 'error'}`);
        } finally {
          setSaving(false);
        }
      }}
      className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${styles[value] || styles.active} ${saving ? 'opacity-50' : ''}`}
    >
      <option value="active">Active</option>
      <option value="hidden">Hidden</option>
      <option value="out_of_stock">Out of stock</option>
    </select>
  );
}



export default function InventoryTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProduct, setEditorProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getAllProducts();
      setProducts(data);
      const low = data.filter((p) => (p.stock || 0) <= LOW_STOCK_THRESHOLD);
      if (low.length > 0) {
        setAlertMsg('Low stock: ' + low.map((p) => p.name).join(', '));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product permanently?')) return;
    await deleteProduct(id);
    await loadProducts();
  };

  const handleBulkUpdate = async () => {
    if (bulkSelected.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        bulkSelected.map((id) =>
          updateProduct(id, {
            ...(bulkPrice ? { price: Number(bulkPrice) } : {}),
            ...(bulkStock ? { stock: Number(bulkStock) } : {}),
          })
        )
      );
      await loadProducts();
      setBulkSelected([]);
      setBulkPrice('');
      setBulkStock('');
      setShowBulk(false);
    } finally {
      setSaving(false);
    }
  };

  // Silently trigger Prerender.io recache for a product URL after save.
  // Token is read from localStorage (admin-only, never persisted to Firestore)
  // and sent directly to api.prerender.io — never through third-party CORS proxies,
  // which would expose the token to proxy operators. Matches SEOTab pattern.
  const autoRecacheProduct = async (slug: string) => {
    try {
      const token = localStorage.getItem('php_prerender_token');
      if (!token) return;
      const url = `https://phlabs.co.uk/products/${slug}`;
      await fetch('https://api.prerender.io/recache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerenderToken: token, urls: [url] }),
      });
    } catch {
      // Silent — recache is best-effort
    }
  };

  // Auto-ping IndexNow (Bing/Yandex/Seznam/Naver) on product save so the
  // updated PDP enters the indexing queue within minutes. Best-effort, silent.
  const autoIndexNowProduct = async (slug: string) => {
    try {
      const url = `https://phlabs.co.uk/products/${slug}`;
      await submitToIndexNow({ data: { urls: [url] } });
    } catch {
      // Silent — IndexNow is best-effort
    }
  };



  const filtered = products.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleBulk = (id: string) => {
    setBulkSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <SonnerToaster />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Inventory</h2>
          <p className="text-[#9cb8d9] text-xs sm:text-sm">
            {products.length} products — {products.filter(p => (p.stock || 0) <= LOW_STOCK_THRESHOLD).length} low stock
          </p>
          <p className="text-emerald-400/80 text-[11px] mt-1">
            ⚡ Auto cache: every add / update / delete triggers a Cloudflare purge + Prerender.io recache for /products and the affected product URL.
          </p>

        </div>
        <div className="flex gap-2 flex-wrap">
          {bulkSelected.length > 0 && (
            <button
              onClick={() => setShowBulk(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-xs sm:text-sm transition-colors"
            >
              Bulk Edit ({bulkSelected.length})
            </button>
          )}
          <button
            onClick={() => { setEditorProduct(null); setEditorOpen(true); }}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs sm:text-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {alertMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 bg-red-900/40 border border-red-500/40 rounded-xl text-red-300 text-xs sm:text-sm"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {alertMsg}
          <button onClick={() => setAlertMsg('')} className="ml-auto" aria-label="Dismiss alert">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9cb8d9]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, SKU, or category..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="bg-[#0b1a30]/60 border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="px-3 sm:px-4 py-3 text-left text-[#9cb8d9] font-medium w-8">
                  <input
                    type="checkbox"
                    onChange={(e) =>
                      setBulkSelected(e.target.checked ? filtered.map((p) => p.id!) : [])
                    }
                    checked={bulkSelected.length === filtered.length && filtered.length > 0}
                    className="rounded"
                  />
                </th>
                <th className="px-3 sm:px-4 py-3 text-left text-[#9cb8d9] font-medium text-xs sm:text-sm">Product</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[#9cb8d9] font-medium hidden md:table-cell text-xs sm:text-sm">SKU</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[#9cb8d9] font-medium hidden md:table-cell text-xs sm:text-sm">Category</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[#9cb8d9] font-medium text-xs sm:text-sm">Price</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[#9cb8d9] font-medium text-xs sm:text-sm">Stock</th>
                <th className="px-3 sm:px-4 py-3 text-center text-[#9cb8d9] font-medium hidden sm:table-cell text-xs sm:text-sm">Visibility</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[#9cb8d9] font-medium text-xs sm:text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[#2a4a7a]">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading inventory...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[#2a4a7a]">No products found.</td>
                </tr>
              ) : (
                filtered.map((product) => (
                  <motion.tr
                    key={product.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-white/[0.04] hover:bg-[#0f2640]/20 transition-colors"
                  >
                    <td className="px-3 sm:px-4 py-3">
                      <input
                        type="checkbox"
                        checked={bulkSelected.includes(product.id!)}
                        onChange={() => toggleBulk(product.id!)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 sm:px-4 py-3">
                      <div className="font-medium text-white text-xs sm:text-sm">{product.name}</div>
                      {product.variants && product.variants.length > 0 && (
                        <div className="text-[#3a5a82] text-xs mt-0.5">
                          {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-[#9cb8d9] font-mono text-xs hidden md:table-cell">{product.sku || '—'}</td>
                    <td className="px-3 sm:px-4 py-3 hidden md:table-cell">
                      <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full text-xs">
                        {product.category || 'Uncategorised'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right text-white font-medium text-xs sm:text-sm">
                      <InlineNumberCell
                        productId={product.id!}
                        field="price"
                        value={Number(product.price || 0)}
                        variants={product.variants}
                        format={(n) => `£${n.toFixed(2)}`}
                        step="0.01"
                        min={0}
                        onSaved={(n, patch) => setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, price: n, ...(patch?.variants ? { variants: patch.variants } : {}) } : p))}
                      />
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 font-medium text-xs sm:text-sm ${(product.stock || 0) <= LOW_STOCK_THRESHOLD ? 'text-red-400' : 'text-green-400'}`}>
                        <InlineNumberCell
                          productId={product.id!}
                          field="stock"
                          value={Number(product.stock || 0)}
                          variants={product.variants}
                          format={(n) => String(n)}
                          step="1"
                          min={0}
                          onSaved={(n, patch) => setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, stock: n, ...(patch?.variants ? { variants: patch.variants } : {}) } : p))}
                        />

                        {(product.stock || 0) <= LOW_STOCK_THRESHOLD && (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
                      <InlineVisibility
                        productId={product.id!}
                        value={(product.visibility || 'active') as 'active' | 'hidden' | 'out_of_stock'}
                        onSaved={(v) => setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, visibility: v } : p))}
                      />
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right">
                      <div className="flex justify-end gap-1 sm:gap-2">
                        <button
                          onClick={() => { setEditorProduct(product); setEditorOpen(true); }}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#0f2640] hover:bg-blue-600 text-[#8caad4] hover:text-white rounded-lg transition-colors"
                          title="Edit product and variants"
                          aria-label="Edit product"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id!)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-[#0f2640] hover:bg-red-600 text-[#8caad4] hover:text-white rounded-lg transition-colors"
                          title="Delete product"
                          aria-label="Delete product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductEditor
        product={editorProduct}
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditorProduct(null); }}
        onSave={async (savedProduct: Product) => {
          setEditorOpen(false);
          setEditorProduct(null);
          window.dispatchEvent(new CustomEvent('admin:save'));
          // Auto-recache the saved product page in Prerender.io
          const slug = savedProduct.slug || savedProduct.id;
          if (slug) {
            autoRecacheProduct(slug);
            autoIndexNowProduct(slug);
          }
          // Update local state immediately with saved product to reflect changes
          setProducts((prev) =>
            prev.some((p) => p.id === savedProduct.id)
              ? prev.map((p) => (p.id === savedProduct.id ? savedProduct : p))
              : [...prev, savedProduct]
          );
          // Then reload from Firestore to ensure consistency
          await loadProducts();
        }}
      />

      <AnimatePresence>
        {showBulk && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#04101f] border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm"
            >
              <h3 className="text-lg font-bold text-white mb-4">Bulk Edit ({bulkSelected.length} items)</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[#9cb8d9] text-xs mb-1">Set Price (£) — leave blank to skip</label>
                  <input
                    type="number"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-[#9cb8d9] text-xs mb-1">Set Stock — leave blank to skip</label>
                  <input
                    type="number"
                    value={bulkStock}
                    onChange={(e) => setBulkStock(e.target.value)}
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] min-h-[48px]"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowBulk(false)}
                  className="flex-1 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdate}
                  disabled={saving}
                  className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Apply'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
