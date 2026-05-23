import { useState, useEffect, useRef } from 'react';
import {
  Settings, Save, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, MessageCircle, Globe, Phone, Link2, CreditCard, Building2,
  Image as ImageIcon, Upload, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, storage, doc, getDoc, setDoc, Timestamp, storageRef, uploadBytesResumable, getDownloadURL } from '@/lib/firebase';

interface SiteSettings {
  // Contact
  whatsappNumber: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  contactHours: string;

  // Contact page content
  contactHeading: string;
  contactSubheading: string;

  // Social links
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  youtubeUrl: string;
  linkedinUrl: string;

  // Footer
  footerTagline: string;
  footerLegal: string;
  companyName: string;

  // Payment methods
  trueLayerEnabled: boolean;
  bankTransferEnabled: boolean;
  bankTransferName: string;
  bankTransferSortCode: string;
  bankTransferAccountNumber: string;
  bankTransferIBAN: string;
  bankTransferInstructions: string;

  // About Us images
  aboutHeroImage: string;
  aboutMissionImage: string;
  aboutQualityImage: string;

  // Analytics & Tracking
  googleAnalyticsId: string;
  plausibleDomain: string;

  // Legal & Compliance
  mhraDisclaimerEnabled: boolean;
  companyRegNumber: string;
  companyAddress: string;

  // Maintenance
  maintenanceMode: boolean;
  maintenanceEndDate: string; // ISO datetime string
  
  // Site Features - Age Gate permanently removed
  cookieConsentEnabled: boolean;

  updatedAt?: any;
}

const DEFAULTS: SiteSettings = {
  whatsappNumber: '',
  contactEmail: 'info@prohealthpeptides.co.uk',
  contactPhone: '',
  contactAddress: '',
  contactHours: 'Monday – Friday, 9 am – 6 pm GMT',
  contactHeading: 'Get in Touch',
  contactSubheading: "We're here to help. Reach out via any channel below.",
  facebookUrl: '',
  instagramUrl: '',
  twitterUrl: '',
  youtubeUrl: '',
  linkedinUrl: '',
  footerTagline: 'Premium research-grade peptides. Laboratory use only.',
  footerLegal: 'For laboratory research use only. Not for human consumption.',
  companyName: 'Pro Health Peptides',
  // Payment methods — TrueLayer on by default, bank transfer off
  trueLayerEnabled: false,
  bankTransferEnabled: true,
  bankTransferName: '',
  bankTransferSortCode: '',
  bankTransferAccountNumber: '',
  bankTransferIBAN: '',
  bankTransferInstructions: 'Please use your order reference as the payment reference when making the transfer.',
  // About Us images (empty = use built-in defaults)
  aboutHeroImage: '',
  aboutMissionImage: '',
  aboutQualityImage: '',
  // Analytics & Tracking
  googleAnalyticsId: '',
  plausibleDomain: '',
  // Legal & Compliance
  mhraDisclaimerEnabled: true,
  companyRegNumber: '',
  companyAddress: '',
  // Maintenance
  maintenanceMode: false,
  maintenanceEndDate: '',
  // Site Features - Age Gate permanently removed
  cookieConsentEnabled: true,
};

type Field = {
  key: keyof SiteSettings;
  label: string;
  placeholder: string;
  hint?: string;
  prefix?: string;
};

