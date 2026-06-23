import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Save, Plus, Trash2, Upload, Eye, Image as ImageIcon,
  Loader2, MoveVertical, Star, ImagePlus, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, Crown, Link2, FlaskConical, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { updateProduct, addProduct, storage, storageRef, uploadBytesResumable, getDownloadURL } from '@/lib/firebase';
import type { Product, ProductVariant } from '@/lib/firebase';
import { getAdminIdToken } from '@/lib/auth-ready';
import { uploadHplcImageAdmin } from '@/lib/hplc-upload.functions';
import { uploadCoaPdf } from '@/lib/coa-upload.functions';
import { MerchantFeedPreview } from './MerchantFeedPreview';

interface ProductEditorProps {
  product?: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product) => void;
}

const CATEGORIES = ['tissue-repair', 'metabolic-signaling', 'cellular-aging', 'neurological', 'melanin', 'blends', 'accessories'];
const MAX_IMAGES = 4;

const generateSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const validateSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

// ── Image compression — re-encode every upload to WebP ≤ 200 KB ──────────────
// Shared helper so Banner + Inventory uploads behave identically. Hard ceiling
// keeps Lighthouse mobile page weight under control (the 15 MB blow-up was
// uncompressed PNGs sitting in Firebase Storage).
import { compressToWebp } from '@/lib/imageCompress';

async function compressImage(file: File, maxPx = 1600, quality = 0.82): Promise<File> {
  return compressToWebp(file, { maxPx, quality, targetBytes: 200_000 });
}

// ── Upload helper ─────────────────────────────────────────────────────────────
function uploadToStorage(file: File, path: string, onProgress?: (p: number) => void): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const { validateImageFile } = await import('@/lib/upload-validation');
      await validateImageFile(file);
    } catch (err) {
      reject(err);
      return;
    }
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file, {
      contentType: file.type || 'image/webp',
    });
    task.on('state_changed',
      (s) => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.readAsDataURL(file);
  });
}

// ── Single image slot ─────────────────────────────────────────────────────────
interface ImageSlotProps {
  url: string | null;
  index: number;
  isPrimary: boolean;
  uploading: boolean;
  uploadProgress: number;
  uploadError: string;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onUpload: (file: File, index: number) => void;
  onRemove: (index: number) => void;
  onSetPrimary: (index: number) => void;
  onMoveLeft: (index: number) => void;
  onMoveRight: (index: number) => void;
  onSetUrl: (url: string, index: number) => void;
}

