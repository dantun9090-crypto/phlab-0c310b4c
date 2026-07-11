import logoSrc from '@/assets/logo.webp';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const sizeDimensions = {
  sm: { width: 24, height: 24 },
  md: { width: 32, height: 32 },
  lg: { width: 40, height: 40 },
};

export function Logo({ className = '', size = 'md' }: LogoProps) {
  const { width, height } = sizeDimensions[size];

  return (
    <img
      src={logoSrc}
      alt="PH Labs Logo"
      width={width}
      height={height}
      className={`site-logo ${sizeClasses[size]} ${className}`}
      // Inline aspect-ratio + max dimensions reserve the exact box before the
      // Tailwind bundle applies `h-8 w-8` / `h-10 w-10`, so the logo can never
      // flash at its native resolution during first paint (LCP/CLS fix).
      style={{
        objectFit: 'contain',
        aspectRatio: `${width} / ${height}`,
        width: `${width}px`,
        height: `${height}px`,
        maxWidth: `${width}px`,
        maxHeight: `${height}px`,
        display: 'block',
      }}
      loading="eager"
      fetchPriority="high"
      decoding="async"
    />
  );
}
