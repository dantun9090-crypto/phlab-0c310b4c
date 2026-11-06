/**
 * Wallid micro logo — inline SVG so it costs no network request and
 * inherits the surrounding text colour. Used on the payment card next to
 * the "Open Banking" label.
 */
interface WallidMarkProps {
  size?: number;
  className?: string;
}

export default function WallidMark({ size = 14, className }: WallidMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Wallid"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flex: '0 0 auto' }}
    >
      <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" opacity="0.14" />
      <path
        d="M5.5 8.5 8 15.5l2.6-5.2L13.2 15.5l2.5-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.6" cy="8.4" r="1.5" fill="currentColor" />
    </svg>
  );
}
