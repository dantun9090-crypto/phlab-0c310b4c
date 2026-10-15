import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Copy, Eye, LayoutGrid, List, MoreHorizontal, Palette, Pencil, Plus, Search, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { AdminMenu, AdminModal } from './AdminOverlay';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateThumb } from './TemplateThumb';
import { TemplateWizard } from './TemplateWizard';
import { useThemeTemplates, type GalleryTemplate } from './useThemeTemplates';

const CATEGORIES = ['all', 'custom', 'luxury', 'medical', 'corporate', 'modern', 'minimal', 'vibrant', 'dark'] as const;
type Sort = 'name' | 'newest' | 'used';
type Confirm = { kind: 'apply' | 'delete'; t: GalleryTemplate } | { kind: 'undo' } | null;

function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
}

interface CardProps {
  t: GalleryTemplate;
  index: number;
  active: boolean;
  view: 'grid' | 'list';
  onPreview: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TemplateCard({ t, index, active, view, onPreview, onEdit, onDuplicate, onDelete }: CardProps) {
  const actions = [
    { label: 'Preview', icon: Eye, run: onPreview, show: true },
    { label: 'Edit', icon: Pencil, run: onEdit, show: t.isCustom },
    { label: 'Duplicate', icon: Copy, run: onDuplicate, show: true },
    { label: 'Delete', icon: Trash2, run: onDelete, show: t.isCustom && !active },
  ].filter((a) => a.show);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, delay: Math.min(index, 12) * 0.04 }}
      className={`group relative bg-[#0b1a30]/70 border rounded-2xl ${view === 'list' ? 'flex flex-col sm:flex-row gap-4 p-3' : ''} ${active ? 'border-blue-500/50 ring-1 ring-blue-500/30' : 'border-white/[0.08] hover:border-white/[0.18]'}`}
    >
      <button type="button" onClick={onPreview} className={`relative block text-left ${view === 'list' ? 'sm:w-56 shrink-0' : 'p-3 pb-0 w-full'}`} aria-label={`Preview ${t.name}`}>
        <TemplateThumb template={t} />
        {active && <span className="absolute top-5 left-5 flex items-center gap-1 px-2 py-1 bg-blue-600 rounded-full text-xs font-semibold text-white"><CheckCircle2 className="w-3 h-3" />Active</span>}
      </button>
      {/* Desktop hover / focus actions */}
      <div className={`hidden lg:flex absolute ${view === 'list' ? 'top-3 right-3' : 'top-5 right-5'} gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity`}>
        {actions.map((a) => (
          <button key={a.label} type="button" onClick={a.run} title={a.label} aria-label={`${a.label} ${t.name}`} className={`w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur bg-[#060f1e]/85 border border-white/[0.12] ${a.label === 'Delete' ? 'text-red-300 hover:text-red-200' : 'text-[#c4d6ee] hover:text-white'}`}>
            <a.icon className="w-4 h-4" />
          </button>
        ))}
      </div>
      <div className={`${view === 'list' ? 'flex-1 py-1 pr-10' : 'p-4'} min-w-0`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[#f0f6ff] text-sm leading-snug truncate">{t.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-200 capitalize">{t.isCustom ? 'custom' : t.category}</span>
            <AdminMenu className="lg:hidden" label={`Actions for ${t.name}`} trigger={<MoreHorizontal className="w-4 h-4" />}
              items={actions.map((a) => ({ label: a.label, icon: a.icon, run: a.run, danger: a.label === 'Delete' }))} />
          </div>
        </div>
        <p className="text-xs text-[#6f8fb8] mt-1">{t.isCustom ? `Last edited ${fmt(t.updatedAt) ?? '—'}` : 'Built-in — duplicate to edit'}</p>
        {view === 'list' && <p className="text-xs text-[#9cb8d9] mt-2 line-clamp-2">{t.description}</p>}
      </div>
    </motion.article>
  );
}

