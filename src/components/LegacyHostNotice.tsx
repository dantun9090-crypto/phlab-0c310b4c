import { ExternalLink } from 'lucide-react';
import { isLegacyHost, LEGACY_TRANSACTION_NOTICE, MAIN_HOST } from '@/lib/legacy-host';

/**
 * Small inline note rendered ONLY on the legacy SEO mirror host
 * (prohealthpeptides.co.uk) so the hop to phlabs.co.uk for sign-in / checkout
 * is expected rather than surprising. Renders nothing on the canonical host.
 */
export default function LegacyHostNotice({ className = '' }: { className?: string }) {
  if (!isLegacyHost()) return null;

  return (
    <p
      className={`flex items-start gap-1.5 text-[11px] leading-snug text-slate-400 ${className}`}
      data-testid="legacy-host-notice"
    >
      <ExternalLink className="w-3 h-3 mt-[1px] shrink-0 text-emerald-400/70" aria-hidden="true" />
      <span>
        {LEGACY_TRANSACTION_NOTICE.replace(MAIN_HOST, '')}
        <strong className="text-slate-300 font-semibold">{MAIN_HOST}</strong>
      </span>
    </p>
  );
}
