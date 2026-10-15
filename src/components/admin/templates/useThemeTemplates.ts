/**
 * Data hook for the admin Templates gallery. Built-in templates come from
 * code; custom ones live in Firestore `themeTemplates` (admin-only).
 * Apply snapshots the current active theme to `settings/themeHistory`
 * (last 5) so it can be undone.
 */
import { useCallback, useEffect, useState } from 'react';
import { THEME_TEMPLATES, type ThemeTemplate } from '@/themes/templates';
import { useTheme } from '@/contexts/ThemeContext';
import { logAdminAction } from '@/lib/admin-audit';
import { auth, db, collection, deleteDoc, doc, getDoc, getDocs, setDoc } from '@/lib/firebase';

export interface GalleryTemplate extends ThemeTemplate {
  isCustom: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface ThemeSnapshot {
  templateId: string;
  customTemplate?: ThemeTemplate | null;
  savedAt: string;
}

const HISTORY_LIMIT = 5;
const BUILT_IN: GalleryTemplate[] = THEME_TEMPLATES.map((t) => ({ ...t, isCustom: false }));

function stripMeta(t: GalleryTemplate): ThemeTemplate {
  const { isCustom: _i, createdAt: _c, updatedAt: _u, createdBy: _b, ...rest } = t;
  return rest;
}

export function useThemeTemplates() {
  const { activeThemeId, applyTheme } = useTheme();
  const [custom, setCustom] = useState<GalleryTemplate[]>([]);
  const [usage, setUsage] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<ThemeSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [snap, usageSnap, histSnap] = await Promise.all([
        getDocs(collection(db, 'themeTemplates')),
        getDoc(doc(db, 'settings', 'themeUsage')),
        getDoc(doc(db, 'settings', 'themeHistory')),
      ]);
      setCustom(snap.docs.map((d) => ({ ...(d.data() as GalleryTemplate), id: d.id, isCustom: true })));
      setUsage((usageSnap.data() as Record<string, string>) ?? {});
      setHistory(((histSnap.data()?.entries as ThemeSnapshot[]) ?? []).slice(-HISTORY_LIMIT));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const templates: GalleryTemplate[] = [...BUILT_IN, ...custom];

  const saveTemplate = useCallback(async (t: GalleryTemplate, mode: 'create' | 'update' | 'duplicate') => {
    const now = new Date().toISOString();
    const before = custom.find((c) => c.id === t.id) ?? null;
    const data: GalleryTemplate = {
      ...t,
      isCustom: true,
      createdAt: mode === 'update' ? t.createdAt ?? now : now,
      updatedAt: now,
      createdBy: t.createdBy ?? auth.currentUser?.uid ?? 'unknown',
    };
    await setDoc(doc(db, 'themeTemplates', data.id), data);
    await logAdminAction({ action: `theme.template.${mode}` as const, target: `themeTemplates/${data.id}`, before, after: data });
    await load();
  }, [custom, load]);

  const deleteTemplate = useCallback(async (t: GalleryTemplate) => {
    if (!t.isCustom) throw new Error('Built-in templates cannot be deleted');
    if (t.id === activeThemeId) throw new Error('You cannot delete the active template');
    await deleteDoc(doc(db, 'themeTemplates', t.id));
    await logAdminAction({ action: 'theme.template.delete', target: `themeTemplates/${t.id}`, before: t });
    await load();
  }, [activeThemeId, load]);

  const writeActive = async (snap: { templateId: string; customTemplate?: ThemeTemplate | null }) => {
    await setDoc(doc(db, 'settings', 'activeTheme'), {
      templateId: snap.templateId,
      ...(snap.customTemplate ? { customTemplate: snap.customTemplate } : {}),
      appliedAt: new Date().toISOString(),
    });
  };

  const apply = useCallback(async (t: GalleryTemplate) => {
    const current = await getDoc(doc(db, 'settings', 'activeTheme'));
    const prev: ThemeSnapshot = {
      templateId: (current.data()?.templateId as string) ?? activeThemeId,
      customTemplate: (current.data()?.customTemplate as ThemeTemplate | undefined) ?? null,
      savedAt: new Date().toISOString(),
    };
    const nextHistory = [...history, prev].slice(-HISTORY_LIMIT);
    await setDoc(doc(db, 'settings', 'themeHistory'), { entries: nextHistory });
    await setDoc(doc(db, 'settings', 'themeUsage'), { [t.id]: new Date().toISOString() }, { merge: true });
    await logAdminAction({ action: 'theme.apply', target: 'settings/activeTheme', before: prev, after: { templateId: t.id } });
    if (t.isCustom) {
      await writeActive({ templateId: t.id, customTemplate: stripMeta(t) });
      window.location.reload();
      return;
    }
    await applyTheme(t.id, true);
    await load();
  }, [activeThemeId, applyTheme, history, load]);

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last) return;
    await writeActive(last);
    await setDoc(doc(db, 'settings', 'themeHistory'), { entries: history.slice(0, -1) });
    await logAdminAction({ action: 'theme.undo', target: 'settings/activeTheme', after: last });
    if (last.customTemplate) { window.location.reload(); return; }
    await applyTheme(last.templateId, false);
    await load();
  }, [applyTheme, history, load]);

  return { templates, usage, history, loading, error, activeThemeId, saveTemplate, deleteTemplate, apply, undo };
}
