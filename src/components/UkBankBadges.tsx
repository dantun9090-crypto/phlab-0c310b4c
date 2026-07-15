/**
 * Text-only pill row of major UK bank names shown on the Pay-by-Bank
 * option. No external images — pure Tailwind chips.
 */
interface UkBankBadgesProps {
  className?: string;
}

const BANKS = ['HSBC', 'Barclays', 'NatWest', 'Lloyds', 'Monzo', 'Starling'];

export default function UkBankBadges({ className = '' }: UkBankBadgesProps) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      aria-label={`Supported UK banks: ${BANKS.join(', ')}`}
    >
      {BANKS.map((name) => (
        <span
          key={name}
          className="bg-white/10 text-white text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap"
        >
          {name}
        </span>
      ))}
      <span className="text-xs text-slate-400 px-2.5 py-1 whitespace-nowrap">
        + all UK banks
      </span>
    </div>
  );
}
