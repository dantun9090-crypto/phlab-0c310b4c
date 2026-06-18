/**
 * Trust badges + Pay by Bank badge shown on checkout ONLY when the
 * customer has selected the Wallid "Pay by Bank" option.
 *
 * The badge selection is admin-curated and persisted in Firestore
 * (see wallid-badge-store).
 *
 * Used by:
 *   - src/components/PaymentMethodOptions.tsx (live checkout)
 *   - src/pages/Admin/tabs/WallidPreviewTab.tsx (admin simulator)
 *   - src/pages/Admin/tabs/WallidBadgesTab.tsx (live preview)
 */
import * as LucideIcons from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import payByBankBadge1x from '@/assets/pay-by-bank-badge-1x.png.asset.json';
import payByBankBadge2x from '@/assets/pay-by-bank-badge-2x.png.asset.json';
import { WALLID_BADGE_CATALOG } from '@/lib/wallid-badge-catalog';
import { useWallidBadgeIds } from '@/lib/wallid-badge-store';

interface WallidTrustElementsProps {
  className?: string;
  /** When false, hide the trust-badges row (kept for admin A/B preview). */
  showBadges?: boolean;
  /** Override the live Firestore badge selection (admin simulator). */
  badgeIdsOverride?: string[];
}

function resolveIcon(name: string) {
  const Comp = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return Comp ?? ShieldCheck;
}

export default function WallidTrustElements({
  className = '',
  showBadges = true,
  badgeIdsOverride,
}: WallidTrustElementsProps) {
  const { ids: liveBadgeIds } = useWallidBadgeIds();

  const badgeIds = badgeIdsOverride ?? liveBadgeIds;

  const badges = badgeIds
    .map((id) => WALLID_BADGE_CATALOG.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

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

      {showBadges && badges.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5"
          style={{ animation: 'wallidFadeIn 200ms ease-out both' }}
        >
          {badges.map((b) => {
            const Icon = resolveIcon(b.icon);
            return (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-300 bg-[#060f1e] border border-white/10 rounded-full px-2.5 py-1"
              >
                <Icon className="w-3.5 h-3.5 text-emerald-400" />
                {b.label}
              </span>
            );
          })}
        </div>
      )}

      <div
        className="flex flex-col items-center text-center"
        style={{ animation: 'wallidFadeInSlow 300ms ease-out 100ms both' }}
      >
        <img
          src={payByBankBadge1x.url}
          srcSet={`${payByBankBadge1x.url} 1x, ${payByBankBadge2x.url} 2x`}
          alt="Pay by Bank — Open Banking, Secure, FCA Regulated"
          loading="lazy"
          decoding="async"
          width={260}
          height={173}
          className="block h-auto w-full max-w-[260px] sm:max-w-[280px] md:max-w-[300px] rounded-xl mx-auto"
          style={{ imageRendering: 'auto' }}
        />
        <p className="text-[11px] text-gray-400 mt-2 leading-snug max-w-[300px]">
          Your payment is processed securely via FCA-regulated open banking.
          No card details stored.
        </p>
      </div>
    </div>
  );
}
