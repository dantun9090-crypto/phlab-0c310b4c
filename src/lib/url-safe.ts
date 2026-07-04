/**
 * Safe URL search-param helpers. Google Ads tracking params (gclid, gbraid,
 * wbraid, gad_campaignid) can be very long base64-like strings; use these
 * helpers when you want to read a param defensively or when serialising
 * params into DOM/state (avoids hydration mismatch + memory blowups).
 */

const TRACKING_KEYS = new Set([
  'gad_source',
  'gad_campaignid',
  'gclid',
  'gbraid',
  'wbraid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'ttclid',
]);

export function safeGetSearchParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(key);
    if (!value) return null;
    return value.length > 500 ? value.slice(0, 500) + '...' : value;
  } catch (e) {
    console.warn('[URL] Failed to parse search param:', key, e);
    return null;
  }
}

export function getSanitizedSearchParams(): Record<string, string> {
  const params: Record<string, string> = {};
  if (typeof window === 'undefined') return params;
  try {
    const url = new URL(window.location.href);
    url.searchParams.forEach((value, key) => {
      if (TRACKING_KEYS.has(key)) return;
      params[key] = value.length > 200 ? value.slice(0, 200) : value;
    });
  } catch (e) {
    console.warn('[URL] Failed to parse search params:', e);
  }
  return params;
}

export function isTrackingParam(key: string): boolean {
  return TRACKING_KEYS.has(key);
}
