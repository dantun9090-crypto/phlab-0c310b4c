import { useState, useEffect, useRef } from 'react';
import {
  Image, ToggleLeft, ToggleRight, Save, RefreshCw,
  CheckCircle2, AlertCircle, Loader2, ExternalLink,
  Monitor, Smartphone, Upload, Link2, Trash2, X,
  Move, Maximize2, AlignLeft, Layers, Type, Palette,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, storage, doc, getDoc, setDoc, Timestamp, storageRef, uploadBytesResumable, getDownloadURL } from '@/lib/firebase';

interface BannerConfig {
  active: boolean;
  imageUrl: string;
  linkUrl: string;
  altText: string;
  // Resize & position
  heightPx: number;
  objectPositionX: number;
  objectPositionY: number;
  objectFit: 'cover' | 'contain' | 'fill';
  // Visual overlays
  overlayEnabled: boolean;
  overlayColor: string;        // hex e.g. '#000000'
  overlayOpacity: number;      // 0–80
  gradientEnabled: boolean;
  gradientDirection: 'bottom' | 'top' | 'left' | 'right' | 'center';
  gradientColor: string;
  gradientIntensity: number;   // 0–100
  textOverlayEnabled: boolean;
  textOverlayHeading: string;
  textOverlaySubtext: string;
  textOverlayAlign: 'left' | 'center' | 'right';
  textOverlayPosition: 'top' | 'center' | 'bottom';
  updatedAt?: any;
}

const DEFAULTS: BannerConfig = {
  active: false,
  imageUrl: '',
  linkUrl: '',
  altText: 'Promo Banner',
  heightPx: 320,
  objectPositionX: 50,
  objectPositionY: 50,
  objectFit: 'cover',
  overlayEnabled: false,
  overlayColor: '#000000',
  overlayOpacity: 30,
  gradientEnabled: true,
  gradientDirection: 'bottom',
  gradientColor: '#060f1e',
  gradientIntensity: 60,
  textOverlayEnabled: false,
  textOverlayHeading: '',
  textOverlaySubtext: '',
  textOverlayAlign: 'center',
  textOverlayPosition: 'center',
};

