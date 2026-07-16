import { useEffect, useState } from 'react';
import { X, Truck, ShieldCheck, FlaskConical } from 'lucide-react';

/**
 * Unified 36px top stripe replacing the legacy trio
 * (shipping bar + research-gate sticky tape + promo).
 * Rotating messages, green→cyan gradient, dismissible for 24h.
 */
const MESSAGES = [
  { Icon: Truck,       label: 'Free UK Shipping over £50' },
  { Icon: ShieldCheck, label: '≥99% HPLC Purity · CoA per batch' },
  { Icon: FlaskConical, label: 'For Laboratory Research Use Only' },
] as const;

const STORAGE_KEY = 'phl_top_stripe_dismissed_v1';
const HIDE_MS = 24 * 60 * 60 * 1000; // 24h

function initialDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ts = Number(window.localStorage.getItem(STORAGE_KEY) || '0');
    return ts > 0 && Date.now() - ts < HIDE_MS;
  } catch { return false; }
}

export default function TopStripe() {
  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState<boolean>(initialDismissed);

  useEffect(() => {
    if (dismissed) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = window.setInterval(() => setIdx(i => (i + 1) % MESSAGES.length), 4500);
    return () => window.clearInterval(id);
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div
      data-top-stripe
      role="region"
      aria-label="Site announcements"
      className="fixed left-0 right-0 top-0 z-[51] flex items-center justify-center px-10"
      style={{
        height: '36px',
        background:
          'linear-gradient(90deg, #030914 0%, #040d1a 50%, #061426 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        color: '#f0fdfa',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.01em',
        paddingLeft: 'calc(env(safe-area-inset-left) + 12px)',
        paddingRight: 'calc(env(safe-area-inset-right) + 40px)',
      }}
    >
      <div
        className="relative w-full max-w-3xl h-full flex items-center justify-center"
        aria-live="polite"
      >
        {MESSAGES.map(({ Icon, label }, i) => {
          const active = i === idx;
          return (
            <div
              key={i}
              className="absolute inset-0 flex items-center justify-center gap-2 whitespace-nowrap"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? 'translateY(0)' : 'translateY(4px)',
                transition: 'opacity .55s ease, transform .55s ease',
                pointerEvents: active ? 'auto' : 'none',
              }}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ opacity: 0.95 }} />
              <span className="truncate">{label}</span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* ignore */ }
          setDismissed(true);
        }}
        aria-label="Dismiss announcement"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/25 transition-colors"
        style={{ color: 'rgba(255,255,255,0.92)' }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