function EmptyState({ onCreate, filtered }: { onCreate: () => void; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6 border border-dashed border-white/[0.12] rounded-2xl">
      <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden="true" className="mb-5">
        <rect x="10" y="14" width="70" height="52" rx="10" fill="#0f2040" stroke="#2b4a78" />
        <rect x="40" y="26" width="70" height="52" rx="10" fill="#0b1a30" stroke="#3b82f6" />
        <rect x="50" y="38" width="30" height="6" rx="3" fill="#3b82f6" />
        <rect x="50" y="50" width="48" height="4" rx="2" fill="#2b4a78" />
        <circle cx="96" cy="16" r="8" fill="#10b981" />
      </svg>
      <h3 className="text-[#f0f6ff] font-semibold">{filtered ? 'No templates match' : 'No custom templates yet'}</h3>
      <p className="text-sm text-[#9cb8d9] mt-1 max-w-sm">{filtered ? 'Try another search or category, or build your own.' : 'Create your first template or duplicate a built-in one.'}</p>
      <button type="button" onClick={onCreate} className="mt-5 min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2"><Plus className="w-4 h-4" />Create template</button>
    </div>
  );
}

/** Admin Templates gallery — lazy-loaded from ThemesTab (admin chunk only). */
export default function TemplateGallery() {
  const { templates, usage, history, loading, error, activeThemeId, saveTemplate, deleteTemplate, apply, undo } = useThemeTemplates();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [preview, setPreview] = useState<GalleryTemplate | null>(null);
  const [wizard, setWizard] = useState<{ mode: 'create' | 'update'; t: GalleryTemplate | null; dup?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = templates.filter((t) =>
      (cat === 'all' || (cat === 'custom' ? t.isCustom : t.category === cat)) &&
      (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)));
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'newest' ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
          : (usage[b.id] ?? '').localeCompare(usage[a.id] ?? ''));
  }, [templates, cat, query, sort, usage]);

  const activeName = templates.find((t) => t.id === activeThemeId)?.name ?? activeThemeId;
  const duplicate = (t: GalleryTemplate) => setWizard({ mode: 'create', dup: true, t: { ...t, id: '', isCustom: true, name: `${t.name} (copy)`, createdAt: undefined, updatedAt: undefined, createdBy: undefined } });

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true); setNotice(null);
    try {
      if (confirm.kind === 'apply') { await apply(confirm.t); setNotice(`Applied ${confirm.t.name}`); setPreview(null); }
      else if (confirm.kind === 'delete') { await deleteTemplate(confirm.t); setNotice(`Deleted ${confirm.t.name}`); }
      else { await undo(); setNotice('Previous theme restored'); }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setBusy(false); setConfirm(null); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><Palette className="w-5 h-5 text-blue-400" /></div>
          <div>
            <h2 className="text-xl font-bold text-[#f0f6ff]">Theme Templates</h2>
            <p className="text-sm text-[#9cb8d9]">Active: <strong className="text-[#f0f6ff]">{activeName}</strong> · {templates.length} templates</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={!history.length} onClick={() => setConfirm({ kind: 'undo' })} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] text-[#c4d6ee] hover:text-white disabled:opacity-40 flex items-center gap-2 text-sm"><Undo2 className="w-4 h-4" />Undo last apply</button>
          <button type="button" onClick={() => setWizard({ mode: 'create', t: null })} className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2 text-sm"><Plus className="w-4 h-4" />Create template</button>
        </div>
      </header>

      {notice && <div role="status" className="px-4 py-3 rounded-xl bg-blue-600/10 border border-blue-500/20 text-sm text-[#c4d6ee]">{notice}</div>}
      {error && <div role="alert" className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">Custom templates could not load: {error}. Built-in templates still work.</div>}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="w-full border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg pl-9 pr-3" />
        </div>
        <div className="flex gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort templates" className="border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg px-3">
            <option value="name">Name</option><option value="newest">Newest</option><option value="used">Last used</option>
          </select>
          <div className="flex rounded-lg border-2 border-slate-600 overflow-hidden" role="group" aria-label="View">
            {(['grid', 'list'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} aria-label={`${v} view`} className={`w-12 flex items-center justify-center ${view === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {v === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map((c) => {
          const count = c === 'all' ? templates.length : templates.filter((t) => (c === 'custom' ? t.isCustom : t.category === c)).length;
          return (
            <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${cat === c ? 'bg-blue-600 text-white' : 'bg-[#0b1a30] text-[#9cb8d9] hover:text-[#f0f6ff] border border-white/[0.08]'}`}>
              {c}<span className="ml-1.5 text-xs opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.08] p-3 space-y-3">
              <Skeleton className="aspect-[16/10] w-full rounded-xl bg-white/[0.06]" />
              <Skeleton className="h-4 w-2/3 bg-white/[0.06]" />
              <Skeleton className="h-3 w-1/3 bg-white/[0.06]" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState filtered={!!query || cat !== 'all'} onCreate={() => setWizard({ mode: 'create', t: null })} />
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'flex flex-col gap-3'}>
          <AnimatePresence mode="popLayout">
            {visible.map((t, i) => (
              <TemplateCard key={t.id} t={t} index={i} view={view} active={t.id === activeThemeId}
                onPreview={() => setPreview(t)} onEdit={() => setWizard({ mode: 'update', t })}
                onDuplicate={() => duplicate(t)} onDelete={() => setConfirm({ kind: 'delete', t })} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Full-screen preview */}
      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#020617] flex flex-col" role="dialog" aria-modal="true" aria-label={`${preview.name} preview`}
            onKeyDown={(e) => e.key === 'Escape' && setPreview(null)}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-[#f0f6ff] font-bold">{preview.name}</h3>
                <p className="text-xs text-[#9cb8d9] capitalize">{preview.isCustom ? 'custom' : preview.category} · {preview.skeleton.cardStyle} cards</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {preview.isCustom && <button type="button" onClick={() => { setWizard({ mode: 'update', t: preview }); setPreview(null); }} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] text-[#c4d6ee] flex items-center gap-2 text-sm"><Pencil className="w-4 h-4" />Edit</button>}
                <button type="button" onClick={() => { duplicate(preview); setPreview(null); }} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] text-[#c4d6ee] flex items-center gap-2 text-sm"><Copy className="w-4 h-4" />Duplicate</button>
                <button type="button" disabled={preview.id === activeThemeId} onClick={() => setConfirm({ kind: 'apply', t: preview })} className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 flex items-center gap-2 text-sm"><Sparkles className="w-4 h-4" />{preview.id === activeThemeId ? 'Current theme' : 'Apply'}</button>
                <button type="button" autoFocus onClick={() => setPreview(null)} aria-label="Close preview" className="w-11 h-11 rounded-xl bg-[#0f2040] flex items-center justify-center text-[#c4d6ee]"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex-1 overflow-auto p-4 sm:p-8">
              <div className="max-w-5xl mx-auto space-y-4">
                <TemplateThumb template={preview} size="lg" />
                <p className="text-sm text-[#9cb8d9]">{preview.description}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {wizard && (
        <TemplateWizard key={wizard.t?.id ?? 'new'} open mode={wizard.mode} initial={wizard.t}
          onClose={() => setWizard(null)}
          onSave={(t) => saveTemplate(t, wizard.mode === 'update' ? 'update' : wizard.dup ? 'duplicate' : 'create')} />
      )}

      <AdminModal open={!!confirm} onClose={() => !busy && setConfirm(null)} label="Confirm action" className="max-w-md">
        <h3 className="text-lg font-semibold">{confirm?.kind === 'apply' ? `Apply ${confirm.t.name}?` : confirm?.kind === 'delete' ? `Delete ${confirm.t.name}?` : 'Undo last apply?'}</h3>
        <p className="text-sm text-[#9cb8d9] mt-2">
          {confirm?.kind === 'apply' ? 'All visitors will see this theme. The current theme is saved so you can undo.'
            : confirm?.kind === 'delete' ? 'This custom template will be removed permanently.'
              : 'The previous theme will be restored for all visitors.'}
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] text-[#c4d6ee]">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void runConfirm()} className={`min-h-[44px] px-4 rounded-xl text-white font-medium disabled:opacity-50 ${confirm?.kind === 'delete' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {busy ? 'Working…' : confirm?.kind === 'delete' ? 'Delete' : 'Confirm'}
          </button>
        </div>
      </AdminModal>
    </div>
  );
}