export default function BannerTab() {
  const [banner, setBanner] = useState<BannerConfig>(DEFAULTS);
  const [original, setOriginal] = useState<BannerConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const [imageError, setImageError] = useState(false);
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('file');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadBanner(); }, []);

  const loadBanner = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'settings', 'promoBanner'));
      if (snap.exists()) {
        const data = { ...DEFAULTS, ...snap.data() } as BannerConfig;
        setBanner(data);
        setOriginal(data);
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Failed to load: ' + (e?.message || 'unknown') });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await setDoc(doc(db, 'settings', 'promoBanner'), { ...banner, updatedAt: Timestamp.now() });
      window.dispatchEvent(new CustomEvent('admin:save'));
      setOriginal(banner);
      setMsg({ type: 'success', text: 'Banner saved successfully!' });
      setTimeout(() => setMsg(null), 4000);
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Save failed: ' + (e?.message || 'unknown') });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setImageError(false);
    try {
      const path = `banners/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);
      task.on('state_changed',
        snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        err => { setMsg({ type: 'error', text: 'Upload failed: ' + err.message }); setUploading(false); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setBanner(prev => ({ ...prev, imageUrl: url }));
          setUploading(false);
        }
      );
    } catch (err: any) {
      setMsg({ type: 'error', text: 'Upload error: ' + err.message });
      setUploading(false);
    }
  };

  const set = <K extends keyof BannerConfig>(key: K, val: BannerConfig[K]) =>
    setBanner(prev => ({ ...prev, [key]: val }));

  const isDirty = JSON.stringify(banner) !== JSON.stringify(original);

  const previewHeight = preview === 'desktop' ? banner.heightPx : Math.round(banner.heightPx * 0.7);
  const objectPos = `${banner.objectPositionX}% ${banner.objectPositionY}%`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Image className="w-5 h-5 text-blue-400" /> Promo Banner
          </h2>
          <p className="text-[#2a4a7a] text-sm mt-0.5">Control your homepage banner — resize, reposition, and toggle live.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadBanner} disabled={loading || saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0f2640]/60 hover:bg-[#0f2640] text-[#8caad4] rounded-lg text-sm transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleSave} disabled={saving || !isDirty || uploading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Status message */}
      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${msg.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
            {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
            <button onClick={() => setMsg(null)} aria-label="Close notification" className="ml-auto"><X className="w-3.5 h-3.5" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* ── Left — controls ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Toggle */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-sm">Banner Status</p>
                <p className="text-[#2a4a7a] text-xs mt-0.5">{banner.active ? 'Visible on home page' : 'Hidden from visitors'}</p>
              </div>
              <button
                onClick={() => set('active', !banner.active)}
                aria-label={`Banner status: ${banner.active ? 'visible' : 'hidden'}`}
                aria-pressed={banner.active}
                className="transition-transform active:scale-95"
              >
                {banner.active
                  ? <ToggleRight className="w-10 h-10 text-green-400" />
                  : <ToggleLeft className="w-10 h-10 text-[#2a4a7a]" />}
              </button>
            </div>
          </div>

          {/* Image source */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <p className="text-white font-semibold text-sm flex items-center gap-2">
              <Image className="w-4 h-4 text-blue-400" /> Banner Image
            </p>

            {/* Upload / URL toggle */}
            <div className="flex bg-[#04101f]/60 rounded-lg p-1 gap-1">
              <button onClick={() => setUploadMode('file')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${uploadMode === 'file' ? 'bg-blue-600 text-white' : 'text-[#6b8fba] hover:text-white'}`}>
                <Upload className="w-3.5 h-3.5" /> Upload from PC
              </button>
              <button onClick={() => setUploadMode('url')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${uploadMode === 'url' ? 'bg-blue-600 text-white' : 'text-[#6b8fba] hover:text-white'}`}>
                <Link2 className="w-3.5 h-3.5" /> Paste URL
              </button>
            </div>

            {uploadMode === 'file' ? (
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                {banner.imageUrl && !imageError ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img src={banner.imageUrl} alt="Banner preview" className="w-full h-28 object-cover"
                      onError={() => setImageError(true)} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between p-2">
                      <span className="text-white text-xs font-medium truncate max-w-[60%]">Current banner</span>
                      <div className="flex gap-1">
                        <button onClick={() => fileInputRef.current?.click()}
                          aria-label="Upload banner image"
                          className="w-9 h-9 flex items-center justify-center bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg transition-colors">
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { set('imageUrl', ''); setImageError(false); }}
                          aria-label="Delete banner image"
                          className="w-9 h-9 flex items-center justify-center bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="w-full border-2 border-dashed border-white/10 hover:border-blue-500/50 rounded-xl p-6 flex flex-col items-center gap-2 transition-colors group">
                    {uploading ? (
                      <>
                        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                        <p className="text-[#6b8fba] text-sm">Uploading… {uploadProgress}%</p>
                        <div className="w-full bg-[#0f2640] rounded-full h-1.5 mt-1">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-[#2a4a7a] group-hover:text-blue-400 transition-colors" />
                        <p className="text-[#6b8fba] text-sm">Click to upload image</p>
                        <p className="text-gray-600 text-xs">JPG, PNG, WebP — max 5 MB</p>
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input type="url" value={banner.imageUrl} onChange={e => { set('imageUrl', e.target.value); setImageError(false); }}
                  placeholder="https://example.com/banner.jpg"
                  className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-500 py-3 px-4 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                {banner.imageUrl && !imageError && (
                  <img src={banner.imageUrl} alt="Preview" className="w-full h-20 object-cover rounded-lg border border-white/10"
                    onError={() => setImageError(true)} />
                )}
                {imageError && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Invalid image URL</p>}
              </div>
            )}
          </div>

          {/* Link + Alt text */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-3">
            <p className="text-white font-semibold text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-blue-400" /> Link & Caption
            </p>
            <div>
              <label className="block text-[#6b8fba] text-xs font-medium mb-1.5">Click-through URL (optional)</label>
              <input type="url" value={banner.linkUrl} onChange={e => set('linkUrl', e.target.value)}
                placeholder="https://prohealthpeptides.co.uk/products"
                className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-500 py-2.5 px-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>
            <div>
              <label className="block text-[#6b8fba] text-xs font-medium mb-1.5">Alt Text</label>
              <input type="text" value={banner.altText} onChange={e => set('altText', e.target.value)}
                placeholder="Summer Sale — 20% off all peptides"
                className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-500 py-2.5 px-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>
          </div>

          {/* ── Resize & Position ── */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-4">
            <p className="text-white font-semibold text-sm flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-blue-400" /> Resize & Position
            </p>

            {/* Height */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[#6b8fba] text-xs font-medium">Banner Height</label>
                <span className="text-white text-xs font-mono bg-[#04101f]/60 px-2 py-0.5 rounded">{banner.heightPx}px</span>
              </div>
              <input type="range" min={120} max={600} step={10}
                value={banner.heightPx}
                onChange={e => set('heightPx', Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer" />
              <div className="flex justify-between text-gray-600 text-xs mt-1">
                <span>Small (120px)</span>
                <span>Large (600px)</span>
              </div>
              {/* Quick presets */}
              <div className="flex gap-1.5 mt-2">
                {[{ label: 'Short', val: 180 }, { label: 'Medium', val: 320 }, { label: 'Tall', val: 480 }].map(p => (
                  <button key={p.val} onClick={() => set('heightPx', p.val)}
                    className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${banner.heightPx === p.val ? 'bg-blue-600 text-white' : 'bg-[#0f2640]/60 text-[#6b8fba] hover:text-white hover:bg-[#0f2640]'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Object Fit */}
            <div>
              <label className="block text-[#6b8fba] text-xs font-medium mb-1.5">Image Fit</label>
              <div className="flex gap-1.5">
                {(['cover', 'contain', 'fill'] as const).map(fit => (
                  <button key={fit} onClick={() => set('objectFit', fit)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${banner.objectFit === fit ? 'bg-blue-600 text-white' : 'bg-[#0f2640]/60 text-[#6b8fba] hover:text-white hover:bg-[#0f2640]'}`}>
                    {fit}
                  </button>
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-1">
                {banner.objectFit === 'cover' && 'Image fills the space, cropping edges if needed.'}
                {banner.objectFit === 'contain' && 'Entire image is visible with letterboxing.'}
                {banner.objectFit === 'fill' && 'Image stretches to fill exactly.'}
              </p>
            </div>

            {/* Focal point / position */}
            <div>
              <label className="block text-[#6b8fba] text-xs font-medium mb-2 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5" /> Focal Point (where to look when cropped)
              </label>
              {/* Visual 2D focal point picker */}
              <div className="relative w-full aspect-[3/1] bg-[#04101f]/60 border border-white/10 rounded-xl overflow-hidden cursor-crosshair mb-2"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                  const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
                  setBanner(prev => ({ ...prev, objectPositionX: x, objectPositionY: y }));
                }}>
                {banner.imageUrl && !imageError && (
                  <img src={banner.imageUrl} alt="" className="w-full h-full pointer-events-none"
                    style={{ objectFit: banner.objectFit, objectPosition: objectPos }} />
                )}
                {(!banner.imageUrl || imageError) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-gray-600 text-xs">Upload image to use focal picker</p>
                  </div>
                )}
                {/* Crosshair dot */}
                <div className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${banner.objectPositionX}%`, top: `${banner.objectPositionY}%` }}>
                  <div className="w-5 h-5 rounded-full border-2 border-white shadow-lg bg-white/30 backdrop-blur-sm" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full" />
                  </div>
                </div>
                <p className="absolute bottom-1 left-2 text-white/50 text-[10px]">Click to set focal point</p>
              </div>

              {/* X/Y sliders */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-[#2a4a7a] text-xs flex items-center gap-1"><AlignLeft className="w-3 h-3" /> Horizontal</label>
                    <span className="text-[#6b8fba] text-xs font-mono">{banner.objectPositionX}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={1}
                    value={banner.objectPositionX}
                    onChange={e => set('objectPositionX', Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer" />
                  <div className="flex justify-between text-gray-700 text-[10px] mt-0.5">
                    <span>Left</span><span>Center</span><span>Right</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-[#2a4a7a] text-xs flex items-center gap-1"><ChevronUp className="w-3 h-3" /> Vertical</label>
                    <span className="text-[#6b8fba] text-xs font-mono">{banner.objectPositionY}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={1}
                    value={banner.objectPositionY}
                    onChange={e => set('objectPositionY', Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer" />
                  <div className="flex justify-between text-gray-700 text-[10px] mt-0.5">
                    <span>Top</span><span>Mid</span><span>Bot</span>
                  </div>
                </div>
              </div>

              {/* Quick position presets */}
              <div className="grid grid-cols-3 gap-1 mt-2">
                {[
                  { label: '↖', x: 0,  y: 0 },  { label: '↑', x: 50, y: 0 },  { label: '↗', x: 100, y: 0 },
                  { label: '←', x: 0,  y: 50 }, { label: '·', x: 50, y: 50 }, { label: '→', x: 100, y: 50 },
                  { label: '↙', x: 0,  y: 100 },{ label: '↓', x: 50, y: 100 },{ label: '↘', x: 100, y: 100 },
                ].map(p => (
                  <button key={`${p.x}-${p.y}`}
                    onClick={() => setBanner(prev => ({ ...prev, objectPositionX: p.x, objectPositionY: p.y }))}
                    className={`py-1 rounded-md text-sm transition-colors ${banner.objectPositionX === p.x && banner.objectPositionY === p.y ? 'bg-blue-600 text-white' : 'bg-[#0f2640]/60 text-[#6b8fba] hover:bg-[#0f2640] hover:text-white'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Visual Overlays ── */}
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-5">
            <p className="text-white font-semibold text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-pink-400" /> Visual Overlays
            </p>

            {/* Dark overlay */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[#6b8fba] text-xs font-medium flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#2a4a7a]" /> Colour Tint
                </label>
                <button
                  onClick={() => set('overlayEnabled', !banner.overlayEnabled)}
                  aria-label={`Colour tint overlay: ${banner.overlayEnabled ? 'enabled' : 'disabled'}`}
                  aria-pressed={banner.overlayEnabled}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${banner.overlayEnabled ? 'bg-pink-600' : 'bg-[#0f2640]'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${banner.overlayEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {banner.overlayEnabled && (
                <div className="space-y-2 pl-1">
                  <div className="flex items-center gap-3">
                    <input type="color" value={banner.overlayColor}
                      onChange={e => set('overlayColor', e.target.value)}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-[#2a4a7a] text-xs">Opacity</span>
                        <span className="text-[#6b8fba] text-xs font-mono">{banner.overlayOpacity}%</span>
                      </div>
                      <input type="range" min={0} max={80} step={5}
                        value={banner.overlayOpacity}
                        onChange={e => set('overlayOpacity', Number(e.target.value))}
                        className="w-full accent-pink-500 cursor-pointer" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gradient fade */}
            <div className="space-y-2 border-t border-white/5 pt-4">
              <div className="flex items-center justify-between">
                <label className="text-[#6b8fba] text-xs font-medium flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#2a4a7a]" /> Edge Gradient Fade
                </label>
                <button
                  onClick={() => set('gradientEnabled', !banner.gradientEnabled)}
                  aria-label={`Edge gradient fade: ${banner.gradientEnabled ? 'enabled' : 'disabled'}`}
                  aria-pressed={banner.gradientEnabled}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${banner.gradientEnabled ? 'bg-blue-600' : 'bg-[#0f2640]'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${banner.gradientEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {banner.gradientEnabled && (
                <div className="space-y-3 pl-1">
                  <div className="flex gap-1.5 flex-wrap">
                    {(['bottom', 'top', 'left', 'right', 'center'] as const).map(d => (
                      <button key={d} onClick={() => set('gradientDirection', d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${banner.gradientDirection === d ? 'bg-blue-600 text-white' : 'bg-[#0f2640]/60 text-[#6b8fba] hover:text-white hover:bg-[#0f2640]'}`}>
                        {d === 'center' ? 'Vignette' : `From ${d}`}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" value={banner.gradientColor}
                      onChange={e => set('gradientColor', e.target.value)}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-[#2a4a7a] text-xs">Intensity</span>
                        <span className="text-[#6b8fba] text-xs font-mono">{banner.gradientIntensity}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={5}
                        value={banner.gradientIntensity}
                        onChange={e => set('gradientIntensity', Number(e.target.value))}
                        className="w-full accent-blue-500 cursor-pointer" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Text overlay */}
            <div className="space-y-2 border-t border-white/5 pt-4">
              <div className="flex items-center justify-between">
                <label className="text-[#6b8fba] text-xs font-medium flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#2a4a7a]" /> Text Overlay
                </label>
                <button
                  onClick={() => set('textOverlayEnabled', !banner.textOverlayEnabled)}
                  aria-label={`Text overlay: ${banner.textOverlayEnabled ? 'enabled' : 'disabled'}`}
                  aria-pressed={banner.textOverlayEnabled}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${banner.textOverlayEnabled ? 'bg-green-600' : 'bg-[#0f2640]'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${banner.textOverlayEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {banner.textOverlayEnabled && (
                <div className="space-y-3 pl-1">
                  <div>
                    <label className="block text-[#2a4a7a] text-xs mb-1">Heading</label>
                    <input type="text" value={banner.textOverlayHeading}
                      onChange={e => set('textOverlayHeading', e.target.value)}
                      placeholder="e.g. Summer Sale — Up to 30% Off"
                      className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-400 py-2 px-3 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[#2a4a7a] text-xs mb-1">Subtext</label>
                    <input type="text" value={banner.textOverlaySubtext}
                      onChange={e => set('textOverlaySubtext', e.target.value)}
                      placeholder="e.g. Research-grade peptides · Free delivery over £100"
                      className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-400 py-2 px-3 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[#2a4a7a] text-xs mb-1">Alignment</label>
                      <div className="flex gap-1">
                        {(['left', 'center', 'right'] as const).map(a => (
                          <button key={a} onClick={() => set('textOverlayAlign', a)}
                            className={`flex-1 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${banner.textOverlayAlign === a ? 'bg-green-700 text-white' : 'bg-[#0f2640]/60 text-[#6b8fba] hover:text-white hover:bg-[#0f2640]'}`}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[#2a4a7a] text-xs mb-1">Position</label>
                      <div className="flex gap-1">
                        {(['top', 'center', 'bottom'] as const).map(p => (
                          <button key={p} onClick={() => set('textOverlayPosition', p)}
                            className={`flex-1 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${banner.textOverlayPosition === p ? 'bg-green-700 text-white' : 'bg-[#0f2640]/60 text-[#6b8fba] hover:text-white hover:bg-[#0f2640]'}`}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="bg-[#0d1f35]/30 border border-white/5 rounded-2xl p-4 space-y-2">
            <p className="text-[#6b8fba] text-xs font-semibold uppercase tracking-wider">Tips</p>
            <ul className="space-y-1.5 text-[#2a4a7a] text-xs">
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span> Best source size: 1920 × 600 px for crisp results.</li>
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span> Use <strong className="text-[#6b8fba]">Cover</strong> + focal point to keep the important part visible when cropped.</li>
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span> Toggle OFF to stage before going live.</li>
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span> After saving, visitors see changes within seconds.</li>
            </ul>
          </div>
        </div>

        {/* ── Right — live preview ── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white font-semibold text-sm">Live Preview</p>
              <div className="flex bg-[#04101f]/60 rounded-lg p-1 gap-1">
                <button onClick={() => setPreview('desktop')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${preview === 'desktop' ? 'bg-blue-600 text-white' : 'text-[#6b8fba] hover:text-white'}`}>
                  <Monitor className="w-3.5 h-3.5" /> Desktop
                </button>
                <button onClick={() => setPreview('mobile')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${preview === 'mobile' ? 'bg-blue-600 text-white' : 'text-[#6b8fba] hover:text-white'}`}>
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </button>
              </div>
            </div>

            {/* Preview frame */}
            <div className={`mx-auto bg-[#060f1e] rounded-xl overflow-hidden border border-white/5 transition-all ${preview === 'mobile' ? 'max-w-[375px]' : 'w-full'}`}>
              {/* Mock nav bar */}
              <div className="h-8 bg-[#04101f] flex items-center px-3 gap-2">
                <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-500/60" /><div className="w-2 h-2 rounded-full bg-yellow-500/60" /><div className="w-2 h-2 rounded-full bg-green-500/60" /></div>
                <div className="flex-1 h-4 bg-[#0d1f35] rounded-full" />
              </div>

              {/* Banner area */}
              <div className="relative overflow-hidden transition-all duration-300" style={{ height: `${previewHeight}px` }}>
                {banner.imageUrl && !imageError ? (
                  <img src={banner.imageUrl} alt={banner.altText}
                    className="w-full h-full transition-all duration-300"
                    style={{ objectFit: banner.objectFit, objectPosition: objectPos }}
                    onError={() => setImageError(true)} />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                    <div className="text-center">
                      <Image className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-600 text-xs">No banner image</p>
                    </div>
                  </div>
                )}
                {/* Colour tint overlay */}
                {banner.overlayEnabled && (
                  <div className="absolute inset-0 pointer-events-none transition-all duration-300"
                    style={{ backgroundColor: banner.overlayColor, opacity: banner.overlayOpacity / 100 }} />
                )}
                {/* Gradient fade overlay */}
                {banner.gradientEnabled && (() => {
                  const gc = banner.gradientColor;
                  const gi = banner.gradientIntensity / 100;
                  const gradMap: Record<string, string> = {
                    bottom: `linear-gradient(to top, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
                    top: `linear-gradient(to bottom, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
                    left: `linear-gradient(to right, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
                    right: `linear-gradient(to left, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
                    center: `radial-gradient(ellipse at center, transparent 30%, ${gc} ${Math.round(gi * 100)}%)`,
                  };
                  return (
                    <div className="absolute inset-0 pointer-events-none transition-all duration-300"
                      style={{ background: gradMap[banner.gradientDirection] }} />
                  );
                })()}
                {/* Text overlay */}
                {banner.textOverlayEnabled && (banner.textOverlayHeading || banner.textOverlaySubtext) && (
                  <div className={`absolute inset-0 flex flex-col pointer-events-none px-6 py-4 z-10
                    ${banner.textOverlayPosition === 'top' ? 'justify-start' : banner.textOverlayPosition === 'bottom' ? 'justify-end' : 'justify-center'}
                    ${banner.textOverlayAlign === 'left' ? 'items-start' : banner.textOverlayAlign === 'right' ? 'items-end' : 'items-center'}`}>
                    {banner.textOverlayHeading && (
                      <div className="text-white font-bold text-lg drop-shadow-lg leading-tight"
                        style={{ textAlign: banner.textOverlayAlign }}>
                        {banner.textOverlayHeading}
                      </div>
                    )}
                    {banner.textOverlaySubtext && (
                      <div className="text-white/80 text-xs mt-1 drop-shadow"
                        style={{ textAlign: banner.textOverlayAlign }}>
                        {banner.textOverlaySubtext}
                      </div>
                    )}
                  </div>
                )}
                {!banner.active && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="bg-[#0d1f35] text-[#6b8fba] text-xs font-medium px-3 py-1.5 rounded-full border border-white/10">Hidden from visitors</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 right-2 text-white/30 text-[10px] font-mono">
                  {previewHeight}px
                </div>
              </div>

              {/* Mock page content below */}
              <div className="p-3 space-y-2">
                <div className="h-3 bg-[#0d1f35] rounded w-3/4" />
                <div className="h-2 bg-[#0b1a30]/80 rounded w-full" />
                <div className="h-2 bg-[#0b1a30]/80 rounded w-5/6" />
              </div>
            </div>

            {/* Stats row */}
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-600 flex-wrap">
              <div className={`flex items-center gap-1.5 ${banner.active ? 'text-green-400' : 'text-[#2a4a7a]'}`}>
                <div className={`w-2 h-2 rounded-full ${banner.active ? 'bg-green-400' : 'bg-[#1a3a5c]'}`} />
                {banner.active ? 'Visible to visitors' : 'Hidden from visitors'}
              </div>
              <span className="text-gray-700">·</span>
              <span>{banner.heightPx}px tall</span>
              <span className="text-gray-700">·</span>
              <span className="capitalize">{banner.objectFit}</span>
              <span className="text-gray-700">·</span>
              <span>Focus {banner.objectPositionX}% / {banner.objectPositionY}%</span>
              {banner.linkUrl && (
                <>
                  <span className="text-gray-700">·</span>
                  <span className="flex items-center gap-1 text-blue-500 truncate max-w-[180px]">
                    <ExternalLink className="w-3 h-3 shrink-0" /> {banner.linkUrl}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
