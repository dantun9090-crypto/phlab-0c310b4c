import { useState, useEffect, useRef } from 'react';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem('disclaimer_dismissed') === 'true') setDismissed(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (dismissed) {
      document.documentElement.style.setProperty('--phl-disclaimer-h', '0px');
    } else {
      const height = bannerRef.current?.offsetHeight || 28;
      document.documentElement.style.setProperty('--phl-disclaimer-h', `${height}px`);
    }
    return () => {
      document.documentElement.style.setProperty('--phl-disclaimer-h', '0px');
    };
  }, [dismissed]);

  const handleDismiss = () => {
    try {
      localStorage.setItem('disclaimer_dismissed', 'true');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div
      ref={bannerRef}
      data-phl-disclaimer-banner
      className="w-full bg-[#1a1a2e] border-b border-[#2a2a3e] py-1 px-3"
      style={{
        position: 'fixed',
        top: 'calc(var(--rg-banner-h, 0px) + 32px + 64px)',
        left: 0,
        right: 0,
        zIndex: 49,
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-1.5">
        <span
          className="text-[9px] sm:text-[10px] md:text-[11px] text-yellow-400 tracking-wider uppercase whitespace-nowrap"
          style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }}
        >
          For Laboratory Research Only — Not for Human Consumption
        </span>
        <button
          onClick={handleDismiss}
          className="text-gray-500 hover:text-gray-300 ml-1 flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
