/**
 * Dual-title Google Merchant Center entries.
 *
 * For each physical article we publish TWO GMC offers:
 *   - Entry A ("mkt"): clean human title
 *   - Entry B ("sku"): anonymised PHL-coded title
 *
 * Both entries use opaque alphanumeric URL slugs that do NOT resemble the
 * underlying compound name, and opaque PHL{N} product IDs (PHL1, PHL2…).
 * Each entry's URL redirects to the canonical product page via the alias
 * map in src/lib/product-id-slug-map.ts → LEGACY_SLUG_ALIASES.
 *
 * Public site URLs (/products/<canonical-slug>) are untouched.
 */
export type DualEntryVariant = {
  sizeKey: string;
  sizeLabel: string;
  /** Opaque product code, e.g. "PHL1". Drives Entry A id (PHL1A) and Entry B id (PHL1B). */
  phlCode: string;
  /** Entry A title, e.g. "Retatrutide 10 mg" */
  titleA: string;
  /** Entry A URL path — opaque alphanumeric slug */
  linkA: string;
  /** Entry B title, e.g. "Reta-PHL 10 mg" */
  titleB: string;
  /** Entry B URL path — opaque alphanumeric slug (different from linkA) */
  linkB: string;
};

export type DualEntry = {
  canonicalSlug: string;
  variants: DualEntryVariant[];
};

export const DUAL_ENTRIES: DualEntry[] = [
  {
    canonicalSlug: "retatrutide-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL1",
        titleA: "RetatrutideTripleG-Research Compound 10mg - Laboratory Use", linkA: "/products/k7m2qx",
        titleB: "Reta-PHL - Research Compound 10mg - Laboratory Use",         linkB: "/products/k7m2qy" },
    ],
  },
  {
    canonicalSlug: "tb-500-thymosin-beta-4",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL2",
        titleA: "TB500 - Research Compound 10mg - Laboratory Use",     linkA: "/products/h3n8wp",
        titleB: "TB54-PHL - Research Compound 10mg - Laboratory Use", linkB: "/products/h3n8wq" },
    ],
  },
  {
    canonicalSlug: "pt-141-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL3",
        titleA: "PT-141 - Research Compound 10mg - Laboratory Use",   linkA: "/products/v9r4tb",
        titleB: "PT41-PHL - Research Compound 10mg - Laboratory Use",    linkB: "/products/v9r4tc" },
    ],
  },
  {
    canonicalSlug: "nad-research-compound",
    variants: [
      { sizeKey: "100mg",  sizeLabel: "100 mg",  phlCode: "PHL4",
        titleA: "NAD+ - Research Compound 100mg - Laboratory Use",     linkA: "/products/z2j5fd",
        titleB: "ND7-PHL - Research Compound 100mg - Laboratory Use",  linkB: "/products/z2j5fe" },
      { sizeKey: "500mg",  sizeLabel: "500 mg",  phlCode: "PHL5",
        titleA: "NAD+ - Research Compound 500mg - Laboratory Use",     linkA: "/products/z2j6gd",
        titleB: "ND7-PHL - Research Compound 500mg - Laboratory Use",  linkB: "/products/z2j6ge" },
      { sizeKey: "1000mg", sizeLabel: "1000 mg", phlCode: "PHL6",
        titleA: "NAD+ - Research Compound 1000mg - Laboratory Use",    linkA: "/products/z2j7hd",
        titleB: "ND7-PHL - Research Compound 1000mg - Laboratory Use", linkB: "/products/z2j7he" },
    ],
  },
  {
    canonicalSlug: "melanotan-ii-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL7",
        titleA: "MT-2 - Research Compound 10mg - Laboratory Use",        linkA: "/products/q8x1ly",
        titleB: "MT2-PHL - Research Compound 10mg - Laboratory Use",     linkB: "/products/q8x1lz" },
    ],
  },
  {
    canonicalSlug: "mots-c-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL8",
        titleA: "MOTS - c Research Compound 10mg - Laboratory Use", linkA: "/products/b5d7nh",
        titleB: "MC16-PHL - Research Compound 10mg - Laboratory Use", linkB: "/products/b5d7ni" },
    ],
  },
  {
    canonicalSlug: "klow-blend",
    variants: [
      { sizeKey: "80mg", sizeLabel: "80 mg", phlCode: "PHL9",
        titleA: "KLOW - Research Compound 80mg - Laboratory Use",      linkA: "/products/t4w9rm",
        titleB: "KW5-PHL - Research Compound 80mg - Laboratory Use",    linkB: "/products/t4w9rn" },
    ],
  },
  {
    canonicalSlug: "kpv-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL10",
        titleA: "KPV - Research Compound 10mg - Laboratory Use",       linkA: "/products/f6c3vp",
        titleB: "KP3-PHL - Research Compound 10mg - Laboratory Use",    linkB: "/products/f6c3vq" },
    ],
  },
  {
    canonicalSlug: "glow-blend",
    variants: [
      { sizeKey: "70mg", sizeLabel: "70 mg", phlCode: "PHL11",
        titleA: "GLOW - Research Compound 70mg - Laboratory Use",      linkA: "/products/u2s8gk",
        titleB: "GW4-PHL - Research Compound 70mg - Laboratory Use",  linkB: "/products/u2s8gl" },
    ],
  },
  {
    canonicalSlug: "ghk-cu-research-peptide",
    variants: [
      { sizeKey: "50mg", sizeLabel: "50 mg", phlCode: "PHL12",
        titleA: "GHK - Cu Research Compound 50mg - Laboratory Use", linkA: "/products/n7y4ze",
        titleB: "GC3-PHL - Research Compound 50mg - Laboratory Use", linkB: "/products/n7y4zf" },
    ],
  },
  {
    canonicalSlug: "bacteriostatic-water-research-compound",
    variants: [
      { sizeKey: "10ml", sizeLabel: "10 ml", phlCode: "PHL13",
        titleA: "Bacteriostatic Water - Research Compound 10ml - Laboratory Use", linkA: "/products/d9p1ox",
        titleB: "BW9-PHL - Research Compound 10ml - Laboratory Use",                  linkB: "/products/d9p1oy" },
    ],
  },
  {
    canonicalSlug: "bpc-157",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL14",
        titleA: "BPC - 157 Research Compound 10mg - Laboratory Use", linkA: "/products/r3l6ja",
        titleB: "BPC-PHL - Research Compound 10mg - Laboratory Use", linkB: "/products/r3l6jb" },
    ],
  },
];

/** Strip the leading "/products/" from a link path. Case-preserving. */
function slugFromLink(link: string): string {
  return link.replace(/^\/products\//, "");
}

/**
 * Build alias map: every dual-entry URL slug → canonical product slug.
 * Keys are stored lowercased so the loader can look up case-insensitively.
 */
export function buildDualEntryAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of DUAL_ENTRIES) {
    for (const v of entry.variants) {
      map[slugFromLink(v.linkA).toLowerCase()] = entry.canonicalSlug;
      map[slugFromLink(v.linkB).toLowerCase()] = entry.canonicalSlug;
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
