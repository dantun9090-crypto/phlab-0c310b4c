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
    root.style.backgroundColor = '#ffffff';
    if (document.body) document.body.style.backgroundColor = '#ffffff';
  } else {
    root.classList.remove('light');
    root.setAttribute('data-theme-mode', 'dark');
    root.style.backgroundColor = '#060f1e';
    if (document.body) document.body.style.backgroundColor = '#060f1e';
  }
  // Let ThemeContext re-apply (clean up its inline surface patches in day
  // mode, repaint them in night mode).
  try {
    window.dispatchEvent(new CustomEvent('phlabs:theme-mode-changed', { detail: mode }));
  } catch { /* SSR / very old browsers */ }
}

function initialMode(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export default function DayNightToggle({ variant = 'floating' }: { variant?: 'floating' | 'inline' }) {
  const [mode, setMode] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const m = initialMode();
    setMode(m);
    applyMode(m);
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
        data-keep-dark
        className={
          'group relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-colors duration-200 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 ' +
          (isLight
            ? 'text-white bg-slate-900 border-slate-900 hover:bg-slate-800 focus-visible:ring-offset-white'
            : 'text-[#7a9ec8] hover:text-white border-transparent hover:border-white/[0.08] hover:bg-white/[0.06] focus-visible:ring-offset-slate-950')
        }
      >
        <span className="relative inline-flex items-center justify-center w-[18px] h-[18px]">
          <Sun
            aria-hidden
            className={
              'absolute inset-0 w-[18px] h-[18px] transition-all duration-300 ' +
              (isLight ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75')
            }
            strokeWidth={2}
          />
          <Moon
            aria-hidden
            className={
              'absolute inset-0 w-[18px] h-[18px] transition-all duration-300 ' +
              (isLight ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100')
            }
            strokeWidth={2}
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
      data-keep-dark
      className="fixed bottom-4 left-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-white shadow-lg backdrop-blur transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
      style={{ printColorAdjust: 'exact' }}
    >
      <Icon size={18} />
    </button>
  );
}
