import { useMemo, useState, useEffect } from 'react';
import {
  Megaphone, Plus, Trash2, Edit2, CheckCircle2, AlertCircle,
  Loader2, Eye, EyeOff, Link as LinkIcon, Image as ImageIcon, Save, X,
  Sparkles, Home, ShoppingBag, PanelRight, MousePointerClick, Tag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { db, storage, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, orderBy, query, storageRef, uploadBytesResumable, getDownloadURL, triggerContentCdnInvalidation, bumpMarketingVersion } from '@/lib/firebase';

const PLACEMENT_ICONS: Record<string, typeof Home> = {
  homepage_hero: Home,
  homepage_mid: Sparkles,
  products_top: ShoppingBag,
  products_sidebar: PanelRight,
  popup: MousePointerClick,
};

interface Advert {
  id?: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl: string;
  placement: 'homepage_hero' | 'homepage_mid' | 'products_top' | 'products_sidebar' | 'popup';
  isActive: boolean;
  bgColor: string;
  textColor: string;
  createdAt?: any;
  updatedAt?: any;
}

const PLACEMENTS: { value: Advert['placement']; label: string; desc: string }[] = [
  { value: 'homepage_hero', label: 'Homepage — Hero Strip', desc: 'Top announcement bar on homepage' },
  { value: 'homepage_mid', label: 'Homepage — Mid Section', desc: 'Between featured products and testimonials' },
  { value: 'products_top', label: 'Products — Top Banner', desc: 'Banner above the product grid' },
  { value: 'products_sidebar', label: 'Products — Side Banner', desc: 'Sidebar promotional block' },
  { value: 'popup', label: 'Pop-up Modal', desc: 'Timed pop-up shown to visitors' },
];

const EMPTY: Advert = {
  title: '', subtitle: '', ctaText: 'Shop Now', ctaUrl: '/products',
  imageUrl: '', placement: 'homepage_hero', isActive: true,
  bgColor: '#0b1a30', textColor: '#e8f0fe',
};

export default function AdvertsTab() {
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Advert | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'adverts'), orderBy('createdAt', 'desc')));
      const loadedAdverts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Advert));
      console.log('📢 Adverts loaded:', loadedAdverts.length, loadedAdverts);
      setAdverts(loadedAdverts);
      if (loadedAdverts.length === 0) {
        showToast('No adverts found. Create your first one!', true);
      }
    } catch (e: any) {
      console.error('❌ Adverts load error:', e);
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('permission') || msg.includes('denied')) {
        showToast('⚠️ Firestore permission denied for adverts collection. Deploy firestore.rules!', false);
      } else {
        showToast(e?.message || 'Failed to load adverts', false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { showToast('Title is required', false); return; }
    setSaving(true);
    try {
      const data = { ...editing, updatedAt: Timestamp.now() };
      delete data.id;
      if (isNew) {
        (data as any).createdAt = Timestamp.now();
        await addDoc(collection(db, 'adverts'), data);
        showToast('Advert created!');
      } else {
        await updateDoc(doc(db, 'adverts', editing.id!), data);
        showToast('Advert saved!');
      }
      triggerContentCdnInvalidation(['/', '/products']); bumpMarketingVersion();
      setEditing(null);
      setIsNew(false);
      await load();
    } catch (e: any) {
      showToast(e.message || 'Error saving', false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this advert?')) return;
    await deleteDoc(doc(db, 'adverts', id));
    triggerContentCdnInvalidation(['/', '/products']); bumpMarketingVersion();
    showToast('Deleted');
    await load();
  };

  const handleToggle = async (advert: Advert) => {
    await updateDoc(doc(db, 'adverts', advert.id!), { isActive: !advert.isActive });
    triggerContentCdnInvalidation(['/', '/products']); bumpMarketingVersion();
    await load();
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    let uploadedUrl = '';
    try {
      const { validateAndBuildStoragePath } = await import('@/lib/upload-validation');
      const path = await validateAndBuildStoragePath(file, 'adverts');
      const task = uploadBytesResumable(storageRef(storage, path), file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          (snap) => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          async () => {
            uploadedUrl = await getDownloadURL(task.snapshot.ref);
            resolve();
          }
        );
      });
      // Set URL after promise resolves — avoids stale closure bug
      if (uploadedUrl) {
        setEditing(prev => prev ? { ...prev, imageUrl: uploadedUrl } : prev);
        showToast('Image uploaded!');
      }
    } catch (e: any) {
      const isPermission = String(e?.message).includes('unauthorized') || String(e?.code).includes('unauthorized');
      showToast(isPermission ? 'Permission denied — deploy storage rules in Firebase Console' : (e.message || 'Upload failed'), false);
    } finally {
      setUploading(false);
    }
  };

  const placementLabel = (v: Advert['placement']) =>
    PLACEMENTS.find(p => p.value === v)?.label ?? v;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-blue-400" /> Adverts &amp; Promotions
          </h1>
          <p className="text-[#9cb8d9] text-sm mt-0.5">Manage on-site banners, strips and promotional blocks</p>
        </div>
        <button
          onClick={() => { setEditing({ ...EMPTY }); setIsNew(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> New Advert
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
              toast.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advert List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
        </div>
      ) : adverts.length === 0 && !editing ? (
        <div className="bg-[#0b1a30]/80 border border-white/[0.07] rounded-2xl p-16 text-center">
          <Megaphone className="w-10 h-10 text-[#2a4a7a] mx-auto mb-4" />
          <p className="text-[#9cb8d9] font-medium mb-1">No adverts yet</p>
          <p className="text-[#2a4a7a] text-sm mb-5">Create your first promotional advert to start driving conversions.</p>
          <button
            onClick={() => { setEditing({ ...EMPTY }); setIsNew(true); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Create First Advert
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {adverts.map((advert) => (
            <motion.div
              key={advert.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#0b1a30]/80 border border-white/[0.07] rounded-2xl p-4 flex items-center gap-4 hover:border-white/[0.12] transition-colors"
            >
              {/* Preview image / color swatch */}
              <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0 border border-white/[0.08]"
                style={{ background: advert.imageUrl ? undefined : advert.bgColor }}>
                {advert.imageUrl && (
                  <img src={advert.imageUrl} alt={advert.title} className="w-full h-full object-cover" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[#e8f0fe] font-semibold text-sm truncate">{advert.title || 'Untitled'}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                    advert.isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-white/5 text-[#2a4a7a] border-white/[0.06]'
                  }`}>
                    {advert.isActive ? 'Live' : 'Paused'}
                  </span>
                </div>
                <p className="text-[#9cb8d9] text-xs truncate">{advert.subtitle}</p>
                <p className="text-[#2a4a7a] text-[10px] mt-0.5">{placementLabel(advert.placement)}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(advert)}
                  title={advert.isActive ? 'Pause' : 'Go live'}
                  aria-label={advert.isActive ? 'Pause advert' : 'Go live with advert'}
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${
                    advert.isActive
                      ? 'text-emerald-400 hover:bg-emerald-500/10'
                      : 'text-[#2a4a7a] hover:bg-white/5'
                  }`}
                >
                  {advert.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setEditing({ ...advert }); setIsNew(false); }}
                  aria-label="Edit advert"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(advert.id!)}
                  aria-label="Delete advert"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Editor Drawer ── */}
      <AnimatePresence>
        {editing && (
          <motion.div
            className="fixed inset-0 z-50 flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70" onClick={() => setEditing(null)} />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative ml-auto w-full max-w-xl bg-[#07131f] border-l border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
                <h2 className="text-white font-semibold text-lg">
                  {isNew ? 'New Advert' : 'Edit Advert'}
                </h2>
                <button onClick={() => setEditing(null)} aria-label="Close advert editor" className="p-2 rounded-lg hover:bg-white/5 text-[#9cb8d9]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable form */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Title *</label>
                  <input
                    value={editing.title}
                    onChange={e => setEditing(p => p ? { ...p, title: e.target.value } : p)}
                    placeholder="Summer Sale — 20% Off All Peptides"
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
                  />
                </div>

                {/* Subtitle */}
                <div>
                  <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Subtitle</label>
                  <input
                    value={editing.subtitle}
                    onChange={e => setEditing(p => p ? { ...p, subtitle: e.target.value } : p)}
                    placeholder="Use code SUMMER20 at checkout"
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
                  />
                </div>

                {/* CTA */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Button Text</label>
                    <input
                      value={editing.ctaText}
                      onChange={e => setEditing(p => p ? { ...p, ctaText: e.target.value } : p)}
                      placeholder="Shop Now"
                      className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Button URL</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#2a4a7a]" />
                      <input
                        value={editing.ctaUrl}
                        onChange={e => setEditing(p => p ? { ...p, ctaUrl: e.target.value } : p)}
                        placeholder="/products"
                        className="w-full pl-10 pr-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Placement */}
                <div>
                  <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Placement</label>
                  <select
                    value={editing.placement}
                    onChange={e => setEditing(p => p ? { ...p, placement: e.target.value as Advert['placement'] } : p)}
                    className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px] appearance-none cursor-pointer"
                  >
                    {PLACEMENTS.map(pl => (
                      <option key={pl.value} value={pl.value}>{pl.label} — {pl.desc}</option>
                    ))}
                  </select>
                </div>

                {/* Image upload */}
                <div>
                  <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Background Image (optional)</label>
                  {editing.imageUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-white/[0.08] aspect-[3/1]">
                      <img src={editing.imageUrl} alt="preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setEditing(p => p ? { ...p, imageUrl: '' } : p)}
                        aria-label="Remove advert image"
                        className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center bg-red-600/80 hover:bg-red-600 rounded-lg text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/[0.12] rounded-xl py-8 cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group">
                      {uploading ? (
                        <>
                          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                          <span className="text-xs text-[#9cb8d9]">Uploading {uploadProgress}%...</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-6 h-6 text-[#2a4a7a] group-hover:text-blue-400 transition-colors" />
                          <span className="text-xs text-[#9cb8d9]">Click to upload image</span>
                          <span className="text-[10px] text-[#2a4a7a]">JPG, PNG, WebP up to 5MB</span>
                        </>
                      )}
                      <input
                        type="file" className="hidden" accept="image/*"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                      />
                    </label>
                  )}
                </div>

                {/* Colours */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Background Colour</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color" value={editing.bgColor}
                        onChange={e => setEditing(p => p ? { ...p, bgColor: e.target.value } : p)}
                        className="w-9 h-9 rounded-lg cursor-pointer border border-white/[0.08] bg-transparent"
                      />
                      <input
                        value={editing.bgColor}
                        onChange={e => setEditing(p => p ? { ...p, bgColor: e.target.value } : p)}
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-1.5">Text Colour</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color" value={editing.textColor}
                        onChange={e => setEditing(p => p ? { ...p, textColor: e.target.value } : p)}
                        className="w-9 h-9 rounded-lg cursor-pointer border border-white/[0.08] bg-transparent"
                      />
                      <input
                        value={editing.textColor}
                        onChange={e => setEditing(p => p ? { ...p, textColor: e.target.value } : p)}
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between py-3 px-4 bg-[#0d1f35] rounded-xl border border-white/[0.07]">
                  <div>
                    <p className="text-[#e8f0fe] text-sm font-medium">Set as Live</p>
                    <p className="text-[#2a4a7a] text-xs">Immediately visible on the website</p>
                  </div>
                  <button
                    onClick={() => setEditing(p => p ? { ...p, isActive: !p.isActive } : p)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${editing.isActive ? 'bg-blue-600' : 'bg-[#0f2640]'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editing.isActive ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* Live preview */}
                {editing.title && (
                  <div>
                    <label className="block text-xs font-semibold text-[#9cb8d9] uppercase tracking-wider mb-2">Preview</label>
                    <div
                      className="rounded-xl p-5 relative overflow-hidden"
                      style={{ background: editing.imageUrl ? undefined : editing.bgColor, color: editing.textColor }}
                    >
                      {editing.imageUrl && (
                        <div className="absolute inset-0">
                          <img src={editing.imageUrl} alt="" className="w-full h-full object-cover opacity-40" />
                        </div>
                      )}
                      <div className="relative">
                        <p className="font-bold text-base">{editing.title}</p>
                        {editing.subtitle && <p className="text-sm opacity-80 mt-0.5">{editing.subtitle}</p>}
                        {editing.ctaText && (
                          <span className="inline-block mt-3 px-4 py-1.5 bg-white/20 border border-white/30 rounded-lg text-xs font-semibold cursor-default">
                            {editing.ctaText} →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/[0.07] flex gap-3">
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2.5 border border-white/[0.08] text-[#9cb8d9] hover:text-white hover:border-white/20 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isNew ? 'Create Advert' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
