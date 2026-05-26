import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, Timestamp, db, createCoupon, updateCoupon, deleteCoupon } from '@/lib/firebase';
import type { Coupon } from '@/lib/firebase';
import { Plus, Edit2, Trash2, X, Tag, Loader2 } from 'lucide-react';

type Draft = {
  code: string;
  type: Coupon['type'];
  value: number;
  expiryDate: string; // yyyy-mm-dd
  maxUses?: number;
  minOrderValue?: number;
  isActive: boolean;
  description?: string;
};

const emptyDraft: Draft = {
  code: '',
  type: 'percentage',
  value: 10,
  expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  maxUses: undefined,
  minOrderValue: undefined,
  isActive: true,
  description: '',
};

export default function PromoCodesTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')));
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Coupon));
    } catch (e: any) {
      setError(e.message || 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startNew = () => { setDraft(emptyDraft); setEditingId(null); setShowForm(true); setError(''); };

  const startEdit = (c: Coupon) => {
    setDraft({
      code: c.code,
      type: c.type,
      value: c.value,
      expiryDate: c.expiryDate?.toDate().toISOString().slice(0, 10) || emptyDraft.expiryDate,
      maxUses: c.maxUses ?? c.maxUsage,
      minOrderValue: c.minOrderValue,
      isActive: c.isActive,
      description: c.description || '',
    });
    setEditingId(c.id);
    setShowForm(true);
    setError('');
  };

  const handleSave = async () => {
    if (!draft.code.trim()) { setError('Code is required'); return; }
    if (draft.type !== 'free_shipping' && (!draft.value || draft.value <= 0)) { setError('Value must be > 0'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        code: draft.code.trim().toUpperCase(),
        type: draft.type,
        value: draft.type === 'free_shipping' ? 0 : draft.value,
        expiryDate: Timestamp.fromDate(new Date(draft.expiryDate + 'T23:59:59')),
        isActive: draft.isActive,
        description: draft.description || '',
      };
      if (draft.maxUses && draft.maxUses > 0) payload.maxUses = draft.maxUses;
      if (draft.minOrderValue && draft.minOrderValue > 0) payload.minOrderValue = draft.minOrderValue;

      if (editingId) {
        await updateCoupon(editingId, payload);
      } else {
        await createCoupon(payload);
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this promo code?')) return;
    try {
      await deleteCoupon(id);
      await load();
    } catch (e: any) {
      setError(e.message || 'Delete failed');
    }
  };

  const handleToggleActive = async (c: Coupon) => {
    try {
      await updateCoupon(c.id, { isActive: !c.isActive });
      await load();
    } catch (e: any) {
      setError(e.message || 'Update failed');
    }
  };

  const formatValue = (c: Coupon) => {
    if (c.type === 'percentage') return `${c.value}%`;
    if (c.type === 'fixed') return `£${c.value.toFixed(2)}`;
    return 'Free shipping';
  };

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag className="w-6 h-6 text-emerald-400" /> Promo Codes
          </h1>
          <p className="text-sm text-[#9cb8d9] mt-1">Manage discount codes from the /coupons collection.</p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Code
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 p-5 bg-[#0b1a30] border border-emerald-500/30 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">{editingId ? 'Edit Promo Code' : 'New Promo Code'}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Code</label>
              <input
                type="text"
                value={draft.code}
                onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                placeholder="SAVE10"
                className="w-full px-3 py-2 bg-[#060f1e] border border-white/20 rounded-lg text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={draft.type}
                onChange={e => setDraft({ ...draft, type: e.target.value as Coupon['type'] })}
                className="w-full px-3 py-2 bg-[#060f1e] border border-white/20 rounded-lg text-white text-sm outline-none focus:border-emerald-500"
              >
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
                <option value="free_shipping">Free shipping</option>
              </select>
            </div>
            {draft.type !== 'free_shipping' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Value {draft.type === 'percentage' ? '(%)' : '(£)'}
                </label>
                <input
                  type="number"
                  value={draft.value}
                  onChange={e => setDraft({ ...draft, value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-[#060f1e] border border-white/20 rounded-lg text-white text-sm outline-none focus:border-emerald-500"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Expiry Date</label>
              <input
                type="date"
                value={draft.expiryDate}
                onChange={e => setDraft({ ...draft, expiryDate: e.target.value })}
                className="w-full px-3 py-2 bg-[#060f1e] border border-white/20 rounded-lg text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Usage Limit (optional)</label>
              <input
                type="number"
                value={draft.maxUses ?? ''}
                onChange={e => setDraft({ ...draft, maxUses: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="Unlimited"
                className="w-full px-3 py-2 bg-[#060f1e] border border-white/20 rounded-lg text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Min Order Value £ (optional)</label>
              <input
                type="number"
                value={draft.minOrderValue ?? ''}
                onChange={e => setDraft({ ...draft, minOrderValue: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="0"
                className="w-full px-3 py-2 bg-[#060f1e] border border-white/20 rounded-lg text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
              <input
                type="text"
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
                placeholder="Spring sale 10% off"
                className="w-full px-3 py-2 bg-[#060f1e] border border-white/20 rounded-lg text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={e => setDraft({ ...draft, isActive: e.target.checked })}
              className="w-4 h-4 accent-emerald-500"
            />
            <span className="text-sm text-white">Active</span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="p-8 text-center bg-[#0b1a30] border border-white/[0.07] rounded-xl text-gray-400 text-sm">
          No promo codes yet. Click "New Code" to create one.
        </div>
      ) : (
        <div className="bg-[#0b1a30] border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Value</th>
                  <th className="text-left px-4 py-3">Usage</th>
                  <th className="text-left px-4 py-3">Expires</th>
                  <th className="text-left px-4 py-3">Active</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {coupons.map(c => {
                  const used = c.usedCount ?? c.usageCount ?? 0;
                  const max = c.maxUses ?? c.maxUsage;
                  const expired = c.expiryDate?.toDate() < new Date();
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-white">{c.code}</span>
                        {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-300 capitalize">{c.type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-emerald-400 font-semibold">{formatValue(c)}</td>
                      <td className="px-4 py-3 text-gray-300">{used}{max ? ` / ${max}` : ''}</td>
                      <td className={`px-4 py-3 ${expired ? 'text-red-400' : 'text-gray-300'}`}>
                        {c.expiryDate?.toDate().toLocaleDateString('en-GB')}
                        {expired && <span className="ml-1 text-xs">(expired)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(c)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${c.isActive ? 'bg-emerald-500' : 'bg-white/15'}`}
                          aria-label="Toggle active"
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${c.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(c)}
                            aria-label="Edit"
                            className="p-1.5 rounded hover:bg-white/10 text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            aria-label="Delete"
                            className="p-1.5 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