function ImageSlot({ url, index, isPrimary, uploading, uploadProgress, uploadError, canMoveLeft, canMoveRight, onUpload, onRemove, onSetPrimary, onMoveLeft, onMoveRight, onSetUrl }: ImageSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlPreviewOk, setUrlPreviewOk] = useState<boolean | null>(null); // null=unchecked, true=ok, false=broken

  const isValidUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };

  // Auto-check preview whenever draft changes to a valid-looking URL
  useEffect(() => {
    const trimmed = urlDraft.trim();
    if (!trimmed || !isValidUrl(trimmed)) { setUrlPreviewOk(null); return; }
    setUrlPreviewOk(null);
    const img = new Image();
    const timer = setTimeout(() => { img.src = trimmed; }, 400); // debounce
    img.onload = () => setUrlPreviewOk(true);
    img.onerror = () => setUrlPreviewOk(false);
    return () => { clearTimeout(timer); img.onload = null; img.onerror = null; };
  }, [urlDraft]);

  const commitUrl = () => {
    const trimmed = urlDraft.trim();
    if (trimmed && isValidUrl(trimmed)) { onSetUrl(trimmed, index); setUrlDraft(''); setUrlPreviewOk(null); }
    setShowUrlInput(false);
  };

  const openUrlInput = () => { setShowUrlInput(true); setUrlDraft(''); setUrlPreviewOk(null); };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative group aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200"
        style={{ borderColor: isPrimary ? '#2563eb' : url ? 'rgba(255,255,255,0.1)' : uploadError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.05)' }}>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f, index); e.target.value = ''; }} />

        {uploading ? (
          <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <div className="w-3/4 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
            <span className="text-gray-400 text-xs">{uploadProgress}%</span>
          </div>
        ) : url ? (
          <>
            <img src={url} alt={`Image ${index + 1}`} className="w-full h-full object-contain bg-[#04101f]" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
              {/* Move row */}
              <div className="flex items-center gap-1">
                <button onClick={() => onMoveLeft(index)} disabled={!canMoveLeft}
                  className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-25 disabled:cursor-not-allowed text-white rounded-lg transition-colors" title="Move left" aria-label="Move image left">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onMoveRight(index)} disabled={!canMoveRight}
                  className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-25 disabled:cursor-not-allowed text-white rounded-lg transition-colors" title="Move right" aria-label="Move image right">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Action row */}
              <div className="flex items-center gap-1">
                <button onClick={() => inputRef.current?.click()}
                  className="w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors" title="Replace" aria-label="Replace image">
                  <Upload className="w-3.5 h-3.5" />
                </button>
                {!isPrimary && (
                  <button onClick={() => onSetPrimary(index)}
                    className="w-9 h-9 flex items-center justify-center bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors" title="Set as main" aria-label="Set as main image">
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => onRemove(index)}
                  className="w-9 h-9 flex items-center justify-center bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors" title="Remove" aria-label="Remove image">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {isPrimary && (
              <div className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" /> Main
              </div>
            )}
            <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white/60 text-[10px] px-1 py-0.5 rounded font-mono">{index + 1}</div>
          </>
        ) : uploadError ? (
          /* Upload failed — clear actionable error with URL fallback */
          <div className="absolute inset-0 bg-[#0d0a0a]/90 flex flex-col items-center justify-center gap-2 p-2">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            {uploadError === 'permission' ? (
              <>
                <p className="text-red-300 text-[9px] text-center leading-tight font-semibold">Storage rules not deployed</p>
                <p className="text-red-400/70 text-[9px] text-center leading-tight">Firebase Console → Storage → Rules → Publish</p>
              </>
            ) : (
              <p className="text-red-300 text-[10px] text-center leading-tight">{uploadError}</p>
            )}
            <button onClick={() => inputRef.current?.click()}
              className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-md transition-colors">
              Retry upload
            </button>
            <button onClick={openUrlInput}
              className="text-[10px] text-blue-400 hover:text-blue-300 underline transition-colors">
              Use image URL instead
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gray-900/80 hover:bg-gray-800 transition-colors cursor-pointer"
            onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-6 h-6 text-gray-600 group-hover:text-gray-400 transition-colors" />
            <span className="text-gray-600 group-hover:text-gray-400 text-[10px] transition-colors">
              {index === 0 ? 'Main photo' : `Photo ${index + 1}`}
            </span>
            <button
              onClick={e => { e.stopPropagation(); openUrlInput(); }}
              className="text-[10px] text-blue-500 hover:text-blue-400 underline transition-colors">
              or paste URL
            </button>
          </div>
        )}
      </div>

      {/* URL input panel with live preview */}
      {showUrlInput && (
        <div className="flex flex-col gap-1.5 bg-[#0b1a30] border border-white/[0.08] rounded-xl p-2">
          <div className="flex gap-1">
            <input
              autoFocus
              value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onPaste={e => {
                const text = e.clipboardData.getData('text').trim();
                if (isValidUrl(text)) {
                  e.preventDefault();
                  setUrlDraft(text);
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter') commitUrl(); if (e.key === 'Escape') { setShowUrlInput(false); setUrlDraft(''); } }}
              placeholder="https://example.com/image.jpg"
              className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <button
              onClick={commitUrl}
              disabled={!isValidUrl(urlDraft.trim()) || urlPreviewOk === false}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors">
              ✓
            </button>
            <button onClick={() => { setShowUrlInput(false); setUrlDraft(''); }} className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition-colors">
              ✕
            </button>
          </div>
          {/* Live preview / validation feedback */}
          {urlDraft.trim() && (
            <div className="flex items-center gap-2">
              {urlPreviewOk === null && isValidUrl(urlDraft.trim()) && (
                <span className="text-[#3a5a82] text-[10px]">Checking image…</span>
              )}
              {urlPreviewOk === true && (
                <>
                  <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                  <span className="text-green-400 text-[10px]">Image found</span>
                  <img src={urlDraft.trim()} alt="preview" className="w-8 h-8 rounded object-cover border border-white/10 ml-auto" />
                </>
              )}
              {urlPreviewOk === false && (
                <>
                  <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                  <span className="text-red-400 text-[10px]">Can't load this URL — check it's a direct image link</span>
                </>
              )}
              {!isValidUrl(urlDraft.trim()) && urlDraft.trim().length > 3 && (
                <>
                  <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-amber-400 text-[10px]">Must start with https://</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────
export function ProductEditor({ product, isOpen, onClose, onSave }: ProductEditorProps) {
  // Stable ID for uploads — reuse across re-renders, even for new products
  const pendingId = useRef<string>(product?.id || `new_${Date.now()}`);

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '', description: '', price: 0, category: 'metabolic',
    sku: '', stock: 0, lowStockThreshold: 10, images: [],
    purity: '99%+', visibility: 'active', variants: [], displayOrder: 0,
  });
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [draggedVariantIdx, setDraggedVariantIdx] = useState<number | null>(null);

  // Per-slot upload state (4 image slots)
  const [slotUploading, setSlotUploading] = useState<boolean[]>([false, false, false, false]);
  const [slotProgress, setSlotProgress] = useState<number[]>([0, 0, 0, 0]);
  const [slotErrors, setSlotErrors] = useState<string[]>(['', '', '', '']);

  // Banner upload state
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerProgress, setBannerProgress] = useState(0);
  const [bannerError, setBannerError] = useState('');
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (product) {
      pendingId.current = product.id;
      setFormData({ ...product, variants: product.variants || [] });
      setBannerUrl((product as any).bannerImageUrl || '');
    } else {
      pendingId.current = `new_${Date.now()}`;
      setFormData({ name: '', description: '', price: 0, category: 'metabolic', sku: '', stock: 0, lowStockThreshold: 10, images: [], purity: '99%+', visibility: 'active', variants: [], displayOrder: 0 });
      setBannerUrl('');
    }
  }, [product]);

  // ── Image slot handlers ───────────────────────────────────────────────────
  const handleSlotUpload = useCallback(async (file: File, index: number) => {
    setSlotUploading(prev => { const n = [...prev]; n[index] = true; return n; });
    setSlotProgress(prev => { const n = [...prev]; n[index] = 0; return n; });
    setSlotErrors(prev => { const n = [...prev]; n[index] = ''; return n; });
    try {
      const compressed = await compressImage(file);
      const pid = pendingId.current;
      const path = `products/${pid}/images/img${index + 1}_${Date.now()}.webp`;
      const url = await uploadToStorage(compressed, path, (p) => {
        setSlotProgress(prev => { const n = [...prev]; n[index] = p; return n; });
      });
      setFormData(prev => {
        const imgs = [...(prev.images || ['', '', '', ''])];
        while (imgs.length < MAX_IMAGES) imgs.push('');
        imgs[index] = url;
        return { ...prev, images: imgs, imageUrl: imgs[0] || prev.imageUrl };
      });
    } catch (e: any) {
      console.error('Upload failed:', e);
      const msg = String(e?.message || e?.code || '');
      const isPermission = e?.code === 'storage/unauthorized'
        || msg.includes('permission')
        || msg.includes('unauthorized')
        || msg.includes('403')
        || e?.code === 'storage/unknown';
      setSlotErrors(prev => {
        const n = [...prev];
        n[index] = isPermission ? 'permission' : (e?.message || 'failed');
        return n;
      });
    } finally {
      setSlotUploading(prev => { const n = [...prev]; n[index] = false; return n; });
    }
  }, []);

  const handleSetUrl = useCallback((url: string, index: number) => {
    setSlotErrors(prev => { const n = [...prev]; n[index] = ''; return n; });
    setFormData(prev => {
      const imgs = [...(prev.images || ['', '', '', ''])];
      while (imgs.length < MAX_IMAGES) imgs.push('');
      imgs[index] = url;
      return { ...prev, images: imgs, imageUrl: imgs[0] || prev.imageUrl };
    });
  }, []);

  const handleSlotRemove = (index: number) => {
    setFormData(prev => {
      const imgs = [...(prev.images || [])];
      imgs[index] = '';
      return { ...prev, images: imgs, imageUrl: imgs.find(u => u) || '' };
    });
  };

  const handleSetPrimary = (index: number) => {
    setFormData(prev => {
      const imgs = [...(prev.images || [])];
      const [moved] = imgs.splice(index, 1);
      imgs.unshift(moved);
      return { ...prev, images: imgs, imageUrl: moved };
    });
  };

  const handleMoveSlot = (index: number, direction: 'left' | 'right') => {
    setFormData(prev => {
      const imgs = [...(prev.images || ['', '', '', ''])];
      while (imgs.length < MAX_IMAGES) imgs.push('');
      const swapIdx = direction === 'left' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= MAX_IMAGES) return prev;
      [imgs[index], imgs[swapIdx]] = [imgs[swapIdx], imgs[index]];
      return { ...prev, images: imgs, imageUrl: imgs[0] || prev.imageUrl };
    });
  };

  // ── Banner upload ─────────────────────────────────────────────────────────
  const handleBannerUpload = async (file: File) => {
    setBannerError('');
    setBannerUploading(true);
    setBannerProgress(0);
    try {
      const compressed = await compressImage(file, 1920, 0.85);
      const pid = pendingId.current;
      const path = `products/${pid}/banner/banner.webp`;
      const url = await uploadToStorage(compressed, path, setBannerProgress);
      setBannerUrl(url);
    } catch (e: any) {
      setBannerError(e?.message || 'Upload failed');
    } finally {
      setBannerUploading(false);
    }
  };

  // ── Variant handlers ──────────────────────────────────────────────────────
  const addVariant = () => {
    if ((formData.variants?.length ?? 0) >= 4) return;
    const newVariant: ProductVariant = {
      id: `v${Date.now()}`, name: '', sku: '', stock: 0, price: formData.price || 0,
    };
    setFormData(prev => ({ ...prev, variants: [...(prev.variants || []), newVariant] }));
  };

  const updateVariant = (idx: number, field: keyof ProductVariant, value: string | number | boolean) => {
    setFormData(prev => {
      const variants = [...(prev.variants || [])];
      variants[idx] = { ...variants[idx], [field]: value };
      return { ...prev, variants };
    });
  };

  // HPLC chromatogram upload (per variant) — uses same Firebase Storage path.
  const uploadHplcImage = async (idx: number, file: File) => {
    try {
      const compressed = await compressImage(file, 1400, 0.85);
      const pid = pendingId.current;
      const idToken = await getAdminIdToken();
      const base64 = await fileToBase64(compressed);
      const uploaded = await uploadHplcImageAdmin({
        data: {
          idToken,
          productId: pid,
          variantIndex: idx,
          contentType: compressed.type || 'image/webp',
          base64,
        },
      });
      const url = uploaded.url;
      updateVariant(idx, 'hplcImageUrl', url);
      updateVariant(idx, 'hplcTested', true);
      updateVariant(idx, 'hplcTestedAt', new Date().toISOString());
    } catch (e: any) {
      const msg = String(e?.message || e?.code || '');
      const isPermission = e?.code === 'storage/unauthorized' || msg.includes('permission') || msg.includes('unauthorized') || msg.includes('403');
      setSaveMsg({ type: 'error', text: isPermission ? 'HPLC upload blocked: admin permission could not be verified. Sign in again and retry.' : (e?.message || 'HPLC upload failed') });
    }
  };

  const removeVariant = (idx: number) => {
    setFormData(prev => ({ ...prev, variants: (prev.variants || []).filter((_, i) => i !== idx) }));
  };

  const handleDragStart = (idx: number) => setDraggedVariantIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedVariantIdx === null || draggedVariantIdx === idx) return;
    setFormData(prev => {
      const variants = [...(prev.variants || [])];
      const [moved] = variants.splice(draggedVariantIdx, 1);
      variants.splice(idx, 0, moved);
      setDraggedVariantIdx(idx);
      return { ...prev, variants };
    });
  };
  const handleDragEnd = () => setDraggedVariantIdx(null);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.name?.trim()) { setSaveMsg({ type: 'error', text: 'Product name is required' }); return; }
    // Auto-sanitize admin copy into laboratory RUO-safe language, then run the
    // compliance guard. Lets editors paste freely while keeping Firestore
    // content compliant (e.g. "therapeutic" → "in-vitro endpoint").
    const { sanitizeLab } = await import('@/lib/lab-sanitize');
    const { checkComplianceAndLog } = await import('@/lib/compliance-guard');
    const sanitizedName = sanitizeLab((formData as any).name) || formData.name;
    const sanitizedDescription = sanitizeLab((formData as any).description);
    const sanitizedShort = sanitizeLab((formData as any).shortDescription);
    if (sanitizedName !== formData.name
      || sanitizedDescription !== (formData as any).description
      || sanitizedShort !== (formData as any).shortDescription) {
      setFormData(prev => ({
        ...prev,
        name: sanitizedName,
        description: sanitizedDescription,
        shortDescription: sanitizedShort,
      } as any));
    }
    for (const [field, value] of [
      ['name', sanitizedName],
      ['description', sanitizedDescription],
      ['shortDescription', sanitizedShort],
    ] as const) {
      const c = checkComplianceAndLog(field, value as string | null | undefined, {
        collection: 'products',
        docId: product?.id ?? null,
      });
      if (!c.ok) {
        setSaveMsg({ type: 'error', text: `${c.message}. Auto-rewrite couldn't fully clean this — edit the highlighted word and try again.` });
        return;
      }
    }
    // Persist the sanitized values
    (formData as any).name = sanitizedName;
    (formData as any).description = sanitizedDescription;
    (formData as any).shortDescription = sanitizedShort;
    setSaving(true); setSaveMsg(null);
    try {
      const cleanImages = (formData.images || []).filter(Boolean);
      const dataToSave = {
        ...formData,
        images: cleanImages,
        imageUrl: cleanImages[0] || formData.imageUrl || '',
        bannerImageUrl: bannerUrl || '',
        price: Number(formData.price) || 0,
        stock: Number(formData.stock) || 0,
        variants: formData.variants || [],
      };
      if (product?.id) {
        await updateProduct(product.id, dataToSave as Partial<Product>);
        onSave({ ...product, ...dataToSave } as Product);
      } else {
        const newId = await addProduct(dataToSave as Omit<Product, 'id'>);
        onSave({ ...dataToSave, id: newId } as Product);
      }
      setSaveMsg({ type: 'success', text: 'Product saved!' });
      setTimeout(() => { setSaveMsg(null); onClose(); }, 1200);
    } catch (e: any) {
      // Provide more specific error messages for common issues
      let errorText = 'Save failed';
      if (e?.code === 'permission-denied') {
        errorText = 'Permission denied: Check Firestore security rules';
      } else if (e?.message?.includes('permission')) {
        errorText = 'Permission error: You may not have write access';
      } else if (e?.message) {
        errorText = e.message;
      }
      setSaveMsg({ type: 'error', text: errorText });
      console.error('ProductEditor save error:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Build a padded 4-slot array
  const imageSlots: (string | null)[] = Array.from({ length: MAX_IMAGES }, (_, i) => formData.images?.[i] || null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-3xl max-h-[90vh] sm:max-h-[92vh] flex flex-col bg-[#0b1a30] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">
                {product ? 'Edit Product' : 'New Product'}
              </h2>
              {product && <p className="text-gray-500 text-xs">{product.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${previewMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              <Eye className="w-3.5 h-3.5" />
              {previewMode ? 'Edit' : 'Preview'}
            </button>
            <button onClick={onClose} aria-label="Close editor" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {previewMode ? (
            /* ── Preview ── */
            <div className="space-y-4">
              {bannerUrl && (
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <img src={bannerUrl} alt="Banner" className="w-full object-cover max-h-[160px]" />
                </div>
              )}
              <div className="grid grid-cols-4 gap-3">
                {imageSlots.map((url, i) => url ? (
                  <div key={i} className={`aspect-square rounded-xl overflow-hidden border-2 ${i === 0 ? 'border-blue-500' : 'border-white/10'}`}>
                    <img src={url} alt={`img ${i+1}`} className="w-full h-full object-contain bg-[#04101f]" />
                  </div>
                ) : null)}
              </div>
              <div>
                <span className="inline-block bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-sm mb-2 capitalize">{formData.category}</span>
                <h1 className="text-2xl font-bold text-white">{formData.name || 'Product Name'}</h1>
                <p className="text-gray-400 text-sm mt-1">{formData.purity}</p>
                <p className="text-xl font-bold text-white mt-2">£{(Number(formData.price) || 0).toFixed(2)}</p>
                <p className="text-gray-300 mt-3 text-sm leading-relaxed">{formData.description || 'No description'}</p>
                {(formData.variants?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-400 mb-2">Variants:</p>
                    <div className="flex flex-wrap gap-2">
                      {formData.variants!.map(v => (
                        <span key={v.id} className="px-3 py-1 bg-gray-800 border border-white/10 rounded-lg text-white text-sm">
                          {v.name} · £{(v.price || Number(formData.price) || 0).toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Edit ── */
            <>
              {/* Basic Info */}
              <div className="bg-gray-800/40 border border-white/[0.07] rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Basic Info</h3>
                <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Product Name *</label>
                    <input type="text" value={formData.name || ''} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. BPC-157"
                      className="w-full px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                    <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all capitalize">
                      {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Base Price (£)</label>
                    <input type="number" value={formData.price || ''} onChange={e => setFormData(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                      step="0.01" placeholder="0.00"
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">SKU</label>
                    <input type="text" value={formData.sku || ''} onChange={e => setFormData(p => ({ ...p, sku: e.target.value }))}
                      placeholder="PHP-BPC157"
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Purity</label>
                    <input type="text" value={formData.purity || ''} onChange={e => setFormData(p => ({ ...p, purity: e.target.value }))}
                      placeholder="99%+"
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Visibility</label>
                    <select value={formData.visibility} onChange={e => setFormData(p => ({ ...p, visibility: e.target.value as any }))}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all">
                      <option value="active">Active</option>
                      <option value="hidden">Hidden</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </select>
                  </div>
                </div>

                {/* VIP Product Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">VIP Exclusive</p>
                      <p className="text-[#9cb8d9] text-xs">Only visible to VIP members in /vip store</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, isVip: !(p as any).isVip } as any))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${(formData as any).isVip ? 'bg-amber-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(formData as any).isVip ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* Popular Badge Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-orange-500/[0.06] border border-orange-500/20 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <Star className="w-3.5 h-3.5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Popular Badge</p>
                      <p className="text-[#9cb8d9] text-xs">Shows a "Popular" badge on the product card</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, popular: !(p as any).popular } as any))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${(formData as any).popular ? 'bg-orange-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(formData as any).popular ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* Research Gate Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-purple-500/[0.06] border border-purple-500/20 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">Requires Research Confirmation</p>
                      <p className="text-[#9cb8d9] text-xs">Shows research-use confirmation gate before adding to cart</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, requiresResearchGate: !(p as any).requiresResearchGate } as any))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${(formData as any).requiresResearchGate ? 'bg-purple-500' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(formData as any).requiresResearchGate ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* URL Slug */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    URL Slug
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm shrink-0">/products/</span>
                    <input
                      type="text"
                      value={(formData as any).slug || ''}
                      onChange={e => setFormData(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') } as any))}
                      onBlur={e => {
                        // Auto-generate from name if empty
                        if (!e.target.value && formData.name) {
                          setFormData(p => ({ ...p, slug: generateSlug(p.name || '') } as any));
                        }
                      }}
                      placeholder={formData.name ? generateSlug(formData.name) : 'e.g. bpc-157-5mg'}
                      className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, slug: generateSlug(p.name || '') } as any))}
                      className="px-3 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors shrink-0"
                      title="Auto-generate from product name"
                    >
                      Auto
                    </button>
                  </div>
                  {(formData as any).slug && !validateSlug((formData as any).slug) && (
                    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Lowercase letters, numbers and hyphens only
                    </p>
                  )}
                  {(formData as any).slug && validateSlug((formData as any).slug) && (
                    <p className="text-emerald-600 text-xs mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      URL: /products/{(formData as any).slug}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
                  <textarea value={formData.description || ''} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                    rows={3} placeholder="Describe the product..."
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-900/40 border border-white/[0.05] rounded-lg">
                  <input
                    id="includeInMerchantFeed"
                    type="checkbox"
                    checked={(formData as any).includeInMerchantFeed === true}
                    onChange={e => setFormData(p => ({ ...p, includeInMerchantFeed: e.target.checked } as any))}
                    className="mt-0.5 w-4 h-4 accent-emerald-500"
                  />
                  <label htmlFor="includeInMerchantFeed" className="text-xs text-white/80 leading-relaxed cursor-pointer">
                    <span className="font-medium">Include in Google / Bing Merchant feed</span>
                    <span className="block text-white/50 mt-0.5">Manual opt-in. Products are excluded by default — tick this box to publish the product to google-merchant-feed.xml and bing-feed.xml.</span>
                  </label>
                </div>
              </div>

              <MerchantFeedPreview product={formData as any} baseline={(product as any) || null} />

              {/* Product Images — 4 slots */}
              <div className="bg-gray-800/40 border border-white/[0.07] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Product Photos</h3>
                    <p className="text-gray-600 text-xs mt-0.5">Up to 4 images · hover to move/remove · or paste a URL</p>
                  </div>
                  <span className="text-gray-500 text-xs font-mono bg-gray-900/60 px-2 py-1 rounded-lg">
                    {imageSlots.filter(Boolean).length}/{MAX_IMAGES}
                  </span>
                </div>

                {/* Storage permission warning */}
                {slotErrors.some(e => e === 'permission') && (
                  <div className="mb-3 flex items-start gap-2.5 p-3 bg-red-950/60 border border-red-500/30 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="text-red-300 font-semibold mb-1">Firebase Storage permission denied</p>
                      <p className="text-red-400/80 mb-2">You need to deploy the storage rules to Firebase Console. Go to: <span className="font-mono text-red-300">Firebase Console → Storage → Rules</span> and paste the rules from <span className="font-mono text-red-300">storage.rules</span>.</p>
                      <p className="text-red-400/70">In the meantime, use the <span className="text-white font-medium">"or paste URL"</span> option under each slot to add images via external link.</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-3">
                  {imageSlots.map((url, i) => (
                    <ImageSlot
                      key={i}
                      url={url}
                      index={i}
                      isPrimary={i === 0}
                      uploading={slotUploading[i]}
                      uploadProgress={slotProgress[i]}
                      uploadError={slotErrors[i]}
                      canMoveLeft={i > 0 && !!imageSlots[i - 1]}
                      canMoveRight={i < MAX_IMAGES - 1 && !!imageSlots[i + 1]}
                      onUpload={handleSlotUpload}
                      onRemove={handleSlotRemove}
                      onSetPrimary={handleSetPrimary}
                      onMoveLeft={(idx) => handleMoveSlot(idx, 'left')}
                      onMoveRight={(idx) => handleMoveSlot(idx, 'right')}
                      onSetUrl={handleSetUrl}
                    />
                  ))}
                </div>
              </div>

              {/* Product Banner */}
              <div className="bg-gray-800/40 border border-white/[0.07] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Product Banner</h3>
                    <p className="text-gray-600 text-xs mt-0.5">Wide promo image shown at top of product page · recommended 1920×400</p>
                  </div>
                  <input ref={bannerInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleBannerUpload(f); e.target.value = ''; }} />
                  <button onClick={() => bannerInputRef.current?.click()} disabled={bannerUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                    {bannerUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {bannerUploading ? `${bannerProgress}%` : 'Upload Banner'}
                  </button>
                </div>
                {bannerError && (
                  <div className="flex flex-col gap-2 mb-3">
                    <p className="flex items-center gap-1.5 text-red-400 text-xs"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{bannerError.includes('permission') || bannerError.includes('unauthorized') ? 'Storage permission denied — paste a URL instead:' : bannerError}</p>
                    <div className="flex gap-1.5">
                      <input
                        placeholder="Paste banner image URL…"
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { setBannerUrl(v); setBannerError(''); (e.target as HTMLInputElement).value = ''; } } }}
                        onBlur={e => { const v = e.target.value.trim(); if (v) { setBannerUrl(v); setBannerError(''); e.target.value = ''; } }}
                      />
                    </div>
                  </div>
                )}
                {bannerUploading && (
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${bannerProgress}%` }} />
                  </div>
                )}
                {bannerUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/10 group">
                    <img src={bannerUrl} alt="Banner preview" className="w-full object-cover h-[120px]" />
                    <button onClick={() => setBannerUrl('')}
                      className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div onClick={() => bannerInputRef.current?.click()}
                      className="w-full h-16 border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-xl flex items-center justify-center cursor-pointer transition-colors group">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-gray-600 group-hover:text-purple-400 transition-colors" />
                        <p className="text-gray-600 group-hover:text-gray-400 text-xs transition-colors">Click to upload banner</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        placeholder="…or paste banner image URL here"
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { setBannerUrl(v); (e.target as HTMLInputElement).value = ''; } } }}
                        onBlur={e => { const v = e.target.value.trim(); if (v) { setBannerUrl(v); e.target.value = ''; } }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Variants — max 4 */}
              <div className="bg-gray-800/40 border border-white/[0.07] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Variants</h3>
                    <p className="text-gray-600 text-xs mt-0.5">Up to 4 variants · drag to reorder</p>
                  </div>
                  <button onClick={addVariant} disabled={(formData.variants?.length ?? 0) >= 4}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Variant
                    {(formData.variants?.length ?? 0) > 0 && (
                      <span className="ml-1 bg-blue-800 text-blue-200 text-[10px] px-1.5 rounded-full">
                        {formData.variants?.length}/4
                      </span>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {(formData.variants?.length ?? 0) === 0 && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-gray-600 text-sm text-center py-4 border border-dashed border-white/5 rounded-xl">
                      No variants yet — add up to 4 (e.g. 5mg, 10mg, 20mg, 50mg)
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  {formData.variants?.map((variant, idx) => (
                    <motion.div
                      key={variant.id}
                      layout
                      className={`p-3 bg-white border border-gray-300 rounded-lg transition-opacity ${draggedVariantIdx === idx ? 'opacity-40' : ''}`}
                    >
                      <div
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className="flex items-center gap-2 cursor-move"
                      >
                      <MoveVertical className="w-4 h-4 text-gray-500 shrink-0" />
                      <div className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-md px-1.5 py-0.5 shrink-0 min-w-[20px] justify-center">
                        {idx + 1}
                      </div>
                      <input type="text" value={variant.name}
                        onChange={e => updateVariant(idx, 'name', e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        placeholder="e.g. 10mg" />
                      <input type="text" value={variant.sku}
                        onChange={e => updateVariant(idx, 'sku', e.target.value)}
                        className="w-24 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        placeholder="SKU" />
                      <div className="relative w-20">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">£</span>
                        <input type="number" value={variant.price || ''}
                          onChange={e => updateVariant(idx, 'price', parseFloat(e.target.value) || 0)}
                          className="w-full pl-7 pr-2 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                          placeholder="0.00" step="0.01" />
                      </div>
                      <input type="number" value={variant.stock}
                        onChange={e => updateVariant(idx, 'stock', parseInt(e.target.value) || 0)}
                        className="w-16 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        placeholder="Qty" />
                      {/* Image slot selector */}
                      {(formData.images?.filter(Boolean).length ?? 0) > 1 && (
                        <select
                          value={variant.imageIndex ?? idx}
                          onChange={e => updateVariant(idx, 'imageIndex', parseInt(e.target.value))}
                          title="Which photo to show when this variant is selected"
                          className="w-20 px-2 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                        >
                          {(formData.images || []).map((url, si) => url ? (
                            <option key={si} value={si}>Photo {si + 1}</option>
                          ) : null)}
                        </select>
                      )}
                      <button onClick={() => removeVariant(idx)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      </div>

                      {/* HPLC test row — per-variant chromatogram + tested toggle */}
                      <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!variant.hplcTested}
                            onChange={e => updateVariant(idx, 'hplcTested', e.target.checked)}
                            className="rounded"
                          />
                          HPLC tested ≥99%
                        </label>
                        <label className="text-xs text-blue-700 hover:text-blue-900 cursor-pointer underline">
                          {variant.hplcImageUrl ? 'Replace HPLC photo' : 'Upload HPLC photo'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) uploadHplcImage(idx, f);
                            }}
                          />
                        </label>
                        {variant.hplcImageUrl && (
                          <>
                            <a href={variant.hplcImageUrl} target="_blank" rel="noopener noreferrer">
                              <img src={variant.hplcImageUrl} alt="HPLC chromatogram" className="h-10 w-auto rounded border border-gray-300" />
                            </a>
                            <button
                              onClick={() => { updateVariant(idx, 'hplcImageUrl', ''); }}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Remove
                            </button>
                          </>
                        )}
                        {variant.hplcTestedAt && (
                          <span className="text-[10px] text-gray-500 ml-auto">
                            Tested {new Date(variant.hplcTestedAt).toLocaleDateString('en-GB')}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-t border-white/10 bg-[#060f1e]/50">
          <AnimatePresence>
            {saveMsg && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-1.5 text-xs sm:text-sm ${saveMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {saveMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {saveMsg.text}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto w-full sm:w-auto">
            <button onClick={onClose}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-xs sm:text-sm font-medium transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-xs sm:text-sm transition-all shadow-[0_2px_12px_rgba(37,99,235,0.3)] disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Product</>}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
