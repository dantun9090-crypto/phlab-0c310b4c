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
          'group relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border overflow-hidden transition-all duration-300 ' +
          (isLight
            ? 'text-amber-600 border-amber-200/80 bg-gradient-to-br from-amber-50 to-white hover:from-amber-100 hover:to-amber-50 hover:border-amber-300 shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
            : 'text-[#9bbce3] border-white/[0.08] bg-gradient-to-br from-slate-900/40 to-slate-800/20 hover:from-slate-800/60 hover:to-slate-700/40 hover:border-white/15 hover:text-white')
        }
      >
        {/* Sun rays glow in light mode */}
        {isLight && (
          <span aria-hidden className="absolute inset-0 rounded-xl bg-amber-300/0 group-hover:bg-amber-300/10 transition-colors duration-300" />
        )}
        <span className="relative inline-flex items-center justify-center w-[18px] h-[18px]">
          <Sun
            aria-hidden
            className={
              'absolute inset-0 w-[18px] h-[18px] transition-all duration-500 ' +
              (isLight ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50')
            }
            strokeWidth={2.25}
          />
          <Moon
            aria-hidden
            className={
              'absolute inset-0 w-[18px] h-[18px] transition-all duration-500 ' +
              (isLight ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100')
            }
            strokeWidth={2.25}
          />
        </span>
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
