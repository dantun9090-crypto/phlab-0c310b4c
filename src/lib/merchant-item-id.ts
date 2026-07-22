/**
 * Maps internal Firestore product doc IDs to the public item IDs used by
 * the PAID Google Merchant feed (phlabs.co.uk/google-merchant-feed.xml).
 *
 * GA4 / Google Ads e-commerce events MUST send the same item_id as the
 * feed's <g:id>, otherwise dynamic remarketing and product-level
 * conversion reporting cannot match events to feed items.
 *
 * Only the three feed-masked products need mapping — every other product
 * already uses its doc ID in the paid feed, so identity mapping applies.
 *
 * Keep in sync with src/lib/merchant-feed-overrides.ts (server-only).
 */

const PAID_FEED_ITEM_ID_BY_DOC_ID: Record<string, string> = {
  '2s5IGEx2RgUDLfbfjBbF': 'Reta-PHL', // Retatrutide
  'kONztvd1Xj5FQwAYMaT4': 'PHL-RP09', // BPC-157
  'UsB1FvVUrl0rWytSoErA': 'PHL-RP02', // Melanotan-II
};

export function merchantItemId(id: unknown): string {
  const s = String(id ?? '');
  return PAID_FEED_ITEM_ID_BY_DOC_ID[s] || s;
}
