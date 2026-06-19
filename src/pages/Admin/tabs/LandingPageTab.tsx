import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Trash2, Plus, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { db, doc, getDoc, setDoc, triggerContentCdnInvalidation } from '@/lib/firebase';

interface Stat {
  value: string;
  label: string;
}

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

interface LandingPageData {
  heroBadge: string;
  heroHeading: string;
  heroSubheading: string;
  heroCta: string;
  heroCtaUrl: string;
  heroImageUrl: string;
  stats: Stat[];
  features: Feature[];
  trustBullets: string[];
  ctaHeading: string;
  ctaSubtext: string;
  ctaButton: string;
  ctaButtonUrl: string;
  ctaBgColor: string;
  pageTitle: string;
  metaDescription: string;
  pageSlug: string;
  published: boolean;
  updatedAt?: number;
}

const DEFAULT_DATA: LandingPageData = {
  heroBadge: 'HPLC Tested · UK Research Supplier',
  heroHeading: 'Research-Grade Peptides Built for Scientific Precision',
  heroSubheading: 'Every compound HPLC-tested before dispatch. Analytical results documented. Trusted by UK researchers since 2021.',
  heroCta: 'Explore the Catalogue',
  heroCtaUrl: '/products',
  heroImageUrl: '',
  stats: [
    { value: '1700+', label: 'Researchers Served' },
    { value: 'HPLC', label: 'Purity Testing Method' },
    { value: '21+', label: 'Compounds Available' },
  ],
  features: [
    { icon: '🔬', title: 'HPLC Tested', desc: 'Every batch tested by HPLC before dispatch. Results documented and available on request.' },
    { icon: '📦', title: 'Thermal Packaging', desc: 'Orders packed in thermally sealed bags. No ice packs included.' },
    { icon: '📄', title: 'Batch Results', desc: 'Analytical results on file. Available on request with order reference.' },
    { icon: '⚡', title: 'Fast UK Dispatch', desc: 'Orders processed within 1–3 working days.' },
    { icon: '🔒', title: 'Secure Checkout', desc: '256-bit SSL. Pay by Bank via Open Banking.' },
    { icon: '🧪', title: 'Research Only', desc: 'Compounds supplied strictly for scientific research purposes.' },
  ],
  trustBullets: [
    'HPLC purity testing on every batch before dispatch',
    'Analytical results documented and available on request',
    'Thermally sealed bags — no ice packs included',
    'Compliant with UK research chemical regulations',
  ],
  ctaHeading: 'Ready to Advance Your Research?',
  ctaSubtext: 'Browse our full catalogue of research-grade peptides with next-day UK delivery.',
  ctaButton: 'View Full Catalogue',
  ctaButtonUrl: '/products',
  ctaBgColor: '#0b1a30',
  pageTitle: 'PH Labs — Research-Grade Compounds UK',
  metaDescription: 'Premium research compounds with HPLC-verified purity. For in-vitro laboratory research use only. Fast UK shipping.',
  pageSlug: 'peptides',
  published: false,
};

type Toast = { id: string; message: string; type: 'success' | 'error' };

const Toast: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 3500);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={`px-4 py-3 rounded-lg text-sm font-medium ${
        toast.type === 'success'
          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
          : 'bg-red-500/20 text-red-300 border border-red-500/30'
      }`}
    >
      {toast.message}
    </motion.div>
  );
};

const CollapsibleSection: React.FC<{
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, isOpen, onToggle, children }) => (
  <div className="bg-[#0b1a30] border border-white/[0.08] rounded-xl overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
    >
      <h3 className="text-[#e8f0fc] font-semibold text-sm">{title}</h3>
      {isOpen ? <ChevronUp size={18} className="text-[#9cb8d9]" /> : <ChevronDown size={18} className="text-[#9cb8d9]" />}
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-white/[0.08] px-5 py-4 space-y-4"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const LivePreview: React.FC<{ data: LandingPageData }> = ({ data }) => (
  <div className="bg-[#0b1a30] border border-white/[0.08] rounded-xl p-4 sticky top-4">
    <h3 className="text-[#e8f0fc] font-semibold text-sm mb-4">Live Preview</h3>
    <div className="origin-top-left" style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}>
      <div className="bg-[#060f1e] w-[800px] p-12 space-y-8">
        <div className="space-y-4">
          <div className="inline-block px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-blue-300 text-xs font-semibold">
            {data.heroBadge}
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight">{data.heroHeading}</h1>
          <p className="text-[#9cb8d9] text-lg max-w-md">{data.heroSubheading}</p>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {data.stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-bold text-blue-400">{stat.value}</div>
              <div className="text-xs text-[#9cb8d9] mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    {data.published && (
      <a
        href={`/landing/${data.pageSlug}`}
        className="mt-4 block text-center px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >
        View Preview
      </a>
    )}
  </div>
);

