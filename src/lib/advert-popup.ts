/**
 * Advert pop-up module — pure scheduling + dismissal helpers.
 *
 * The public pop-up (see `src/components/AdvertPopup.tsx`) renders only after
 * hydration, so none of this runs during prerender. Kept free of React and
 * Firebase so it stays unit-testable and adds nothing to the critical path.
 */

export interface PopupAdvertLike {
  id?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  ctaUrl?: string;
  ctaText?: string;
  placement?: string;
  isActive?: boolean;
  active?: boolean;
  altText?: string;
  /** Firestore Timestamp, ISO string, millis, or null. */
  startDate?: unknown;
  endDate?: unknown;
}

/** localStorage key prefix for per-advert dismissal. */
export const ADVERT_DISMISS_PREFIX = 'phlabs_advert_dismissed_';

/** A dismissed advert stays hidden for 7 days. */
export const ADVERT_DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Accepts Firestore Timestamp | Date | ISO string | millis and normalises. */
export function toMillis(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  const maybe = value as { toMillis?: () => number; seconds?: number };
  if (typeof maybe.toMillis === 'function') {
    try {
      return maybe.toMillis();
    } catch {
      return null;
    }
  }
  if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  return null;
}

/** True when `now` sits inside the advert's optional start/end window. */
export function isWithinSchedule(ad: PopupAdvertLike, now = Date.now()): boolean {
  const start = toMillis(ad.startDate);
  const end = toMillis(ad.endDate);
  if (start != null && now < start) return false;
  if (end != null && now > end) return false;
  return true;
}

function readDismissedAt(id: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADVERT_DISMISS_PREFIX + id);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

/** True when this advert was dismissed within the cooldown window. */
export function isDismissed(id: string, now = Date.now()): boolean {
  const at = readDismissedAt(id);
  if (at == null) return false;
  return now - at < ADVERT_DISMISS_WINDOW_MS;
}

/** Record a dismissal so the pop-up stays hidden for the cooldown window. */
export function markDismissed(id: string, now = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADVERT_DISMISS_PREFIX + id, String(now));
  } catch {
    /* storage disabled — pop-up simply reappears next visit */
  }
}

/**
 * Pick the advert to show: `placement === 'popup'`, active, in schedule,
 * not dismissed, and with something to render.
 */
export function pickPopupAdvert(
  adverts: PopupAdvertLike[] | null | undefined,
  now = Date.now(),
): PopupAdvertLike | null {
  if (!Array.isArray(adverts)) return null;
  for (const ad of adverts) {
    if (!ad || ad.placement !== 'popup') continue;
    if (ad.isActive !== true && ad.active !== true) continue;
    if (!ad.imageUrl && !ad.title) continue;
    if (!isWithinSchedule(ad, now)) continue;
    if (ad.id && isDismissed(ad.id, now)) continue;
    return ad;
  }
  return null;
}
