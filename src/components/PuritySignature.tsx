type Props = {
  purity?: string;
  width?: number;
  height?: number;
  showLabel?: boolean;
  className?: string;
};

/**
 * Small inline SVG HPLC-style chromatogram — single dominant peak
 * over a faint baseline. Deterministic path (no randomness across
 * SSR/hydration). Used on product cards (~60×24) and on the product
 * page next to the CoA download button (~160×48).
 */
export default function PuritySignature({
  purity = '≥99%',
  width = 60,
  height = 24,
  showLabel = true,
  className,
}: Props) {
  const w = width;
  const h = height;
  const baseY = h - 3;
  const peakX = w * 0.58;
  const peakY = 3;
  const sigma = w * 0.09;
  const N = 40;

  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * w;
    const dx = (x - peakX) / sigma;
    const peak = Math.exp(-dx * dx) * (baseY - peakY);
    const noise = (((i * 9301 + 49297) % 233) / 233 - 0.5) * (h > 30 ? 2 : 1);
    const y = baseY - peak + noise;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const line = pts.join(' ');
  const area = `${line} L${w},${baseY} L0,${baseY} Z`;
  const gid = `phl-purity-grad-${w}x${h}`;

  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ''}`}
      role="img"
      aria-label={`HPLC purity signature ${purity}`}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={baseY + 0.5} x2={w} y2={baseY + 0.5} stroke="rgba(52,211,153,0.28)" strokeWidth="0.5" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#34d399" strokeWidth={h > 30 ? 1.4 : 1} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {showLabel && (
        <span
          className="font-bold tracking-wide"
          style={{ color: '#4ade80', fontSize: h > 30 ? 12 : 10 }}
        >
          {purity}
        </span>
      )}
    </span>
  );
}
