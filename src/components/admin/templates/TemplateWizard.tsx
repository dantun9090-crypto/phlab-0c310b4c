import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminModal } from './AdminOverlay';
import type { ThemeTemplate } from '@/themes/templates';
import { TemplateThumb } from './TemplateThumb';
import type { GalleryTemplate } from './useThemeTemplates';

interface TemplateWizardProps {
  open: boolean;
  initial: GalleryTemplate | null;
  mode: 'create' | 'update';
  onClose: () => void;
  onSave: (t: GalleryTemplate) => Promise<void>;
}

const STEPS = ['Basics', 'Colours', 'Style', 'Review'] as const;
const CATEGORIES: ThemeTemplate['category'][] = ['luxury', 'medical', 'corporate', 'modern', 'minimal', 'vibrant', 'dark'];
const FONTS = ['Inter, sans-serif', 'DM Sans, sans-serif', 'Space Grotesk, sans-serif', 'Montserrat, sans-serif', 'Playfair Display, serif', 'Georgia, serif'];
const INPUT = 'w-full border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg px-3';

const BLANK: GalleryTemplate = {
  id: '', name: '', description: '', category: 'medical', preview: '', isCustom: true,
  colors: { primary: '#10b981', secondary: '#3b82f6', accent: '#38bdf8', background: '#020617', surface: '#0f172a', text: { primary: '#ffffff', secondary: '#cbd5e1', muted: '#64748b' }, border: '#1e293b' },
  skeleton: { headerStyle: 'standard', heroLayout: 'split', cardStyle: 'elevated', footerStyle: 'standard' },
  animations: { pageTransition: 'fade', hoverEffect: 'lift', scrollReveal: true, particleEffects: false },
  typography: { headingFont: 'Inter, sans-serif', bodyFont: 'Inter, sans-serif', scale: 'standard' },
};

function slug(name: string) {
  return `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${Date.now().toString(36)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#9cb8d9]">{label}</span>
      {children}
    </label>
  );
}

/** Multi-step create/edit modal for custom templates. */
export function TemplateWizard({ open, initial, mode, onClose, onSave }: TemplateWizardProps) {
  const [step, setStep] = useState(0);
  const [t, setT] = useState<GalleryTemplate>(initial ?? BLANK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setColor = (key: string, value: string) => setT((p) => {
    if (key.startsWith('text.')) return { ...p, colors: { ...p.colors, text: { ...p.colors.text, [key.slice(5)]: value } } };
    return { ...p, colors: { ...p.colors, [key]: value } };
  });
  const colorFields: Array<[string, string, string]> = [
    ['primary', 'Primary', t.colors.primary], ['secondary', 'Secondary', t.colors.secondary], ['accent', 'Accent', t.colors.accent],
    ['background', 'Background', t.colors.background], ['surface', 'Cards / surface', t.colors.surface], ['border', 'Border', t.colors.border],
    ['text.primary', 'Text', t.colors.text.primary], ['text.secondary', 'Text secondary', t.colors.text.secondary], ['text.muted', 'Text muted', t.colors.text.muted],
  ];
  const canNext = step !== 0 || t.name.trim().length >= 2;

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await onSave({ ...t, name: t.name.trim(), id: t.id || slug(t.name) });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save template');
    } finally { setSaving(false); }
  };

  return (
    <AdminModal open={open} onClose={onClose} label={mode === 'create' ? 'Create template' : 'Edit template'} className="max-w-2xl max-h-[92vh] overflow-y-auto space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{mode === 'create' ? 'Create template' : `Edit ${initial?.name ?? 'template'}`}</h3>
          <p className="text-sm text-[#9cb8d9]">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        </div>

        <ol className="flex gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-blue-500' : 'bg-white/10'}`} aria-current={i === step ? 'step' : undefined} />
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="space-y-4 py-2">
            {step === 0 && (
              <>
                <Field label="Template name"><input className={INPUT} value={t.name} maxLength={60} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="e.g. Clinical Night" /></Field>
                <Field label="Category">
                  <select className={INPUT} value={t.category} onChange={(e) => setT({ ...t, category: e.target.value as ThemeTemplate['category'] })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Description"><textarea className={`${INPUT} py-2`} rows={3} maxLength={240} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} /></Field>
              </>
            )}
            {step === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {colorFields.map(([key, label, value]) => (
                  <Field key={key} label={label}>
                    <div className="flex gap-2">
                      <input type="color" aria-label={`${label} colour`} value={value.startsWith('#') ? value.slice(0, 7) : '#000000'} onChange={(e) => setColor(key, e.target.value)} className="h-12 w-12 shrink-0 rounded-lg border-2 border-slate-600 bg-slate-800" />
                      <input className={INPUT} value={value} onChange={(e) => setColor(key, e.target.value)} />
                    </div>
                  </Field>
                ))}
              </div>
            )}
            {step === 2 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Card style">
                  <select className={INPUT} value={t.skeleton.cardStyle} onChange={(e) => setT({ ...t, skeleton: { ...t.skeleton, cardStyle: e.target.value as ThemeTemplate['skeleton']['cardStyle'] } })}>
                    {['flat', 'outlined', 'elevated', 'glass', 'gradient'].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Header style">
                  <select className={INPUT} value={t.skeleton.headerStyle} onChange={(e) => setT({ ...t, skeleton: { ...t.skeleton, headerStyle: e.target.value as ThemeTemplate['skeleton']['headerStyle'] } })}>
                    {['minimal', 'standard', 'centered', 'split', 'floating'].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Hero layout">
                  <select className={INPUT} value={t.skeleton.heroLayout} onChange={(e) => setT({ ...t, skeleton: { ...t.skeleton, heroLayout: e.target.value as ThemeTemplate['skeleton']['heroLayout'] } })}>
                    {['split', 'centered', 'full-width', 'asymmetric', 'minimal'].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Text size">
                  <select className={INPUT} value={t.typography.scale} onChange={(e) => setT({ ...t, typography: { ...t.typography, scale: e.target.value as ThemeTemplate['typography']['scale'] } })}>
                    {['compact', 'standard', 'large'].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Heading font">
                  <select className={INPUT} value={t.typography.headingFont} onChange={(e) => setT({ ...t, typography: { ...t.typography, headingFont: e.target.value } })}>
                    {[...new Set([t.typography.headingFont, ...FONTS])].map((v) => <option key={v} value={v}>{v.split(',')[0]}</option>)}
                  </select>
                </Field>
                <Field label="Body font">
                  <select className={INPUT} value={t.typography.bodyFont} onChange={(e) => setT({ ...t, typography: { ...t.typography, bodyFont: e.target.value } })}>
                    {[...new Set([t.typography.bodyFont, ...FONTS])].map((v) => <option key={v} value={v}>{v.split(',')[0]}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-3">
                <TemplateThumb template={t} size="lg" />
                <p className="text-sm text-[#9cb8d9]"><strong className="text-[#f0f6ff]">{t.name}</strong> · {t.category}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {err && <p role="alert" className="text-sm text-red-400">{err}</p>}

        <div className="flex justify-between gap-3 pt-2">
          <button type="button" onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] text-[#9cb8d9] hover:text-white flex items-center gap-1.5">
            <ChevronLeft className="w-4 h-4" />{step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 flex items-center gap-1.5">
              Next<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={save} className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 flex items-center gap-1.5">
              <Check className="w-4 h-4" />{saving ? 'Saving…' : 'Save template'}
            </button>
          )}
        </div>
    </AdminModal>
  );
}
