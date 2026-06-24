import { useEffect } from 'react';
import { cfImgProps } from '@/lib/cf-image';

export type MarketingAdvert = {
  id?: string;
  title?: string;
  subtitle?: string;
  ctaText?: string;
  ctaUrl?: string;
  imageUrl?: string;
  placement?: string;
  isActive?: boolean;
  active?: boolean;
  bgColor?: string;
  textColor?: string;
  altText?: string;
};

type Props = {
  adverts: MarketingAdvert[];
  placement: string;
  variant?: 'banner' | 'card' | 'compact';
  className?: string;
  eagerFirstImage?: boolean;
};

function activeForPlacement(adverts: MarketingAdvert[], placement: string): MarketingAdvert[] {
  return adverts.filter((ad) =>
    ad?.placement === placement &&
    (ad.isActive === true || ad.active === true) &&
    (Boolean(ad.imageUrl) || Boolean(ad.title) || Boolean(ad.subtitle)),
  );
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export default function MarketingAdvertSlot({ adverts, placement, variant = 'banner', className = '', eagerFirstImage = false }: Props) {
  const visible = activeForPlacement(adverts, placement);
  if (visible.length === 0) return null;

  return (
    <div className={className} data-advert-placement={placement}>
      <div className={variant === 'compact' ? 'space-y-3' : 'space-y-4'}>
        {visible.map((ad, index) => {
          const href = typeof ad.ctaUrl === 'string' && ad.ctaUrl.trim() ? ad.ctaUrl.trim() : '';
          const isExternal = href ? isExternalHref(href) : false;
          const imgProps = eagerFirstImage && index === 0
            ? { loading: 'eager' as const, fetchPriority: 'high' as const, decoding: 'async' as const }
            : { loading: 'lazy' as const, decoding: 'async' as const };
          const isCard = variant === 'card';
          const isCompact = variant === 'compact';

          // Heights chosen so the slot still has visible bounds even when no
          // image is uploaded (otherwise the absolutely-positioned overlay
          // collapses to 0px and the advert renders invisibly).
          const minH = isCompact ? 176 : isCard ? 256 : 192;
          const hasImage = Boolean(ad.imageUrl);
          const body = (
            <div
              className={`relative overflow-hidden border border-white/[0.08] shadow-[0_10px_35px_rgba(0,0,0,0.32)] ${isCompact ? 'rounded-2xl' : 'rounded-3xl'}`}
              style={{ background: ad.bgColor || '#0b1a30', minHeight: hasImage ? undefined : minH }}
            >
              {hasImage && (
                <img
                  {...cfImgProps(ad.imageUrl as string, {
                    widths: isCompact ? [320, 480, 640] : [640, 960, 1280, 1600],
                    sizes: isCompact ? '(max-width: 1024px) 100vw, 320px' : '100vw',
                  })}
                  alt={ad.altText || ad.title || 'PH Labs promotional advert'}
                  width={isCompact ? 480 : 1600}
                  height={isCompact ? 360 : 300}
                  className={`w-full object-cover ${isCompact ? 'h-44' : isCard ? 'h-64' : 'h-48 md:h-72'}`}
                  {...imgProps}
                />
              )}
              {(ad.title || ad.subtitle || ad.ctaText) && (
                <div
                  className={`${hasImage ? 'absolute inset-0' : 'relative'} flex ${isCompact ? 'items-end' : 'items-center'} ${hasImage ? 'bg-gradient-to-r from-black/72 via-black/35 to-transparent' : ''} p-5 md:p-8`}
                  style={hasImage ? undefined : { minHeight: minH }}
                >
                  <div className={isCompact ? 'max-w-[95%]' : 'max-w-lg'}>
                    {ad.title && (
                      <p className={`${isCompact ? 'text-lg' : 'text-2xl md:text-4xl'} font-black leading-tight`} style={{ color: ad.textColor || '#e8f0fe', textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>
                        {ad.title}
                      </p>
                    )}
                    {ad.subtitle && (
                      <p className={`${isCompact ? 'text-xs mt-1' : 'text-sm md:text-base mt-2'} font-medium text-white/80 leading-relaxed`}>
                        {ad.subtitle}
                      </p>
                    )}
                    {href && ad.ctaText && !isCompact && (
                      <span className="inline-flex mt-4 px-4 py-2 rounded-xl bg-emerald-500 text-[#03131f] text-sm font-black shadow-lg">
                        {ad.ctaText}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );

          return href ? (
            <a key={ad.id || `${placement}-${index}`} href={href} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined} className="block group">
              {body}
            </a>
          ) : (
            <div key={ad.id || `${placement}-${index}`}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}