/**
 * ThemeContext — applies CSS variables globally from active theme
 * Persists to localStorage + Firestore (admin-saved preference)
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

import { db, doc, getDoc, setDoc } from '@/lib/firebase';
import { getTemplateById, DEFAULT_TEMPLATE_ID, type ThemeTemplate } from '@/themes/templates';

interface ThemeContextValue {
  activeThemeId: string;
  theme: ThemeTemplate;
  applyTheme: (themeId: string, persist?: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeCSSVars(template: ThemeTemplate) {
  const root = document.documentElement;
  const c = template.colors;

  // Core palette — these map to CSS overrides in index.css
  root.style.setProperty('--theme-primary',     c.primary);
  root.style.setProperty('--theme-secondary',   c.secondary);
  root.style.setProperty('--theme-accent',      c.accent);
  root.style.setProperty('--theme-bg',          c.background);
  root.style.setProperty('--theme-surface',     c.surface);
  root.style.setProperty('--theme-surface2',    c.surface); // darker variant
  root.style.setProperty('--theme-text',        c.text.primary);
  root.style.setProperty('--theme-text-sub',    c.text.secondary);
  root.style.setProperty('--theme-text-muted',  c.text.muted);
  root.style.setProperty('--theme-border',      c.border);

  // Also update the legacy design tokens so utility classes pick them up
  root.style.setProperty('--color-navy-950',       c.background);
  root.style.setProperty('--color-navy-900',       c.background);
  root.style.setProperty('--color-navy-800',       c.surface);
  root.style.setProperty('--color-blue-vivid',     c.primary);
  root.style.setProperty('--color-blue-bright',    c.secondary);
  root.style.setProperty('--color-blue-light',     c.accent);
  root.style.setProperty('--color-text-primary',   c.text.primary);
  root.style.setProperty('--color-text-secondary', c.text.secondary);
  root.style.setProperty('--color-text-muted',     c.text.muted);

  // Direct body override for instant visual change
  document.body.style.backgroundColor = c.background;
  document.body.style.color = c.text.primary;
  document.body.style.fontFamily = template.typography.bodyFont;

  // Force all min-h-screen wrappers (page roots) to use theme background
  document.querySelectorAll<HTMLElement>('.min-h-screen').forEach(el => {
    el.style.backgroundColor = c.background;
  });

  // Force nav/header background
  document.querySelectorAll<HTMLElement>('nav, header').forEach(el => {
    el.style.backgroundColor = c.background;
  });

  // Force footer background
  document.querySelectorAll<HTMLElement>('footer').forEach(el => {
    el.style.backgroundColor = c.background;
  });

  // Patch inline-style section/div backgrounds — catches hardcoded #hex in style props
  // Deferred via rAF so it never blocks the main thread
  const BG_RE = /^#([0-9a-fA-F]{3,8})$/;
  const DARK_HEX_SET = new Set([
    '#060f1e','#030812','#040d1a','#040c18','#020810','#010608',
    '#03080f','#030c1a','#020a15','#04101f','#050d1a','#071228',
    '#020a18','#041630','#010610','#040d1c','#020d06','#061a10',
    '#04110a','#0b1a30','#061224','#07111f','#050f1c','#071526',
  ]);
  const SURFACE_HEX_SET = new Set([
    '#0b1a30','#04101f','#071526','#061224','#07111f','#050f1c',
    '#050d1a','#071228',
  ]);
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('section, div, main, article').forEach(el => {
      const bg = el.style.backgroundColor || el.style.background;
      if (!bg) return;
      // Extract first hex value from the style (handles gradients too)
      const match = bg.match(/#([0-9a-fA-F]{3,8})\b/);
      if (!match) return;
      const hex = '#' + match[1].toLowerCase();
      if (SURFACE_HEX_SET.has(hex)) {
        el.style.backgroundColor = c.surface;
        el.style.background = c.surface;
      } else if (DARK_HEX_SET.has(hex) || BG_RE.test(hex)) {
        // Only replace known dark navy bg shades
        if (DARK_HEX_SET.has(hex)) {
          el.style.backgroundColor = c.background;
          el.style.background = c.background;
        }
      }
    });
  });

  // Data attribute for CSS targeting
  root.setAttribute('data-theme', template.id);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeThemeId, setActiveThemeId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [theme, setTheme] = useState<ThemeTemplate>(
    getTemplateById(DEFAULT_TEMPLATE_ID)!
  );

  // On mount: check localStorage first (instant), then Firestore (background sync)
  useEffect(() => {
    const stored = localStorage.getItem('activeThemeId') || DEFAULT_TEMPLATE_ID;
    const localTheme = getTemplateById(stored) ?? getTemplateById(DEFAULT_TEMPLATE_ID)!;
    setActiveThemeId(localTheme.id);
    setTheme(localTheme);
    applyThemeCSSVars(localTheme);

    // Background sync from Firestore
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'activeTheme'));
        if (snap.exists()) {
          const id = snap.data()?.templateId as string;
          const firestoreTheme = getTemplateById(id);
          if (firestoreTheme && firestoreTheme.id !== localTheme.id) {
            setActiveThemeId(firestoreTheme.id);
            setTheme(firestoreTheme);
            applyThemeCSSVars(firestoreTheme);
            localStorage.setItem('activeThemeId', firestoreTheme.id);
          }
        }
      } catch {
        // Silent fail — local theme already applied
      }
    })();
  }, []);

  const applyTheme = useCallback(async (themeId: string, persist = true) => {
    const newTheme = getTemplateById(themeId);
    if (!newTheme) return;

    setActiveThemeId(newTheme.id);
    setTheme(newTheme);
    applyThemeCSSVars(newTheme);
    localStorage.setItem('activeThemeId', newTheme.id);

    if (persist) {
      try {
        await setDoc(doc(db, 'settings', 'activeTheme'), {
          templateId: newTheme.id,
          appliedAt: new Date().toISOString(),
        });
      } catch {
        // Silent fail — theme applied locally already
      }
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ activeThemeId, theme, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
