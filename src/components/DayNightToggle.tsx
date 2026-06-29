/**
 * Day/Night theme toggle.
 *
 * Toggles a `light` class on <html> and persists the choice in
 * localStorage. Defaults to dark (the locked PH Labs design).
 *
 * Two variants:
 *  - "floating" (default) — fixed bottom-left pill, used as a fallback.
 *  - "inline"  — compact icon button suitable for the header bar.
 *
 * Light-mode visual overrides live in src/styles.css under `html.light`.
 * This component is presentation-only.
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

export default function DayNightToggle({ variant = 'floating' }: { variant?: 'floating' | 'inline' }) {
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
  const label = isLight ? 'Switch to night mode' : 'Switch to day mode';
  const Icon = isLight ? Moon : Sun;

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={isLight}
        title={isLight ? 'Night mode' : 'Day mode'}
        className={
          'group relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-all duration-300 ' +
          (isLight
            ? 'text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
            : 'text-[#7a9ec8] hover:text-white border-transparent hover:border-white/[0.08] hover:bg-white/[0.06]')
        }
      >
        <Icon className="w-[17px] h-[17px] transition-colors group-hover:text-emerald-500" />
      </button>
    );
  }


  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={isLight}
      title={isLight ? 'Night mode' : 'Day mode'}
      className="fixed bottom-4 left-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-emerald-400 shadow-lg backdrop-blur transition hover:bg-slate-800 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      style={{ printColorAdjust: 'exact' }}
    >
      <Icon size={18} />
    </button>
  );
}
