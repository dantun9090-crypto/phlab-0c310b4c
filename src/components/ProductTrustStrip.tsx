/**
 * Purely visual trust strip rendered DIRECTLY BELOW the product price block.
 *
 * Deliberately contains no price, availability, offer microdata/JSON-LD,
 * heading (h1/h2) or crawler-facing product description — it must not affect
 * the product page's structured data, title or URLs in any way.
 *
 * The "Batch verified" control links to the existing `/verify` route and is
 * rendered only while the verification feature is switched on in admin.
 */
import { ShieldCheck, Microscope, Truck, ArrowRight } from 'lucide-react';
import UkBankBadges from '@/components/UkBankBadges';
import { useVerifyBatchEnabled } from '@/lib/verify-feature';

interface ProductTrustStripProps {
  className?: string;
}

export default function ProductTrustStrip({ className = '' }: ProductTrustStripProps) {
  const verifyEnabled = useVerifyBatchEnabled();

  return (
    <div
      data-testid="product-trust-strip"
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {verifyEnabled && (
          <a
            href="/verify"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-[12px] font-semibold text-emerald-300 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Batch verified — check COA
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}

        <span className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 text-[12px] font-semibold text-[#c8dff5]">
          <Microscope className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          ≥99% purity, third-party tested
        </span>

        <span className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 text-[12px] font-semibold text-[#c8dff5]">
          <Truck className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          Dispatched same working day (order by 2pm)
        </span>
      </div>

      <UkBankBadges />
    </div>
  );
}
