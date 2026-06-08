import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Check, Eye, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { THEME_TEMPLATES, type ThemeTemplate } from '@/themes/templates';
import { useTheme } from '@/contexts/ThemeContext';

const CATEGORIES = [
  { id: 'all',       label: 'All Templates' },
  { id: 'luxury',    label: 'Luxury' },
  { id: 'medical',   label: 'Medical' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'modern',    label: 'Modern' },
  { id: 'minimal',   label: 'Minimal' },
  { id: 'vibrant',   label: 'Vibrant' },
  { id: 'dark',      label: 'Dark' },
];


function ColorSwatch({ colors }: { colors: ThemeTemplate['colors'] }) {
  return (
    <div className="flex gap-1 mt-3">
      {[colors.primary, colors.secondary, colors.accent, colors.background, colors.surface].map((c, i) => (
        <div
          key={i}
          className="w-5 h-5 rounded-full border border-white/10 flex-shrink-0"
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </div>
  );
}

function TemplateMiniPreview({ template }: { template: ThemeTemplate }) {
  const c = template.colors;
  return (
    <div
      className="w-full h-28 rounded-xl overflow-hidden border"
      style={{ backgroundColor: c.background, borderColor: c.border }}
    >
      {/* Mini nav bar */}
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ backgroundColor: c.surface }}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.primary }} />
        <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: c.border }} />
        <div className="w-10 h-1.5 rounded-full" style={{ backgroundColor: c.primary }} />
      </div>
      {/* Mini hero */}
      <div className="px-3 py-2 flex gap-2 items-center">
        <div className="flex-1 space-y-1.5">
          <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: c.text.primary }} />
          <div className="h-1.5 w-full rounded-full opacity-60" style={{ backgroundColor: c.text.secondary }} />
          <div className="h-1.5 w-2/3 rounded-full opacity-40" style={{ backgroundColor: c.text.muted }} />
          <div
            className="mt-2 h-5 w-16 rounded-md flex items-center justify-center"
            style={{ backgroundColor: c.primary }}
          >
            <div className="h-1.5 w-8 rounded-full bg-white/70" />
          </div>
        </div>
        <div
          className="w-16 h-16 rounded-lg flex-shrink-0"
          style={{ backgroundColor: c.surface, border: `1px solid ${c.border}` }}
        />
      </div>
    </div>
  );
}

