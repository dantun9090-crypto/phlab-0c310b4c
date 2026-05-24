import { useState } from 'react';
import { X, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { updateProduct } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';

interface QuickEditModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Product) => void;
}

export function QuickEditModal({ product, isOpen, onClose, onSave }: QuickEditModalProps) {
  const [formData, setFormData] = useState({
    name: product.name,
    price: product.price,
    stock: product.stock,
    visibility: product.visibility || 'active',
    purity: product.purity || '99%+',
  });
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProduct(product.id, formData);
      onSave({ ...product, ...formData });
      onClose();
    } catch (error) {
      console.error('Failed to update product:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Quick Edit</h2>
          <button
            onClick={onClose}
            aria-label="Close quick edit"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Product Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] min-h-[48px]"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Price (£)</label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] min-h-[48px]"
              step="0.01"
            />
          </div>

          {/* Stock */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Stock</label>
            <input
              type="number"
              value={formData.stock}
              onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] min-h-[48px]"
            />
          </div>

          {/* Purity */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Purity</label>
            <input
              type="text"
              value={formData.purity}
              onChange={(e) => setFormData({ ...formData, purity: e.target.value })}
              className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] min-h-[48px]"
              placeholder="99%+"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Visibility</label>
            <div className="grid grid-cols-3 gap-2">
              {['active', 'hidden', 'out_of_stock'].map((vis) => (
                <button
                  key={vis}
                  onClick={() => setFormData({ ...formData, visibility: vis as any })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.visibility === vis
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {vis === 'active' && <><Eye className="w-4 h-4 inline mr-1" />Active</>}
                  {vis === 'hidden' && <><EyeOff className="w-4 h-4 inline mr-1" />Hidden</>}
                  {vis === 'out_of_stock' && 'Out of Stock'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
