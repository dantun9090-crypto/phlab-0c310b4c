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
      src="https://cdn.wegic.ai/assets/onepage/agent/images/1775896855290_edited.png?imageMogr2/format/webp"
      alt="PH Labs Logo"
      width={width}
      height={height}
      className={`${sizeClasses[size]} ${className}`}
      style={{ objectFit: 'contain' }}
      loading="eager"
    />
  );
}