export default function ThemesTab() {
  const { activeThemeId, applyTheme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ThemeTemplate | null>(null);

  const filtered = selectedCategory === 'all'
    ? THEME_TEMPLATES
    : THEME_TEMPLATES.filter(t => t.category === selectedCategory);

  const handleApply = async (template: ThemeTemplate) => {
    if (saving) return;
    setSaving(template.id);
    await applyTheme(template.id, true);
    setSaving(null);
    setSaved(template.id);
    setTimeout(() => setSaved(null), 3000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
              <Palette className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-[#f0f6ff]">Theme Templates</h2>
          </div>
          <p className="text-[#9cb8d9] text-sm ml-13">
            Click <strong className="text-[#8caad4]">Apply</strong> on any template to instantly change the site's look.
            Changes save automatically and are visible to all visitors.
          </p>
        </div>
        <div className="text-right text-xs text-[#3a5a82]">
          <span className="text-[#9cb8d9] font-medium">{THEME_TEMPLATES.length}</span> templates
        </div>
      </div>

      {/* Active Template Badge */}
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-600/10 border border-blue-500/20 rounded-xl">
        <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span className="text-sm text-[#8caad4]">Active template:</span>
        <span className="text-sm font-semibold text-[#f0f6ff]">
          {THEME_TEMPLATES.find(t => t.id === activeThemeId)?.name ?? activeThemeId}
        </span>
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => {
          const count = cat.id === 'all'
            ? THEME_TEMPLATES.length
            : THEME_TEMPLATES.filter(t => t.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#0b1a30] text-[#9cb8d9] hover:text-[#f0f6ff] border border-white/[0.08]'
              }`}
            >
              {cat.label}
              <span className="ml-1.5 text-xs opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((template, i) => {
            const isActive = activeThemeId === template.id;
            const isSaving = saving === template.id;
            const isSaved = saved === template.id;
            return (
              <motion.div
                key={template.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className={`relative bg-[#0b1a30]/70 border rounded-2xl overflow-hidden transition-all ${
                  isActive
                    ? 'border-blue-500/50 ring-1 ring-blue-500/30'
                    : 'border-white/[0.08] hover:border-white/[0.15]'
                }`}
              >
                {isActive && (
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 bg-blue-600 rounded-full text-xs font-semibold text-white">
                    <Check className="w-3 h-3" /> Active
                  </div>
                )}
                {isSaved && !isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 bg-emerald-600 rounded-full text-xs font-semibold text-white"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Applied!
                  </motion.div>
                )}

                {/* Mini Preview */}
                <div className="p-3 pb-0">
                  <TemplateMiniPreview template={template} />
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-[#f0f6ff] text-sm leading-snug">
                      {template.name}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      template.category === 'luxury'    ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30' :
                      template.category === 'medical'   ? 'bg-blue-500/15 text-blue-300' :
                      template.category === 'corporate' ? 'bg-slate-500/15 text-slate-300' :
                      template.category === 'modern'    ? 'bg-blue-500/15 text-purple-300' :
                      template.category === 'minimal'   ? 'bg-gray-500/15 text-[#8caad4]' :
                      template.category === 'vibrant'   ? 'bg-pink-500/15 text-pink-300' :
                                                         'bg-zinc-500/15 text-zinc-300'
                    }`}>
                      {template.category}
                    </span>

                  </div>
                  <p className="text-[#3a5a82] text-xs leading-relaxed mb-3">
                    {template.description}
                  </p>
                  <ColorSwatch colors={template.colors} />

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-[#0f2040] hover:bg-[#162d58] border border-white/[0.08] rounded-xl text-[#9cb8d9] hover:text-[#f0f6ff] transition-all text-xs"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                    <button
                      onClick={() => handleApply(template)}
                      disabled={!!saving || isActive}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_2px_12px_rgba(37,99,235,0.3)] disabled:opacity-50'
                      }`}
                    >
                      {isSaving ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Applying...</>
                      ) : isActive ? (
                        <><Check className="w-3.5 h-3.5" /> Current Theme</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5" /> Apply Theme</>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
            onClick={() => setPreviewTemplate(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#0b1a30] border border-white/[0.12] rounded-2xl p-6 w-full max-w-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#f0f6ff] font-bold text-lg">{previewTemplate.name}</h3>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  aria-label="Close theme preview"
                  className="w-8 h-8 rounded-lg bg-[#0f2040] hover:bg-[#162d58] flex items-center justify-center text-[#9cb8d9] hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Large preview */}
              <div
                className="w-full h-48 rounded-xl overflow-hidden border mb-4"
                style={{ backgroundColor: previewTemplate.colors.background, borderColor: previewTemplate.colors.border }}
              >
                {/* Nav */}
                <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: previewTemplate.colors.surface }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md" style={{ backgroundColor: previewTemplate.colors.primary }} />
                    <div className="h-2 w-20 rounded-full" style={{ backgroundColor: previewTemplate.colors.text.primary }} />
                  </div>
                  <div className="flex gap-3">
                    {[1,2,3].map(i => (
                      <div key={i} className="h-1.5 w-8 rounded-full opacity-60" style={{ backgroundColor: previewTemplate.colors.text.secondary }} />
                    ))}
                  </div>
                  <div className="h-6 w-14 rounded-lg" style={{ backgroundColor: previewTemplate.colors.primary }} />
                </div>
                {/* Hero */}
                <div className="flex items-center gap-6 px-4 py-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-4/5 rounded-full" style={{ backgroundColor: previewTemplate.colors.text.primary }} />
                    <div className="h-2 w-full rounded-full opacity-70" style={{ backgroundColor: previewTemplate.colors.text.secondary }} />
                    <div className="h-2 w-3/4 rounded-full opacity-50" style={{ backgroundColor: previewTemplate.colors.text.secondary }} />
                    <div className="flex gap-2 mt-3">
                      <div className="h-7 w-20 rounded-lg" style={{ backgroundColor: previewTemplate.colors.primary }} />
                      <div className="h-7 w-16 rounded-lg border" style={{ borderColor: previewTemplate.colors.border }} />
                    </div>
                  </div>
                  <div className="w-24 h-20 rounded-xl" style={{ backgroundColor: previewTemplate.colors.surface, border: `1px solid ${previewTemplate.colors.border}` }} />
                </div>
              </div>

              {/* Theme details */}
              <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                <div className="bg-[#060f1e] rounded-xl p-3">
                  <div className="text-[#3a5a82] mb-2">Color Palette</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(previewTemplate.colors).filter(([k]) => typeof previewTemplate.colors[k as keyof typeof previewTemplate.colors] === 'string').map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: v as string }} />
                        <span className="text-[#9cb8d9]">{k}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-[#060f1e] rounded-xl p-3 space-y-1.5">
                  <div className="text-[#3a5a82] mb-2">Settings</div>
                  <div className="text-[#9cb8d9]">Card: <span className="text-[#8caad4]">{previewTemplate.skeleton.cardStyle}</span></div>
                  <div className="text-[#9cb8d9]">Hover: <span className="text-[#8caad4]">{previewTemplate.animations.hoverEffect}</span></div>
                  <div className="text-[#9cb8d9]">Transition: <span className="text-[#8caad4]">{previewTemplate.animations.pageTransition}</span></div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-[#9cb8d9] hover:text-white transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await handleApply(previewTemplate);
                    setPreviewTemplate(null);
                  }}
                  disabled={activeThemeId === previewTemplate.id}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Apply This Theme
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
