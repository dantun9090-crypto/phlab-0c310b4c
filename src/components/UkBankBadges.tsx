/**
 * Small inline badges that show the major UK banks supported by our
 * Pay by Bank (Open Banking) checkout option. Pure presentation — used on
 * the checkout payment-method selector to reassure customers that their
 * bank is supported.
 */
interface UkBankBadgesProps {
  className?: string;
}

const BANKS: { name: string; bg: string; fg: string }[] = [
  { name: 'HSBC',     bg: '#db0011', fg: '#ffffff' },
  { name: 'Barclays', bg: '#00aeef', fg: '#ffffff' },
  { name: 'NatWest',  bg: '#5a287d', fg: '#ffffff' },
  { name: 'Lloyds',   bg: '#024731', fg: '#ffffff' },
  { name: 'Monzo',    bg: '#ff3464', fg: '#ffffff' },
  { name: 'Starling', bg: '#7d3cf8', fg: '#ffffff' },
];

export default function UkBankBadges({ className = '' }: UkBankBadgesProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${className}`}
      aria-label="Supported UK banks: HSBC, Barclays, NatWest, Lloyds, Monzo, Starling"
    >
      {BANKS.map(b => (
        <span
          key={b.name}
          className="text-[9px] font-bold px-1.5 py-0.5 rounded leading-none tracking-wide"
          style={{ background: b.bg, color: b.fg }}
        >
          {b.name}
        </span>
      ))}
      <span className="text-[9px] text-gray-500 ml-1">+ all UK banks</span>
    </div>
  );
}
