/**
 * Small monochrome-friendly thumbnails of major UK bank logos shown on the
 * Pay-by-Bank option. SVGs are served from /public/bank-logos/.
 */
interface UkBankBadgesProps {
  className?: string;
}

const BANKS: { name: string; src: string }[] = [
  { name: 'HSBC', src: '/bank-logos/hsbc.svg' },
  { name: 'Barclays', src: '/bank-logos/barclays.svg' },
  { name: 'NatWest', src: '/bank-logos/natwest.svg' },
  { name: 'Lloyds', src: '/bank-logos/lloyds.svg' },
  { name: 'Monzo', src: '/bank-logos/monzo.svg' },
  { name: 'Starling', src: '/bank-logos/starling.svg' },
  { name: 'Revolut', src: '/bank-logos/revolut.svg' },
  { name: 'Santander', src: '/bank-logos/santander.svg' },
];

export default function UkBankBadges({ className = '' }: UkBankBadgesProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      aria-label={`Supported UK banks: ${BANKS.map((b) => b.name).join(', ')}`}
    >
      {BANKS.map(({ name, src }) => (
        <span
          key={name}
          title={name}
          className="inline-flex items-center justify-center h-7 w-12 rounded-md bg-white/95 px-1.5 shadow-sm ring-1 ring-white/10"
        >
          <img
            src={src}
            alt={name}
            loading="lazy"
            decoding="async"
            className="max-h-4 max-w-full object-contain"
          />
        </span>
      ))}
      <span className="text-[11px] text-slate-400 px-1 whitespace-nowrap">
        + all UK banks
      </span>
    </div>
  );
}
