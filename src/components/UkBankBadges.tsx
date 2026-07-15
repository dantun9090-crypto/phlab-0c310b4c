/**
 * Muted, monochrome row of major UK bank names shown on the Pay-by-Bank
 * option to reassure customers their bank is supported. Kept intentionally
 * low-contrast so it never competes with the primary CTA.
 */
interface UkBankBadgesProps {
  className?: string;
}

const BANKS = ['HSBC', 'Barclays', 'NatWest', 'Lloyds', 'Monzo', 'Starling'];

export default function UkBankBadges({ className = '' }: UkBankBadgesProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 opacity-70 ${className}`}
      aria-label={`Supported UK banks: ${BANKS.join(', ')}`}
    >
      {BANKS.map((name) => (
        <span
          key={name}
          className="text-[11px] font-medium tracking-wide text-slate-300 leading-none"
        >
          {name}
        </span>
      ))}
      <span className="text-[11px] text-slate-400 leading-none">+ all UK banks</span>
    </div>
  );
}
