/**
 * Dual-title Google Merchant Center entries.
 *
 * For each physical article we publish TWO GMC offers:
 *   - Entry A ("mkt"): clean human title, URL = /products/{numeric-id}-{slug}
 *   - Entry B ("sku"): anonymised slug title, URL = /products/{slug-no-hyphens}
 *
 * Both URLs render the same canonical product page (via the alias map in
 * src/lib/product-id-slug-map.ts → LEGACY_SLUG_ALIASES in
 * src/routes/products_.$slug.tsx). Public site URLs are untouched.
 *
 * Keyed by the canonical Firestore product slug. NAD+ is the one article
 * that fans out to multiple variants (100/500/1000 mg) — handled via the
 * `variants` array.
 */
export type DualEntryVariant = {
  /** e.g. "100mg" — used to build IDs/links for variant rows */
  sizeKey: string;
  /** Display tag, e.g. "100 mg" */
  sizeLabel: string;
  /** Entry A title, e.g. "NAD+ 100 mg" */
  titleA: string;
  /** Entry A URL path, e.g. "/products/10004-nad-plus-100mg" */
  linkA: string;
  /** Entry B title, e.g. "ND7-PHL 100 mg" */
  titleB: string;
  /** Entry B URL path, e.g. "/products/nd7phl100" */
  linkB: string;
};

export type DualEntry = {
  /** Canonical product slug in Firestore */
  canonicalSlug: string;
  variants: DualEntryVariant[];
};

export const DUAL_ENTRIES: DualEntry[] = [
  {
    canonicalSlug: "retatrutide-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg",
        titleA: "Retatrutide 10 mg", linkA: "/products/10001-retatrutide-10mg",
        titleB: "Reta-PHL 10 mg",    linkB: "/products/retaphl10" },
    ],
  },
  {
    canonicalSlug: "tb-500-thymosin-beta-4",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg",
        titleA: "TB500 10 mg",       linkA: "/products/10002-tb500-10mg",
        titleB: "TB54-PHL 10 mg",    linkB: "/products/tb54phl10" },
    ],
  },
  {
    canonicalSlug: "pt-141-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg",
        titleA: "PT-141",            linkA: "/products/10003-pt-141",
        titleB: "PT41-PHL",          linkB: "/products/pt41phl" },
    ],
  },
  {
    canonicalSlug: "nad-research-compound",
    variants: [
      { sizeKey: "100mg",  sizeLabel: "100 mg",
        titleA: "NAD+ 100 mg",       linkA: "/products/10004-nad-plus-100mg",
        titleB: "ND7-PHL 100 mg",    linkB: "/products/nd7phl100" },
      { sizeKey: "500mg",  sizeLabel: "500 mg",
        titleA: "NAD+ 500 mg",       linkA: "/products/10005-nad-plus-500mg",
        titleB: "ND7-PHL 500 mg",    linkB: "/products/nd7phl500" },
      { sizeKey: "1000mg", sizeLabel: "1000 mg",
        titleA: "NAD+ 1000 mg",      linkA: "/products/10006-nad-plus-1000mg",
        titleB: "ND7-PHL 1000 mg",   linkB: "/products/nd7phl1000" },
    ],
  },
  {
    canonicalSlug: "melanotan-ii-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg",
        titleA: "Melanotan-II 10 mg", linkA: "/products/10007-melanotan-ii-10mg",
        titleB: "MT2-PHL 10 mg",      linkB: "/products/mt2phl10" },
    ],
  },
  {
    canonicalSlug: "mots-c-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg",
        titleA: "MOTS-c 10 mg",      linkA: "/products/10008-mots-c-10mg",
        titleB: "MC16-PHL 10 mg",    linkB: "/products/mc16phl10" },
    ],
  },
  {
    canonicalSlug: "klow-blend",
    variants: [
      { sizeKey: "80mg", sizeLabel: "80 mg",
        titleA: "KLOW 80 mg",        linkA: "/products/10009-klow-80mg",
        titleB: "KW5-PHL 80 mg",     linkB: "/products/kw5phl80" },
    ],
  },
  {
    canonicalSlug: "kpv-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg",
        titleA: "KPV 10 mg",         linkA: "/products/10010-kpv-10mg",
        titleB: "KP3-PHL 10 mg",     linkB: "/products/kp3phl10" },
    ],
  },
  {
    canonicalSlug: "glow-blend",
    variants: [
      { sizeKey: "70mg", sizeLabel: "70 mg",
        titleA: "GLOW 70 mg",        linkA: "/products/10011-glow-70mg",
        titleB: "GW4-PHL 70 mg",     linkB: "/products/gw4phl70" },
    ],
  },
  {
    canonicalSlug: "ghk-cu-research-peptide",
    variants: [
      { sizeKey: "50mg", sizeLabel: "50 mg",
        titleA: "GHK-Cu 50 mg",      linkA: "/products/10012-ghk-cu-50mg",
        titleB: "GC3-PHL 50 mg",     linkB: "/products/gc3phl50" },
    ],
  },
  {
    canonicalSlug: "bacteriostatic-water-research-compound",
    variants: [
      { sizeKey: "10ml", sizeLabel: "10 ml",
        titleA: "Bacteriostatic Water 10 ml", linkA: "/products/10013-bacteriostatic-water-10ml",
        titleB: "BW9-PHL 10 ml",              linkB: "/products/bw9phl10ml" },
    ],
  },
  {
    canonicalSlug: "bpc-157",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg",
        titleA: "BPC157 10 mg",      linkA: "/products/10014-bpc157-10mg",
        titleB: "BPC-PHL 10 mg",     linkB: "/products/bpcphl10" },
    ],
  },
];

/** Strip the leading "/products/" from a link path. */
function slugFromLink(link: string): string {
  return link.replace(/^\/products\//, "").toLowerCase();
}

/**
 * Build alias map: every dual-entry URL slug → canonical product slug.
 * Consumed by the /products/$slug loader to render or 301 to the
 * canonical product page.
 */
export function buildDualEntryAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of DUAL_ENTRIES) {
    for (const v of entry.variants) {
      map[slugFromLink(v.linkA)] = entry.canonicalSlug;
      map[slugFromLink(v.linkB)] = entry.canonicalSlug;
    }
  }
  return map;
}

export const DUAL_ENTRY_ALIASES: Record<string, string> = buildDualEntryAliasMap();

/** Lookup helper for the feed: returns variant rows by canonical slug. */
export function getDualVariantsForSlug(slug: string): DualEntryVariant[] {
  const e = DUAL_ENTRIES.find((d) => d.canonicalSlug === slug);
  return e ? e.variants : [];
}
