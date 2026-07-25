/**
 * Public advert pop-up — homepage marketing modal.
 *
 * Renders nothing on the server / during prerender: the advert is only chosen
 * after mount, once the client-side `adverts` list has resolved. Dismissal is
 * remembered for 7 days per advert id in localStorage.
 */
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  markDismissed,
  pickPopupAdvert,
  type PopupAdvertLike,
} from '@/lib/advert-popup';

interface Props {
  adverts: PopupAdvertLike[];
  /** Delay before showing, so it never competes with LCP. */
  delayMs?: number;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export default function AdvertPopup({ adverts, delayMs = 1500 }: Props) {
  const [ad, setAd] = useState<PopupAdvertLike | null>(null);

  useEffect(() => {
    const candidate = pickPopupAdvert(adverts);
    if (!candidate) return;
    const t = window.setTimeout(() => setAd(candidate), delayMs);
    return () => window.clearTimeout(t);
  }, [adverts, delayMs]);

  const close = useCallback(() => {
    setAd((current) => {
      if (current?.id) markDismissed(current.id);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!ad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ad, close]);

  if (!ad) return null;

  const href = typeof ad.ctaUrl === 'string' && ad.ctaUrl.trim() ? ad.ctaUrl.trim() : '';
  const external = href ? isExternal(href) : false;

  const media = ad.imageUrl ? (
    <img
      src={ad.imageUrl}
      alt={ad.altText || ad.title || 'PH Labs promotion'}
      className="w-full h-auto block"
      loading="eager"
      decoding="async"
    />
  ) : null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      data-testid="advert-popup"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ad.title || 'Promotion'}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[600px] overflow-hidden rounded-2xl border border-white/[0.12] shadow-2xl"
        style={{ background: '#0b1a30' }}
      >
        <button
          type="button"
          onClick={close}
          onTouchStart={close}
          aria-label="Close promotion"
          className="absolute top-2 right-2 z-10 flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {href ? (
          <a
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            onClick={() => { if (ad.id) markDismissed(ad.id); }}
            className="block"
          >
            {media}
          </a>
        ) : (
          media
        )}

        {(ad.title || ad.subtitle) && (
          <div className="p-5 text-center">
            {ad.title && <p className="text-lg font-bold text-white">{ad.title}</p>}
            {ad.subtitle && <p className="mt-1 text-sm text-slate-300">{ad.subtitle}</p>}
            {href && ad.ctaText && (
              <a
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                onClick={() => { if (ad.id) markDismissed(ad.id); }}
                className="inline-flex items-center justify-center mt-4 min-h-[48px] px-6 rounded-xl bg-emerald-500 text-sm font-bold text-[#03131f] hover:bg-emerald-400 transition-colors"
              >
                {ad.ctaText}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
