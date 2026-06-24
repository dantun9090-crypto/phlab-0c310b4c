/**
 * Hard-coded Firestore document ID → canonical product slug map.
 *
 * Used by the /products/$slug route loader to 301-redirect any URL that
 * carries a raw Firestore document ID (e.g. legacy Google Merchant feed
 * links like /products/2s5IGEx2RgUDLfbfjBbF) to the pretty slug URL
 * WITHOUT depending on a live Firestore lookup succeeding.
 *
 * Why this exists:
 *   The loader previously called fetchProductByIdFn to resolve the slug
 *   at request time. If that call failed (network, Firestore latency,
 *   cold worker), the loader fell through to notFound() and the legacy
 *   client app then redirected the user to /products — the wrong page.
 *   This map removes the network dependency for known products so the
 *   redirect is deterministic and instant.
 *
 * Keep this map in sync with /product_stock when adding/removing products.
 * Source of truth (Firestore) wins — this is a fallback / fast path.
 */
export const PRODUCT_ID_TO_SLUG: Record<string, string> = {
  "0SmgaOM1OwX2DFEzSqpk": "pt-141-research-peptide",
  "2s5IGEx2RgUDLfbfjBbF": "retatrutide-research-peptide",
  "8VzrHmW2obRm83wa16K0": "tb-500-thymosin-beta-4",
  C8t1BhKZiOdTIuHhAuCf: "mots-c-research-peptide",
  H8TIYQyUVQQ35IGAT5LT: "kpv-research-peptide",
  K1nPBdCWYGDsAlCZlirV: "glow-blend",
  KyhaDyhjGUQH1isJ4nHN: "tirzepatide-research-peptide",
  UsB1FvVUrl0rWytSoErA: "melanotan-ii-research-peptide",
  kONztvd1Xj5FQwAYMaT4: "bpc-157",
  ltbeRRim8rarYPfGsrmf: "bacteriostatic-water-research-compound",
  maibTaw5CXVkw1aDgvHd: "klow-blend",
  qRuXaxlV0T9VpS12vZcn: "ghk-cu-research-peptide",
  wbOYNDdxzzFWdj5qAwrS: "nad-research-compound",
  // Google Merchant anonymised research codes — mirror canonical slugs so
  // /products/<code> renders the real product in place (matchedBy: "id").
  // Keep in sync with MERCHANT_CODE_OVERRIDES in google-merchant-feed[.]xml.ts.
  "PHL-RT8": "retatrutide-research-peptide",
  "PHL-BP15": "bpc-157",
};

export function resolveSlugFromId(id: string): string | null {
  return PRODUCT_ID_TO_SLUG[id] ?? null;
}
