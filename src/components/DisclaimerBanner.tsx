import { useState, useEffect, useRef } from 'react';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('disclaimer_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dismissed) {
      document.documentElement.style.setProperty('--phl-disclaimer-h', '0px');
    } else {
      const height = bannerRef.current?.offsetHeight || 36;
      document.documentElement.style.setProperty('--phl-disclaimer-h', `${height}px`);
    }
    return () => {
      document.documentElement.style.setProperty('--phl-disclaimer-h', '0px');
    };
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div
      ref={bannerRef}
      data-phl-disclaimer-banner
      className="w-full bg-amber-50 border-y border-amber-200 py-2 px-4"
      style={{
        position: 'fixed',
        top: 'calc(var(--rg-banner-h, 0px) + 32px + 64px)',
        left: 0,
        right: 0,
        zIndex: 49,
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 relative pr-8">
        <svg
          className="w-4 h-4 text-amber-600 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-xs md:text-sm font-medium text-amber-800 tracking-wide uppercase">
          For Laboratory Research Only — Not for Human Consumption
        </span>
      </div>
      <button
        onClick={() => {
          try {
            localStorage.setItem('disclaimer_dismissed', 'true');
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-600 hover:text-amber-800 transition-colors"
        aria-label="Dismiss disclaimer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
