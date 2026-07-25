/**
 * Masked Merchant Center product codes → canonical Firestore slug.
 *
 * The paid GMC feed links high-risk products under anonymised codes
 * (/products/Reta-PHL, /products/PHL-RP09, /products/PHL-RP02, …) — see
 * MERCHANT_CODE_OVERRIDES in src/routes/google-merchant-feed[.]xml.ts.
 * ProductDetail resolves those URLs back to the real product here.
 *
 * KEEP IN SYNC with the feed's MERCHANT_CODE_OVERRIDES map.
 */
const MERCHANT_CODE_TO_SLUG: Record<string, string> = {
  "reta-phl": "retatrutide-research-peptide",
  "phl-rp09": "bpc-157",
  "phl-pt41": "pt-141-research-peptide",
  "phl-tb54": "tb-500-thymosin-beta-4",
  "phl-mc16": "mots-c-research-peptide",
  "phl-kp3": "kpv-research-peptide",
  "phl-gw4": "glow-blend",
  "phl-rp02": "melanotan-ii-research-peptide",
  "phl-bw9": "bacteriostatic-water-research-compound",
  "phl-kw5": "klow-blend",
  "phl-gc3": "ghk-cu-research-peptide",
  "phl-nd7": "nad-research-compound",
};

export function merchantCodeToSlug(code: string | undefined | null): string | null {
  if (!code) return null;
  return MERCHANT_CODE_TO_SLUG[code.toLowerCase()] ?? null;
}
