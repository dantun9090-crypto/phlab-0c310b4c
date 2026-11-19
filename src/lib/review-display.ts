/**
 * Public display rules for customer reviews.
 *
 * Retatrutide and tirzepatide are VIP-only and must not be advertised on
 * public pages. Reviews are stored unchanged in Firestore (they are genuine
 * customer words); only the public rendering swaps the product names for
 * generic wording, so the reviewer name, rating and layout stay as they are.
 */

const DELISTED_NAME_RE = /\b(retatrutide|tirzepatide)\b/gi;

/** True when a product name refers to a VIP-only (publicly delisted) product. */
export function isDelistedProductName(name: string | null | undefined): boolean {
  return !!name && new RegExp(DELISTED_NAME_RE.source, 'i').test(name);
}

/** Review title/body for public pages: delisted product names become "this peptide". */
export function publicReviewText(text: string): string {
  return text.replace(DELISTED_NAME_RE, 'this peptide');
}

/** Product label shown after the reviewer's name on public pages. */
export function publicReviewProductLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  return isDelistedProductName(name) ? 'Research peptide' : name;
}
