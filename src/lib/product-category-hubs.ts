/**
 * Maps a product slug to its keyword-led category hub page.
 * Used on PDPs to add an internal link that boosts the /products/category/*
 * hubs in GSC (link equity + crawl depth).
 *
 * Slugs MUST match entries in src/routes/sitemap[.]xml.ts so we don't link
 * to non-indexed paths.
 */
export interface CategoryHub {
  slug: string;   // e.g. "bpc-157" → /products/category/bpc-157
  label: string;  // anchor text (keyword-led, UK)
}

export const PRODUCT_CATEGORY_HUB: Record<string, CategoryHub> = {
  // Per-peptide hubs (exact-match keyword anchors)
  "bpc-157":                              { slug: "bpc-157",            label: "BPC-157 UK research peptides" },
  "retatrutide-research-peptide":         { slug: "retatrutide",        label: "Retatrutide UK research peptides" },
  "tirzepatide-research-peptide":         { slug: "tirzepatide",        label: "Tirzepatide UK research peptides" },
  "tb-500-thymosin-beta-4":               { slug: "tb-500",             label: "TB-500 UK research peptides" },
  "ghk-cu-research-peptide":              { slug: "ghk-cu",             label: "GHK-Cu UK research peptides" },
  "bacteriostatic-water-research-compound": { slug: "bacteriostatic-water", label: "Bacteriostatic water UK" },

  // Thematic hubs
  "mots-c-research-peptide":              { slug: "cellular-aging",     label: "Cellular aging research peptides" },
  "nad-research-compound":                { slug: "cellular-aging",     label: "Cellular aging research compounds" },
  "klow-blend":                           { slug: "blends",             label: "Research peptide blends UK" },
  "glow-blend":                           { slug: "blends",             label: "Research peptide blends UK" },
  "melanotan-2-research-peptide":         { slug: "melanin",            label: "Melanin research peptides UK" },
  "pt-141-research-peptide":              { slug: "neurological",       label: "Neurological research peptides UK" },
  "kpv-research-peptide":                 { slug: "tissue-repair",      label: "Tissue-repair research peptides" },
};

export function getCategoryHub(productSlug?: string | null): CategoryHub | null {
  if (!productSlug) return null;
  return PRODUCT_CATEGORY_HUB[productSlug.toLowerCase()] ?? null;
}