export default function LandingPageTab() {
  const [data, setData] = useState<LandingPageData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    hero: true,
    stats: true,
    features: false,
    trust: false,
    cta: false,
    seo: false,
    publish: true,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const docRef = doc(db, 'siteSettings', 'landingPage');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setData(docSnap.data() as LandingPageData);
        }
      } catch (error) {
        console.error('Error loading landing page data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'siteSettings', 'landingPage');
      await setDoc(docRef, { ...data, updatedAt: Date.now() });
      addToast('Landing page saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving:', error);
      addToast('Failed to save landing page', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Math.random().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return <div className="text-[#9cb8d9]">Loading...</div>;
  }

  return (
    <div className="bg-[#060f1e] min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-[#e8f0fc]">Landing Page Builder</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {/* Hero Section */}
            <CollapsibleSection
              title="Hero Section"
              isOpen={openSections.hero}
              onToggle={() => toggleSection('hero')}
            >
              <div className="space-y-3">
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Badge Text</label>
                  <input
                    type="text"
                    value={data.heroBadge}
                    onChange={(e) => setData({ ...data, heroBadge: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Heading (H1)</label>
                  <input
                    type="text"
                    value={data.heroHeading}
                    onChange={(e) => setData({ ...data, heroHeading: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Subheading</label>
                  <textarea
                    value={data.heroSubheading}
                    onChange={(e) => setData({ ...data, heroSubheading: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[80px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">CTA Button Text</label>
                    <input
                      type="text"
                      value={data.heroCta}
                      onChange={(e) => setData({ ...data, heroCta: e.target.value })}
                      className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">CTA URL</label>
                    <input
                      type="text"
                      value={data.heroCtaUrl}
                      onChange={(e) => setData({ ...data, heroCtaUrl: e.target.value })}
                      className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Hero Image URL</label>
                  <input
                    type="text"
                    value={data.heroImageUrl}
                    onChange={(e) => setData({ ...data, heroImageUrl: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Stats Section */}
            <CollapsibleSection
              title="Stats Bar (3 Stats)"
              isOpen={openSections.stats}
              onToggle={() => toggleSection('stats')}
            >
              <div className="space-y-3">
                {data.stats.map((stat, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Value</label>
                      <input
                        type="text"
                        value={stat.value}
                        onChange={(e) => {
                          const newStats = [...data.stats];
                          newStats[idx].value = e.target.value;
                          setData({ ...data, stats: newStats });
                        }}
                        className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Label</label>
                      <input
                        type="text"
                        value={stat.label}
                        onChange={(e) => {
                          const newStats = [...data.stats];
                          newStats[idx].label = e.target.value;
                          setData({ ...data, stats: newStats });
                        }}
                        className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Features Section */}
            <CollapsibleSection
              title={`Features (${data.features.length}/6)`}
              isOpen={openSections.features}
              onToggle={() => toggleSection('features')}
            >
              <div className="space-y-3">
                {data.features.map((feature, idx) => (
                  <div key={idx} className="p-3 bg-gray-900/50 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Icon (Emoji)</label>
                            <input
                              type="text"
                              value={feature.icon}
                              onChange={(e) => {
                                const newFeatures = [...data.features];
                                newFeatures[idx].icon = e.target.value;
                                setData({ ...data, features: newFeatures });
                              }}
                              className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                              maxLength={2}
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Title</label>
                            <input
                              type="text"
                              value={feature.title}
                              onChange={(e) => {
                                const newFeatures = [...data.features];
                                newFeatures[idx].title = e.target.value;
                                setData({ ...data, features: newFeatures });
                              }}
                              className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Description</label>
                          <textarea
                            value={feature.desc}
                            onChange={(e) => {
                              const newFeatures = [...data.features];
                              newFeatures[idx].desc = e.target.value;
                              setData({ ...data, features: newFeatures });
                            }}
                            className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[64px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all resize-none"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => setData({ ...data, features: data.features.filter((_, i) => i !== idx) })}
                        aria-label="Delete feature"
                        className="ml-2 p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {data.features.length < 6 && (
                  <button
                    onClick={() =>
                      setData({
                        ...data,
                        features: [...data.features, { icon: '✨', title: '', desc: '' }],
                      })
                    }
                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-blue-500/50 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors text-sm font-semibold"
                  >
                    <Plus size={16} />
                    Add Feature
                  </button>
                )}
              </div>
            </CollapsibleSection>

            {/* Trust Bullets Section */}
            <CollapsibleSection
              title={`Trust Bullets (${data.trustBullets.length})`}
              isOpen={openSections.trust}
              onToggle={() => toggleSection('trust')}
            >
              <div className="space-y-2">
                {data.trustBullets.map((bullet, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={bullet}
                      onChange={(e) => {
                        const newBullets = [...data.trustBullets];
                        newBullets[idx] = e.target.value;
                        setData({ ...data, trustBullets: newBullets });
                      }}
                      className="flex-1 px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
                    />
                    <button
                      onClick={() =>
                        setData({ ...data, trustBullets: data.trustBullets.filter((_, i) => i !== idx) })
                      }
                      aria-label="Delete trust bullet"
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setData({ ...data, trustBullets: [...data.trustBullets, ''] })}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-blue-500/50 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors text-sm font-semibold"
                >
                  <Plus size={16} />
                  Add Bullet
                </button>
              </div>
            </CollapsibleSection>

            {/* CTA Block Section */}
            <CollapsibleSection
              title="CTA Block"
              isOpen={openSections.cta}
              onToggle={() => toggleSection('cta')}
            >
              <div className="space-y-3">
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Heading</label>
                  <input
                    type="text"
                    value={data.ctaHeading}
                    onChange={(e) => setData({ ...data, ctaHeading: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Subtext</label>
                  <textarea
                    value={data.ctaSubtext}
                    onChange={(e) => setData({ ...data, ctaSubtext: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[64px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Button Text</label>
                    <input
                      type="text"
                      value={data.ctaButton}
                      onChange={(e) => setData({ ...data, ctaButton: e.target.value })}
                      className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Button URL</label>
                    <input
                      type="text"
                      value={data.ctaButtonUrl}
                      onChange={(e) => setData({ ...data, ctaButtonUrl: e.target.value })}
                      className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Background Color (Hex)</label>
                  <input
                    type="text"
                    value={data.ctaBgColor}
                    onChange={(e) => setData({ ...data, ctaBgColor: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* SEO Section */}
            <CollapsibleSection
              title="SEO"
              isOpen={openSections.seo}
              onToggle={() => toggleSection('seo')}
            >
              <div className="space-y-3">
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Page Title</label>
                  <input
                    type="text"
                    value={data.pageTitle}
                    onChange={(e) => setData({ ...data, pageTitle: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                  />
                </div>
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Meta Description</label>
                  <textarea
                    value={data.metaDescription}
                    onChange={(e) => setData({ ...data, metaDescription: e.target.value })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[64px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all resize-none"
                  />
                </div>
                <div>
                  <label className="text-[#9cb8d9] text-xs font-semibold block mb-1">Page Slug (no spaces)</label>
                  <input
                    type="text"
                    value={data.pageSlug}
                    onChange={(e) => setData({ ...data, pageSlug: e.target.value.replace(/\s+/g, '-') })}
                    className="w-full block mt-2 px-4 py-3 bg-[#1e293b] border-2 border-[#475569] rounded-lg text-[#f8fafc] text-base placeholder-[#94a3b8] min-h-[48px] focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.3)] transition-all"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Publish Section */}
            <CollapsibleSection
              title="Publish"
              isOpen={openSections.publish}
              onToggle={() => toggleSection('publish')}
            >
              <div className="space-y-4">
                <button
                  onClick={() => setData({ ...data, published: !data.published })}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                    data.published
                      ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                      : 'bg-gray-700/30 text-[#9cb8d9] border border-white/10'
                  }`}
                >
                  {data.published ? '🟢 LIVE' : '⚪ DRAFT'}
                </button>
                {data.published && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-blue-300 text-xs font-semibold">Public URL:</p>
                    <p className="text-blue-200 text-sm font-mono mt-1">/landing/{data.pageSlug}</p>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </div>

          {/* Right Column: Live Preview */}
          <div className="lg:col-span-1">
            <LivePreview data={data} />
          </div>
        </div>
      </div>

      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast toast={toast} onRemove={removeToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}