const SECTIONS: { title: string; icon: any; color: string; fields: Field[] }[] = [
  {
    title: 'Contact & Messaging',
    icon: Phone,
    color: 'text-green-400',
    fields: [
      { key: 'whatsappNumber', label: 'WhatsApp Number', placeholder: '447700900000', hint: 'Digits only — country code + number, no + or spaces. E.g. 447700900000', prefix: 'wa.me/' },
      { key: 'contactEmail', label: 'Contact Email', placeholder: 'info@example.com' },
      { key: 'contactPhone', label: 'Phone Number', placeholder: '+44 7700 900000' },
      { key: 'contactAddress', label: 'Office Address', placeholder: '123 Science Park, London, UK' },
      { key: 'contactHours', label: 'Opening Hours', placeholder: 'Mon–Fri, 9am–6pm GMT' },
      { key: 'contactHeading', label: 'Contact Page Heading', placeholder: 'Get in Touch' },
      { key: 'contactSubheading', label: 'Contact Page Subheading', placeholder: "We're here to help..." },
    ],
  },
  {
    title: 'Social Media Links',
    icon: Globe,
    color: 'text-blue-400',
    fields: [
      { key: 'facebookUrl', label: 'Facebook URL', placeholder: 'https://facebook.com/yourpage' },
      { key: 'instagramUrl', label: 'Instagram URL', placeholder: 'https://instagram.com/yourhandle' },
      { key: 'twitterUrl', label: 'X / Twitter URL', placeholder: 'https://x.com/yourhandle' },
      { key: 'youtubeUrl', label: 'YouTube URL', placeholder: 'https://youtube.com/@yourchannel' },
      { key: 'linkedinUrl', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/company/yourcompany' },
    ],
  },
  {
    title: 'Footer Text',
    icon: Link2,
    color: 'text-blue-400',
    fields: [
      { key: 'companyName', label: 'Company Name', placeholder: 'Pro Health Peptides' },
      { key: 'footerTagline', label: 'Footer Tagline', placeholder: 'Premium research-grade peptides.' },
      { key: 'footerLegal', label: 'Legal Disclaimer Line', placeholder: 'For laboratory research use only.' },
      { key: 'companyRegNumber', label: 'Company Registration Number', placeholder: '12345678', hint: 'UK Companies House registration number — shown in footer and Contact page' },
      { key: 'companyAddress', label: 'Registered Company Address', placeholder: '1 Science Park, London, EC1A 1BB', hint: 'Registered address shown in footer and Contact page' },
    ],
  },
  {
    title: 'Analytics & Tracking',
    icon: Globe,
    color: 'text-purple-400',
    fields: [
      { key: 'googleAnalyticsId', label: 'Google Analytics GA4 ID', placeholder: 'G-XXXXXXXXXX', hint: 'Your Google Analytics 4 property ID' },
      { key: 'plausibleDomain', label: 'Plausible Domain', placeholder: 'prohealthpeptides.co.uk', hint: 'Your domain for Plausible analytics' },
    ],
  },
];

export default function SiteSettingsTab() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);
  const [original, setOriginal] = useState<SiteSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [imgUploading, setImgUploading] = useState<Record<string, boolean>>({});
  const heroRef = useRef<HTMLInputElement>(null);
  const missionRef = useRef<HTMLInputElement>(null);
  const qualityRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'settings', 'siteSettings'));
      if (snap.exists()) {
        const data = { ...DEFAULTS, ...snap.data() } as SiteSettings;
        setSettings(data);
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
      await setDoc(doc(db, 'settings', 'siteSettings'), { ...settings, updatedAt: Timestamp.now() });
      window.dispatchEvent(new CustomEvent('admin:save'));
      setOriginal(settings);
      setMsg({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMsg(null), 4000);
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Save failed: ' + (e?.message || 'unknown') });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof SiteSettings, val: string | boolean) =>
    setSettings(prev => ({ ...prev, [key]: val }));

  const isDirty = JSON.stringify(settings) !== JSON.stringify(original);

  /**
   * Resize + compress image via Canvas before upload.
   * Hero: max 1920×700  |  Mission/Quality: max 1200×800
   * Output: JPEG quality 0.88 (visually lossless, ~70% smaller file)
   */
  const compressImage = (
    file: File,
    maxW: number,
    maxH: number,
    quality = 0.88
  ): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = url;
    });

  const IMG_LIMITS: Record<'aboutHeroImage' | 'aboutMissionImage' | 'aboutQualityImage', [number, number]> = {
    aboutHeroImage:    [1920, 700],
    aboutMissionImage: [1200, 800],
    aboutQualityImage: [1200, 800],
  };

  const handleImageUpload = async (
    key: 'aboutHeroImage' | 'aboutMissionImage' | 'aboutQualityImage',
    file: File
  ) => {
    setImgUploading(p => ({ ...p, [key]: true }));
    try {
      const [maxW, maxH] = IMG_LIMITS[key];
      const compressed = await compressImage(file, maxW, maxH);
      const path = `settings/about/${key}_${Date.now()}.jpg`;
      const fileRef = storageRef(storage, path);
      const task = uploadBytesResumable(fileRef, compressed, { contentType: 'image/jpeg' });
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', null, reject, resolve);
      });
      const url = await getDownloadURL(task.snapshot.ref);
      set(key, url);
      setMsg({ type: 'success', text: 'Image uploaded — click Save to apply.' });
      setTimeout(() => setMsg(null), 4000);
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Upload failed: ' + (e?.message || 'unknown error') });
    } finally {
      setImgUploading(p => ({ ...p, [key]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="w-6 h-6 text-blue-400" />
            Site Settings
          </h1>
          <p className="text-[#6b8fba] text-sm mt-1">
            Manage contact info, social media links, WhatsApp button, and footer text.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadSettings} aria-label="Refresh settings" className="flex items-center gap-1.5 px-3 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-[#8caad4] rounded-lg text-sm transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Status message */}
      <div aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role={msg.type === 'error' ? 'alert' : 'status'}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                msg.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* WhatsApp quick preview */}
      {settings.whatsappNumber && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-2xl">
          <MessageCircle className="w-5 h-5 text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-green-300 text-sm font-medium">WhatsApp link preview</p>
            <a
              href={`https://wa.me/${settings.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-500 text-xs hover:underline truncate block"
            >
              https://wa.me/{settings.whatsappNumber}
            </a>
          </div>
          <a
            href={`https://wa.me/${settings.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          >
            Test link
          </a>
        </div>
      )}

      {/* Sections */}
      {SECTIONS.map(({ title, icon: Icon, color, fields }) => (
        <div key={title} className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className={`font-semibold flex items-center gap-2 ${color}`}>
            <Icon className="w-4 h-4" /> {title}
          </h3>
          {fields.map(({ key, label, placeholder, hint, prefix }) => (
            <div key={key}>
              <label className="block text-[#6b8fba] text-xs font-medium mb-1.5">{label}</label>
              <div className="flex items-center gap-0">
                {prefix && (
                  <span className="bg-[#0f2640] border border-r-0 border-white/10 rounded-l-xl px-3 py-2.5 text-[#2a4a7a] text-xs font-mono whitespace-nowrap">
                    {prefix}
                  </span>
                )}
                <input
                  type="text"
                  value={(settings[key] as string) || ''}
                  onChange={e => set(key, e.target.value)}
                  placeholder={placeholder}
                  className={`w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-500 py-3 px-4 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all ${
                    prefix ? 'rounded-r-lg' : 'rounded-lg'
                  }`}
                />
              </div>
              {hint && <p className="text-gray-600 text-xs mt-1">{hint}</p>}
            </div>
          ))}
        </div>
      ))}

      {/* Live footer preview */}
      <div className="bg-[#04101f] border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 className="text-[#6b8fba] text-xs font-semibold uppercase tracking-wider">Footer Preview</h3>
        <div className="bg-[#060f1e] rounded-xl p-4">
          <p className="text-white font-bold text-sm">{settings.companyName || 'Company Name'}</p>
          <p className="text-[#2a4a7a] text-xs mt-1">{settings.footerTagline || 'Tagline goes here'}</p>
          <div className="flex gap-3 mt-3">
            {settings.facebookUrl && <span className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center"><FacebookIcon className="w-3 h-3 text-blue-400" /></span>}
            {settings.instagramUrl && <span className="w-6 h-6 rounded-full bg-pink-600/30 flex items-center justify-center"><InstagramIcon className="w-3 h-3 text-pink-400" /></span>}
            {settings.twitterUrl && <span className="w-6 h-6 rounded-full bg-[#1a3a5c]/30 flex items-center justify-center"><XIcon className="w-3 h-3 text-[#8caad4]" /></span>}
            {settings.whatsappNumber && <span className="w-6 h-6 rounded-full bg-green-600/30 flex items-center justify-center"><MessageCircle className="w-3 h-3 text-green-400" /></span>}
          </div>
          <p className="text-gray-700 text-xs mt-3 border-t border-white/5 pt-3">{settings.footerLegal}</p>
        </div>
      </div>

      {/* ── Payment Methods ── */}
      <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-5">
        <h3 className="font-semibold flex items-center gap-2 text-emerald-400">
          <CreditCard className="w-4 h-4" /> Payment Methods
        </h3>

        {/* TrueLayer (Open Banking) toggle */}
        <div className="flex items-start justify-between gap-4 p-4 bg-[#04101f]/60 rounded-xl border border-white/5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-blue-600/20 rounded-lg flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-white text-sm font-medium">TrueLayer (Open Banking)</p>
              <p className="text-[#6b8fba] text-xs mt-0.5">Accept instant bank payments via TrueLayer. FCA-regulated, bank-grade security. Customers pay directly from their bank account.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => set('trueLayerEnabled', !settings.trueLayerEnabled)}
            aria-label={`TrueLayer Open Banking: ${settings.trueLayerEnabled ? 'enabled' : 'disabled'}`}
            aria-pressed={settings.trueLayerEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.trueLayerEnabled ? 'bg-blue-600' : 'bg-[#1a3a5c]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.trueLayerEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Bank Transfer toggle */}
        <div className="flex items-start justify-between gap-4 p-4 bg-[#04101f]/60 rounded-xl border border-white/5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-green-600/20 rounded-lg flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-white text-sm font-medium">Bank Transfer</p>
              <p className="text-[#6b8fba] text-xs mt-0.5">Customers pay by bank transfer and receive a unique reference number with their order.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => set('bankTransferEnabled', !settings.bankTransferEnabled)}
            aria-label={`Bank Transfer: ${settings.bankTransferEnabled ? 'enabled' : 'disabled'}`}
            aria-pressed={settings.bankTransferEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.bankTransferEnabled ? 'bg-green-600' : 'bg-[#1a3a5c]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.bankTransferEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Bank Transfer Details — only shown when enabled */}
        <AnimatePresence>
          {settings.bankTransferEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-1 pl-1">
                <p className="text-[#6b8fba] text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> Bank Account Details (shown to customers)
                </p>
                {([
                  { key: 'bankTransferName', label: 'Account Name', placeholder: 'Pro Health Peptides Ltd' },
                  { key: 'bankTransferSortCode', label: 'Sort Code', placeholder: '12-34-56' },
                  { key: 'bankTransferAccountNumber', label: 'Account Number', placeholder: '12345678' },
                  { key: 'bankTransferIBAN', label: 'IBAN (optional)', placeholder: 'GB12 ABCD 1234 5678 90' },
                  { key: 'bankTransferInstructions', label: 'Instructions for Customer', placeholder: 'Use your order reference as payment reference' },
                ] as { key: keyof SiteSettings; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[#6b8fba] text-xs font-medium mb-1.5">{label}</label>
                    <input
                      type="text"
                      value={(settings[key] as string) || ''}
                      onChange={e => set(key, e.target.value)}
                      placeholder={placeholder}
                      className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-500 py-3 px-4 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Warning if both are disabled */}
        {!settings.trueLayerEnabled && !settings.bankTransferEnabled && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-xs">Warning: No payment methods are enabled. Customers will not be able to complete checkout.</p>
          </div>
        )}
      </div>

      {/* ── Site Features ── */}
      <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-blue-400">
          <Shield className="w-4 h-4" /> Site Features
        </h3>
        <p className="text-[#6b8fba] text-xs leading-relaxed">
          Control which compliance and interaction features are displayed to visitors.
        </p>
        
        {/* Age Gate Toggle - REMOVED */}

        {/* Cookie Consent Toggle */}
        <div className="flex items-start justify-between gap-4 p-4 bg-[#04101f]/60 rounded-xl border border-white/5">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${settings.cookieConsentEnabled ? 'bg-green-500/20' : 'bg-[#1a3a5c]/40'}`}>
              <CheckCircle2 className={`w-4 h-4 ${settings.cookieConsentEnabled ? 'text-green-400' : 'text-[#3a5a82]'}`} />
            </div>
            <div>
              <p className="text-white text-sm font-medium">Cookie Consent Banner</p>
              <p className="text-[#6b8fba] text-xs mt-0.5">
                Shows GDPR-compliant cookie consent banner to visitors. Required for UK/EU compliance.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => set('cookieConsentEnabled', !settings.cookieConsentEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.cookieConsentEnabled ? 'bg-green-500' : 'bg-[#1a3a5c]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.cookieConsentEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* ── Maintenance Mode ── */}
      <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-amber-400">
          <AlertCircle className="w-4 h-4" /> Maintenance Mode
        </h3>
        <p className="text-[#6b8fba] text-xs leading-relaxed">
          When enabled, visitors will see a "We'll Be Back Soon" page instead of the website. Admins are not affected and can still browse the site normally.
        </p>
        <div className="flex items-start justify-between gap-4 p-4 bg-[#04101f]/60 rounded-xl border border-white/5">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${settings.maintenanceMode ? 'bg-amber-500/20' : 'bg-[#1a3a5c]/40'}`}>
              <AlertCircle className={`w-4 h-4 ${settings.maintenanceMode ? 'text-amber-400' : 'text-[#3a5a82]'}`} />
            </div>
            <div>
              <p className="text-white text-sm font-medium">Under Construction / Maintenance</p>
              <p className="text-[#6b8fba] text-xs mt-0.5">
                Shows a beautiful animated "We'll Be Back Soon" screen to all visitors. You (admin) can still access everything normally.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => set('maintenanceMode', !settings.maintenanceMode)}
            aria-label={`Maintenance mode: ${settings.maintenanceMode ? 'enabled' : 'disabled'}`}
            aria-pressed={settings.maintenanceMode}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.maintenanceMode ? 'bg-amber-500' : 'bg-[#1a3a5c]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.maintenanceMode ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        {settings.maintenanceMode && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-xs">Maintenance mode is <strong>ON</strong> — visitors currently see the "We'll Be Back Soon" page. Remember to save and turn it off when ready.</p>
          </div>
        )}

        {/* Countdown target date */}
        <div className="p-4 bg-[#04101f]/60 rounded-xl border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Countdown End Date &amp; Time</p>
              <p className="text-[#6b8fba] text-xs mt-0.5">Set the exact date &amp; time shown on the "We'll Be Back Soon" countdown timer. Leave blank to default to 7 days from now.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="datetime-local"
              value={settings.maintenanceEndDate || ''}
              onChange={e => set('maintenanceEndDate', e.target.value)}
              className="flex-1 bg-[#0a1929] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
              style={{ colorScheme: 'dark' }}
            />
            {settings.maintenanceEndDate && (
              <button
                type="button"
                onClick={() => set('maintenanceEndDate', '')}
                className="px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-white/40 hover:text-white/70 text-xs transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          {settings.maintenanceEndDate && (
            <p className="text-amber-400/70 text-[11px]">
              Countdown target: {new Date(settings.maintenanceEndDate).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}
            </p>
          )}
        </div>
      </div>

      {/* ── MHRA Compliance Banner ── */}
      <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-red-400">
          <Shield className="w-4 h-4" /> MHRA Compliance Banner
        </h3>
        <p className="text-[#6b8fba] text-xs leading-relaxed">
          The MHRA disclaimer banner appears at the bottom of every page. It is legally required for UK peptide research compound suppliers. Only disable if you have received specific legal advice permitting its removal.
        </p>
        <div className="flex items-start justify-between gap-4 p-4 bg-[#04101f]/60 rounded-xl border border-white/5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-600/20 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-white text-sm font-medium">Site-Wide MHRA Disclaimer</p>
              <p className="text-[#6b8fba] text-xs mt-0.5">
                Displays "Not approved by MHRA or FDA. For research use only." banner in the footer of every page.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => set('mhraDisclaimerEnabled', !settings.mhraDisclaimerEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.mhraDisclaimerEnabled ? 'bg-red-600' : 'bg-[#1a3a5c]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.mhraDisclaimerEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        {!settings.mhraDisclaimerEnabled && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-300 text-xs">Warning: MHRA disclaimer is disabled. Ensure you have legal advice before proceeding.</p>
          </div>
        )}
      </div>

      {/* ── Analytics & Tracking ── */}
      <div className="bg-[#0b1a30]/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-purple-400">
          <Globe className="w-4 h-4" /> Analytics & Tracking
        </h3>
        <p className="text-[#6b8fba] text-xs">Configure Google Analytics GA4 and Plausible analytics for tracking visitor behavior.</p>
        {[
          { key: 'googleAnalyticsId' as const, label: 'Google Analytics GA4 ID', placeholder: 'G-XXXXXXXXXX', hint: 'Your Google Analytics 4 property ID' },
          { key: 'plausibleDomain' as const, label: 'Plausible Domain', placeholder: 'prohealthpeptides.co.uk', hint: 'Your domain for Plausible analytics' },
        ].map(({ key, label, placeholder, hint }) => (
          <div key={key}>
            <label className="block text-[#6b8fba] text-xs font-medium mb-1.5">{label}</label>
            <input
              type="text"
              value={(settings[key] as string) || ''}
              onChange={e => set(key, e.target.value)}
              placeholder={placeholder}
              className="w-full bg-white border border-gray-300 text-gray-900 text-sm placeholder-gray-500 py-3 px-4 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {hint && <p className="text-gray-600 text-xs mt-1">{hint}</p>}
          </div>
        ))}
      </div>

      {/* About Us Images */}
      <div className="bg-[#0b1a30]/80 border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">About Us Page Images</h3>
            <p className="text-[#2a4a7a] text-xs mt-0.5">Upload custom images for the About Us page. Leave blank to use defaults.</p>
          </div>
        </div>

        {([ 
          { key: 'aboutHeroImage' as const, label: 'Hero Background', ref: heroRef, hint: 'Wide banner behind the headline — recommended 1920×560px' },
          { key: 'aboutMissionImage' as const, label: 'Mission Section Image', ref: missionRef, hint: 'Right-side photo in the "Our Mission" section — 768×512px' },
          { key: 'aboutQualityImage' as const, label: 'Quality Section Image', ref: qualityRef, hint: 'Left-side photo in the "Quality Standards" section — 768×512px' },
        ]).map(({ key, label, ref, hint }) => (
          <div key={key} className="space-y-2">
            <label className="block text-xs font-semibold text-[#8caad4] uppercase tracking-wide">{label}</label>
            <p className="text-[#2a4a7a] text-xs">{hint}</p>

            {/* Preview */}
            {settings[key] && (
              <div className="relative h-28 rounded-xl overflow-hidden border border-white/[0.07]">
                <img src={settings[key] as string} alt={label} className="w-full h-full object-cover" />
                <button
                  onClick={() => set(key, '')}
                  className="absolute top-2 right-2 px-2 py-1 bg-red-600/80 hover:bg-red-500 text-white text-xs rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={ref}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(key, f); }}
              />
              <button
                onClick={() => ref.current?.click()}
                disabled={imgUploading[key]}
                className="flex items-center gap-2 px-4 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] border border-white/[0.08] text-[#8caad4] hover:text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
              >
                {imgUploading[key] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {imgUploading[key] ? 'Uploading...' : 'Upload Image'}
              </button>
              <input
                type="text"
                value={settings[key] as string}
                onChange={e => set(key, e.target.value)}
                placeholder="…or paste a URL"
                className="flex-1 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all min-h-[48px]"
              />
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// Inline SVG brand icons
function FacebookIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>;
}
function InstagramIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path fill="none" stroke="currentColor" strokeWidth="2" d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01"/></svg>;
}
function XIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
}
