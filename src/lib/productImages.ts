/**
 * Mock vial product images — white-background studio shots.
 * Used as fallbacks when a product has no uploaded image.
 */

const VIAL_IMAGES: Record<string, string> = {
  // Weight management / GLP-1
  'semaglutide':    '/images/vials/1773539068703.jpg',
  'ozempic':        '/images/vials/1773539068703.jpg',
  'wegovy':         '/images/vials/1773539068703.jpg',
  'tirzepatide':    '/images/vials/1773539096289.jpg',
  'mounjaro':       '/images/vials/1773539096289.jpg',
  'retatrutide':    '/images/vials/retatrutide.webp',
  'reta':           '/images/vials/retatrutide.webp',
  'aod-9604':       '/images/vials/1773539572760.jpg',
  'aod9604':        '/images/vials/1773539572760.jpg',
  '5-amino-1mq':    '/images/vials/1773539597695.jpg',
  '5amino':         '/images/vials/1773539597695.jpg',

  // Tissue Repair Research
  'bpc-157':        '/images/vials/1773539069003.jpg',
  'bpc':            '/images/vials/1773539069003.jpg',
  'tb-500':         '/images/vials/1773539067599.jpg',
  'tb500':          '/images/vials/1773539067599.jpg',
  'thymosin beta':  '/images/vials/1773539067599.jpg',
  'kpv':            '/images/vials/1773539095387.jpg',
  'ghk-cu':         '/images/vials/1773539573209.jpg',
  'ghk':            '/images/vials/1773539573209.jpg',

  // Cellular Aging Studies & Anti-aging
  'nad+':           '/images/vials/1773539068702.jpg',
  'nad':            '/images/vials/1773539068702.jpg',
  'ss-31':          '/images/vials/1773539600198.jpg',
  'mots-c':         '/images/vials/1773539095886.jpg',
  'mots':           '/images/vials/1773539095886.jpg',

  // Growth Hormone / Physical Activity Analysis
  'cjc-1295':       '/images/vials/1773539095687.jpg',
  'cjc':            '/images/vials/1773539095687.jpg',
  'ipamorelin':     '/images/vials/1773539572808.jpg',
  'sermorelin':     '/images/vials/1773539598796.jpg',
  'ibutamoren':     '/images/vials/1773539598396.jpg',
  'mk-677':         '/images/vials/1773539598396.jpg',
  'mk677':          '/images/vials/1773539598396.jpg',

  // Mood / Cognitive / Other
  'selank':         '/images/vials/1773539573060.jpg',
  'oxytocin':       '/images/vials/1773539573162.jpg',
  'pt-141':         '/images/vials/1773539573361.jpg',
  'bremelanotide':  '/images/vials/1773539573361.jpg',
  'melanotan':      '/images/vials/1773539572659.jpg',
  'mt-2':           '/images/vials/1773539572659.jpg',
  'mt2':            '/images/vials/1773539572659.jpg',
};

const FALLBACK_VIAL = '/images/vials/1773539119917.jpg';

/**
 * Returns the best available image for a product.
 * Priority: uploaded imageUrl > name-matched vial > generic vial fallback
 */
export function getProductImage(
  name: string | null | undefined,
  imageUrl?: string,
  images?: string[]
): string {
  // 1. Use uploaded image if present
  const uploaded = imageUrl || images?.[0];
  if (uploaded) return uploaded;

  // 2. Try to match by product name keywords (longest match wins)
  const lower = (name ?? '').toLowerCase();
  let bestMatch = '';
  let bestUrl = '';
  for (const [key, url] of Object.entries(VIAL_IMAGES)) {
    if (lower.includes(key) && key.length > bestMatch.length) {
      bestMatch = key;
      bestUrl = url;
    }
  }
  if (bestUrl) return bestUrl;

  // 3. Generic vial fallback
  return FALLBACK_VIAL;
}
