/**
 * Small floating Day/Night theme toggle.
 *
 * Toggles a `light` class on <html> and persists the choice in
 * localStorage. Defaults to dark (the locked PH Labs design).
 *
 * Light-mode visual overrides live in src/styles.css under `html.light`.
 * This component is presentation-only — it does NOT change brand colors,
 * layout, or any locked design tokens.
 */
import { useEffect, useState, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'phlabs-theme-mode'; // 'dark' | 'light'

function applyMode(mode: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'light') {
    root.classList.add('light');
    root.setAttribute('data-theme-mode', 'light');
  } else {
    root.classList.remove('light');
    root.setAttribute('data-theme-mode', 'dark');
  }
}

export default function DayNightToggle() {
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = (localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null) ?? 'dark';
      setMode(stored);
      applyMode(stored);
    } catch {
      applyMode('dark');
    }
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      applyMode(next);
      return next;
    });
  }, []);

  if (!mounted) return null;

  const isLight = mode === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? 'Switch to night mode' : 'Switch to day mode'}
      aria-pressed={isLight}
      title={isLight ? 'Night mode' : 'Day mode'}
      className="fixed bottom-4 left-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-emerald-400 shadow-lg backdrop-blur transition hover:bg-slate-800 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      style={{ printColorAdjust: 'exact' }}
    >
      {isLight ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
