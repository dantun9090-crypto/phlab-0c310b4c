/**
 * useTheme Hook
 * Manages active theme and applies CSS variables
 */

import { useEffect, useState } from 'react';
import { getTemplateById, DEFAULT_TEMPLATE_ID, type ThemeTemplate } from '@/themes/templates';

export function useTheme() {
  const [activeThemeId, setActiveThemeId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [theme, setTheme] = useState<ThemeTemplate | undefined>(getTemplateById(DEFAULT_TEMPLATE_ID));

  // Apply theme to document root
  useEffect(() => {
    if (!theme) return;

    const root = document.documentElement;

    // Apply color CSS variables
    root.style.setProperty('--color-primary', theme.colors.primary);
    root.style.setProperty('--color-secondary', theme.colors.secondary);
    root.style.setProperty('--color-accent', theme.colors.accent);
    root.style.setProperty('--color-background', theme.colors.background);
    root.style.setProperty('--color-surface', theme.colors.surface);
    root.style.setProperty('--color-text-primary', theme.colors.text.primary);
    root.style.setProperty('--color-text-secondary', theme.colors.text.secondary);
    root.style.setProperty('--color-text-muted', theme.colors.text.muted);
    root.style.setProperty('--color-border', theme.colors.border);

    // Apply typography
    root.style.setProperty('--font-heading', theme.typography.headingFont);
    root.style.setProperty('--font-body', theme.typography.bodyFont);

    // Store in localStorage
    localStorage.setItem('activeThemeId', theme.id);

  }, [theme]);

  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('activeThemeId');
    if (stored && stored !== activeThemeId) {
      const newTheme = getTemplateById(stored);
      if (newTheme) {
        setActiveThemeId(stored);
        setTheme(newTheme);
      }
    }
  }, []);

  const changeTheme = (themeId: string) => {
    const newTheme = getTemplateById(themeId);
    if (newTheme) {
      setActiveThemeId(themeId);
      setTheme(newTheme);
    }
  };

  return {
    theme,
    activeThemeId,
    changeTheme,
  };
}
