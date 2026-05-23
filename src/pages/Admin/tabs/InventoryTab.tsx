import { useState, useEffect } from 'react';
import {
  Plus, Search, Edit2, Trash2, AlertTriangle,
  Loader2, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Product,
  getAllProducts, updateProduct, deleteProduct,
  db, doc, getDoc,
} from '@/lib/firebase';
import { ProductEditor } from '@/components/ProductEditor';

const LOW_STOCK_THRESHOLD = 10;

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

  // Silently trigger Prerender.io recache for a product URL after save
  const autoRecacheProduct = async (slug: string) => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'prerenderio'));
      if (!snap.exists()) return;
      const token = snap.data()?.token;
      if (!token) return;
      const url = `https://www.prohealthpeptides.co.uk/products/${slug}`;
      const target = 'https://api.prerender.io/recache';
      const payload = JSON.stringify({ prerenderToken: token, urls: [url] });
      const headers = { 'Content-Type': 'application/json' };
      const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
        `https://thingproxy.freeboard.io/fetch/${target}`,
      ];
      for (const proxy of proxies) {
        try {
          await fetch(proxy, { method: 'POST', headers, body: payload });
          break;
        } catch { /* try next */ }
      }
    } catch {
      // Silent — recache is best-effort
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Inventory</h2>
          <p className="text-[#6b8fba] text-xs sm:text-sm">
            {products.length} products — {products.filter(p => (p.stock || 0) <= LOW_STOCK_THRESHOLD).length} low stock
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b8fba]" />
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
                <th className="px-3 sm:px-4 py-3 text-left text-[#6b8fba] font-medium w-8">
                  <input
                    type="checkbox"
                    onChange={(e) =>
                      setBulkSelected(e.target.checked ? filtered.map((p) => p.id!) : [])
                    }
                    checked={bulkSelected.length === filtered.length && filtered.length > 0}
                    className="rounded"
                  />
                </th>
                <th className="px-3 sm:px-4 py-3 text-left text-[#6b8fba] font-medium text-xs sm:text-sm">Product</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[#6b8fba] font-medium hidden md:table-cell text-xs sm:text-sm">SKU</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[#6b8fba] font-medium hidden md:table-cell text-xs sm:text-sm">Category</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[#6b8fba] font-medium text-xs sm:text-sm">Price</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[#6b8fba] font-medium text-xs sm:text-sm">Stock</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[#6b8fba] font-medium text-xs sm:text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#2a4a7a]">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading inventory...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#2a4a7a]">No products found.</td>
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
                    <td className="px-3 sm:px-4 py-3 text-[#6b8fba] font-mono text-xs hidden md:table-cell">{product.sku || '—'}</td>
                    <td className="px-3 sm:px-4 py-3 hidden md:table-cell">
                      <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full text-xs">
                        {product.category || 'Uncategorised'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right text-white font-medium text-xs sm:text-sm">
                      £{Number(product.price || 0).toFixed(2)}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right">
                      <span className={`font-medium text-xs sm:text-sm ${(product.stock || 0) <= LOW_STOCK_THRESHOLD ? 'text-red-400' : 'text-green-400'}`}>
                        {product.stock || 0}
                        {(product.stock || 0) <= LOW_STOCK_THRESHOLD && (
                          <AlertTriangle className="inline w-3 h-3 ml-1" />
                        )}
                      </span>
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
          if (slug) autoRecacheProduct(slug);
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
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
                  <label className="block text-[#6b8fba] text-xs mb-1">Set Price (£) — leave blank to skip</label>
                  <input
                    type="number"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-[#6b8fba] text-xs mb-1">Set Stock — leave blank to skip</label>
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
