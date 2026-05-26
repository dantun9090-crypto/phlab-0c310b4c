import { useState, useEffect } from 'react';
import {
  Plus, Tag, Percent, DollarSign, Trash2,
  Wand2, Copy, Check, RefreshCw, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, getAllProducts, Product, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, Timestamp } from '@/lib/firebase';

interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  expiryDate?: any;
  maxUsage?: number;
  usageCount: number;
  isActive: boolean;
  createdAt: any;
}

const AI_REWRITES = [
  "Experience the pinnacle of scientific innovation with {name}. Formulated to the highest research standards, this premium peptide delivers exceptional purity for advanced laboratory applications.",
  "Unlock the potential of cutting-edge biochemistry with {name}. Our rigorously tested, research-grade compound ensures consistent, reproducible results for the most demanding scientific protocols.",
  "Precision-engineered for excellence, {name} represents the gold standard in peptide research. With verified purity and stringent quality controls, trust your results every time.",
  "Advance your research with {name} — a meticulously synthesised peptide designed for professionals who demand nothing less than absolute quality and reproducibility.",
];

export default function MarketingTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [generatedDesc, setGeneratedDesc] = useState('');
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: '',
    expiryDate: '',
    maxUsage: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [couponSnap, prods] = await Promise.all([
        getDocs(query(collection(db, 'coupons'), orderBy('createdAt', 'desc'))),
        getAllProducts(),
      ]);
      setCoupons(couponSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
      setProducts(prods);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.code || !form.value) return;
    setSaving(true);
    try {
      const data: any = {
        code: form.code.toUpperCase(),
        type: form.type,
        value: parseFloat(form.value),
        usageCount: 0,
        isActive: true,
        createdAt: Timestamp.now(),
      };
      if (form.expiryDate) data.expiryDate = Timestamp.fromDate(new Date(form.expiryDate));
      if (form.maxUsage) data.maxUsage = parseInt(form.maxUsage);
      const ref = await addDoc(collection(db, 'coupons'), data);
      setCoupons(prev => [{ id: ref.id, ...data }, ...prev]);
      setCreating(false);
      setForm({ code: '', type: 'percentage', value: '', expiryDate: '', maxUsage: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coupon?')) return;
    await deleteDoc(doc(db, 'coupons', id));
    setCoupons(prev => prev.filter(c => c.id !== id));
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleGenerate = () => {
    if (!selectedProduct) return;
    setGenerating(true);
    setTimeout(() => {
      const template = AI_REWRITES[Math.floor(Math.random() * AI_REWRITES.length)];
      setGeneratedDesc(template.replace('{name}', selectedProduct.name));
      setGenerating(false);
    }, 1200);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Marketing & Growth</h2>
          <p className="text-[#9cb8d9] text-sm mt-1">Coupon codes and AI product descriptions</p>
        </div>
        <button onClick={fetchData} aria-label="Refresh marketing data" className="p-2 bg-[#0d1f35] hover:bg-[#0f2640] text-[#9cb8d9] rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Coupon Engine */}
        <div className="bg-[#0b1a30]/60 border border-white/[0.07] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-400" />
              <h3 className="text-white font-semibold text-lg">Coupon Code Engine</h3>
            </div>
            <button
              onClick={() => setCreating(!creating)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
            >
              {creating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {creating ? 'Cancel' : 'New Coupon'}
            </button>
          </div>

          <AnimatePresence>
            {creating && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 p-4 bg-[#04101f]/60 rounded-xl border border-white/[0.07] space-y-3 overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#9cb8d9] text-xs mb-1 block">Coupon Code *</label>
                    <input
                      value={form.code}
                      onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                      placeholder="e.g. SAVE20"
                      className="w-full px-3 py-2 bg-[#0d1f35] border border-white/[0.08] rounded-lg text-white text-sm uppercase focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[#9cb8d9] text-xs mb-1 block">Type</label>
                    <select
                      value={form.type}
                      onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (£)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[#9cb8d9] text-xs mb-1 block">Value *</label>
                    <input
                      type="number"
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      placeholder={form.type === 'percentage' ? '20' : '5.00'}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-[#9cb8d9] text-xs mb-1 block">Expiry Date</label>
                    <input
                      type="date"
                      value={form.expiryDate}
                      onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-[#9cb8d9] text-xs mb-1 block">Max Usage</label>
                    <input
                      type="number"
                      value={form.maxUsage}
                      onChange={e => setForm(f => ({ ...f, maxUsage: e.target.value }))}
                      placeholder="Unlimited"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  disabled={saving || !form.code || !form.value}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Coupon'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            </div>
          ) : coupons.length === 0 ? (
            <p className="text-[#2a4a7a] text-sm text-center py-8">No coupons yet. Create your first one!</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              <AnimatePresence>
                {coupons.map((c) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 p-3 bg-[#04101f]/50 rounded-xl border border-white/[0.07]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      {c.type === 'percentage' ? <Percent className="w-4 h-4 text-blue-400" /> : <DollarSign className="w-4 h-4 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono font-semibold text-sm">{c.code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${c.isActive ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-gray-500/10 text-[#9cb8d9] border-gray-500/30'}`}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-[#9cb8d9] text-xs mt-0.5">
                        {c.type === 'percentage' ? `${c.value}% off` : `£${c.value} off`}
                        {' · '}{c.usageCount} uses{c.maxUsage ? ` / ${c.maxUsage}` : ''}
                        {c.expiryDate ? ` · Exp ${c.expiryDate.toDate().toLocaleDateString('en-GB')}` : ''}
                      </p>
                    </div>
                    <button onClick={() => handleCopy(c.code)} aria-label="Copy coupon code" className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/[0.06] hover:bg-[#1a3a5c]/50 text-[#9cb8d9] hover:text-white rounded transition-colors">
                      {copied === c.code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleDelete(c.id)} aria-label="Delete coupon" className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* AI Description Generator */}
        <div className="bg-[#0b1a30]/60 border border-white/[0.07] rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Wand2 className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-semibold text-lg">AI Description Generator</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[#9cb8d9] text-xs mb-2 block">Select Product</label>
              <select
                value={selectedProduct?.id || ''}
                onChange={e => setSelectedProduct(products.find(p => p.id === e.target.value) || null)}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              >
                <option value="">Choose a product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {selectedProduct && (
              <div className="p-3 bg-[#04101f]/40 rounded-xl border border-white/[0.07]">
                <p className="text-[#9cb8d9] text-xs mb-1">Current description</p>
                <p className="text-[#8caad4] text-sm leading-relaxed">
                  {selectedProduct.description || 'No description set.'}
                </p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={!selectedProduct || generating}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate SEO Description
                </>
              )}
            </button>

            <AnimatePresence>
              {generatedDesc && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-blue-500/10 border border-purple-500/30 rounded-xl"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-blue-400 text-xs font-medium flex items-center gap-1">
                      <Wand2 className="w-3 h-3" /> AI Generated
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(generatedDesc); }}
                      className="text-xs text-blue-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <p className="text-[#b8d0ed] text-sm leading-relaxed">{generatedDesc}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Stats */}
          <div className="mt-6 pt-5 border-t border-white/[0.07]">
            <p className="text-[#9cb8d9] text-xs font-medium mb-3 uppercase tracking-wide">Quick Stats</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-[#04101f]/40 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">{coupons.filter(c => c.isActive).length}</p>
                <p className="text-[#2a4a7a] text-xs mt-0.5">Active Coupons</p>
              </div>
              <div className="p-3 bg-[#04101f]/40 rounded-xl text-center">
                <p className="text-2xl font-bold text-white">{coupons.reduce((s, c) => s + (c.usageCount || 0), 0)}</p>
                <p className="text-[#2a4a7a] text-xs mt-0.5">Total Redemptions</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
