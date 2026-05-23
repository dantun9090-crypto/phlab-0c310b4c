/**
 * Mock vial product images — white-background studio shots.
 * Used as fallbacks when a product has no uploaded image.
 */

const VIAL_IMAGES: Record<string, string> = {
  // Weight management / GLP-1
  'semaglutide':    'https://cdn.wegic.ai/assets/onepage/agent/images/1773539068703.jpg',
  'ozempic':        'https://cdn.wegic.ai/assets/onepage/agent/images/1773539068703.jpg',
  'wegovy':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539068703.jpg',
  'tirzepatide':    'https://cdn.wegic.ai/assets/onepage/agent/images/1773539096289.jpg',
  'mounjaro':       'https://cdn.wegic.ai/assets/onepage/agent/images/1773539096289.jpg',
  'aod-9604':       'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572760.jpg',
  'aod9604':        'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572760.jpg',
  '5-amino-1mq':    'https://cdn.wegic.ai/assets/onepage/agent/images/1773539597695.jpg',
  '5amino':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539597695.jpg',

  // Tissue Repair Research
  'bpc-157':        'https://cdn.wegic.ai/assets/onepage/agent/images/1773539069003.jpg',
  'bpc':            'https://cdn.wegic.ai/assets/onepage/agent/images/1773539069003.jpg',
  'tb-500':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539067599.jpg',
  'tb500':          'https://cdn.wegic.ai/assets/onepage/agent/images/1773539067599.jpg',
  'thymosin beta':  'https://cdn.wegic.ai/assets/onepage/agent/images/1773539067599.jpg',
  'kpv':            'https://cdn.wegic.ai/assets/onepage/agent/images/1773539095387.jpg',
  'ghk-cu':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539573209.jpg',
  'ghk':            'https://cdn.wegic.ai/assets/onepage/agent/images/1773539573209.jpg',

  // Cellular Aging Studies & Anti-aging
  'nad+':           'https://cdn.wegic.ai/assets/onepage/agent/images/1773539068702.jpg',
  'nad':            'https://cdn.wegic.ai/assets/onepage/agent/images/1773539068702.jpg',
  'epithalon':      'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572658.jpg',
  'epitalon':       'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572658.jpg',
  'ss-31':          'https://cdn.wegic.ai/assets/onepage/agent/images/1773539600198.jpg',
  'mots-c':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539095886.jpg',
  'mots':           'https://cdn.wegic.ai/assets/onepage/agent/images/1773539095886.jpg',

  // Growth Hormone / Physical Activity Analysis
  'cjc-1295':       'https://cdn.wegic.ai/assets/onepage/agent/images/1773539095687.jpg',
  'cjc':            'https://cdn.wegic.ai/assets/onepage/agent/images/1773539095687.jpg',
  'ipamorelin':     'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572808.jpg',
  'sermorelin':     'https://cdn.wegic.ai/assets/onepage/agent/images/1773539598796.jpg',
  'ibutamoren':     'https://cdn.wegic.ai/assets/onepage/agent/images/1773539598396.jpg',
  'mk-677':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539598396.jpg',
  'mk677':          'https://cdn.wegic.ai/assets/onepage/agent/images/1773539598396.jpg',

  // Mood / Cognitive / Other
  'selank':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539573060.jpg',
  'oxytocin':       'https://cdn.wegic.ai/assets/onepage/agent/images/1773539573162.jpg',
  'pt-141':         'https://cdn.wegic.ai/assets/onepage/agent/images/1773539573361.jpg',
  'bremelanotide':  'https://cdn.wegic.ai/assets/onepage/agent/images/1773539573361.jpg',
  'melanotan':      'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572659.jpg',
  'mt-2':           'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572659.jpg',
  'mt2':            'https://cdn.wegic.ai/assets/onepage/agent/images/1773539572659.jpg',
};

const FALLBACK_VIAL = 'https://cdn.wegic.ai/assets/onepage/agent/images/1773539119917.jpg';

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
