/**
 * Trust badges + UK bank logo grid shown on checkout ONLY when the
 * customer has selected the Wallid "Pay by Bank" option.
 *
 * Pure presentation — no API calls, no state beyond the optional
 * `showBadges` toggle controlled by the parent (admin simulator uses it).
 *
 * Used by:
 *   - src/components/PaymentMethodOptions.tsx (live checkout)
 *   - src/pages/Admin/tabs/WallidPreviewTab.tsx (admin simulator)
 */
import { ShieldCheck, Landmark, Zap, CreditCard } from 'lucide-react';

interface WallidTrustElementsProps {
  className?: string;
  /** When false, hide the trust-badges row (kept for admin A/B preview). */
  showBadges?: boolean;
}

const TRUST_BADGES = [
  { icon: ShieldCheck,    label: 'Secure Open Banking' },
  { icon: Landmark,       label: 'FCA Regulated' },
  { icon: Zap,            label: 'Instant Confirmation' },
  { icon: CreditCard,     label: 'No Card Details Stored' },
] as const;

// Inline SVG bank marks — no external requests, brand colours per spec.
function LloydsMark() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-label="Lloyds Bank">
      <path
        fill="#000000"
        d="M8 32c2-6 5-10 9-12-1-2-1-4 0-6 1-2 3-3 5-3 1 0 2 0 3 1l-1 2c-1-1-2-1-3-1-2 0-3 1-3 3 0 1 1 2 2 3 5 1 9 4 11 9l-1 1c-2-3-5-5-9-6l-1 3 6 2-1 2-6-2c-1 3-3 5-5 6l-2-2c2-1 4-3 5-5l-5-2 1-2 5 1c0-1 1-2 1-3-4 2-7 6-9 11Z"
      />
    </svg>
  );
}

function SantanderMark() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-label="Santander">
      <path
        fill="#EC0000"
        d="M20 4c3 5 5 9 5 13 0 2-1 4-2 5l-3-5c-1 2-2 3-2 5 0 3 2 5 5 7 4 3 6 5 6 8 0 2-1 4-3 5-3 1-7 1-11-1l3-5c2 1 4 2 6 1l-1-2-4-3c-3-2-5-5-5-8 0-2 1-4 3-6 2-1 4-2 6-1l-1-2c-1-2-2-5-2-7 0-2 1-3 0-4Z"
      />
    </svg>
  );
}

function RevolutMark() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-label="Revolut">
      <text
        x="50%" y="58%" textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="28" fontWeight="900" fill="#000000"
      >R</text>
    </svg>
  );
}

function MonzoMark() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-label="Monzo">
      <defs>
        <linearGradient id="monzoG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF4F5F" />
          <stop offset="100%" stopColor="#00D4AA" />
        </linearGradient>
      </defs>
      <text
        x="50%" y="60%" textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="26" fontWeight="900" fill="url(#monzoG)"
      >M</text>
    </svg>
  );
}

function StarlingMark() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-label="Starling Bank">
      <circle cx="20" cy="20" r="16" fill="#7433FF" />
      <text
        x="50%" y="60%" textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="18" fontWeight="900" fill="#ffffff"
      >S</text>
    </svg>
  );
}

function BarclaysMark() {
  return (
    <svg viewBox="0 0 40 40" className="w-10 h-10" aria-label="Barclays">
      <path
        fill="#00AEEF"
        d="M20 4c-2 3-4 5-6 6 1 2 3 3 4 5-3 0-6-1-8-3 1 4 4 7 8 8-2 2-5 3-8 3 3 3 7 4 11 4-1 3-3 5-6 6 4 1 8-1 11-4 2 3 5 5 9 5-3-2-5-5-6-8 4 0 8-2 10-5-3 1-6 1-9 0 2-2 4-5 4-8-2 2-5 3-8 3 1-3 2-6 1-9-2 2-4 3-7 3l-2-6Z"
      />
    </svg>
  );
}

const BANKS = [
  { name: 'Lloyds',   Mark: LloydsMark },
  { name: 'Santander',Mark: SantanderMark },
  { name: 'Revolut',  Mark: RevolutMark },
  { name: 'Monzo',    Mark: MonzoMark },
  { name: 'Starling', Mark: StarlingMark },
  { name: 'Barclays', Mark: BarclaysMark },
] as const;

export default function WallidTrustElements({
  className = '',
  showBadges = true,
}: WallidTrustElementsProps) {
  return (
    <div
      data-testid="wallid-trust-elements"
      className={`space-y-3 ${className}`}
      style={{ animation: 'wallidFadeIn 300ms ease-out both' }}
    >
      <style>{`
        @keyframes wallidFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wallidFadeInSlow {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {showBadges && (
        <div
          className="flex flex-wrap gap-1.5"
          style={{ animation: 'wallidFadeIn 200ms ease-out both' }}
        >
          {TRUST_BADGES.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-300 bg-[#060f1e] border border-white/10 rounded-full px-2.5 py-1"
            >
              <Icon className="w-3.5 h-3.5 text-emerald-400" />
              {label}
            </span>
          ))}
        </div>
      )}

      <div style={{ animation: 'wallidFadeInSlow 300ms ease-out 100ms both' }}>
        <p className="text-xs font-semibold text-gray-200 mb-2">Choose your bank</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {BANKS.map(({ name, Mark }) => (
            <div
              key={name}
              className="bg-white rounded-lg border border-white/10 h-[60px] w-full flex items-center justify-center hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
              title={name}
            >
              <Mark />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2 leading-snug">
          Your payment is processed securely via FCA-regulated open banking.
          No card details stored.
        </p>
      </div>
    </div>
  );
}
