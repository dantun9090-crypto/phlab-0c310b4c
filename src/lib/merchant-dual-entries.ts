/**
 * Dual-title Google Merchant Center entries.
 *
 * For each physical article we publish TWO GMC offers:
 *   - Entry A ("mkt"): clean human title
 *   - Entry B ("sku"): anonymised PHL-coded title
 *
 * Both entries use opaque alphanumeric URL slugs that do NOT resemble the
 * underlying compound name, and opaque PHL{N} product IDs (PHL1, PHL2…).
 * Each entry's URL renders in place with HTTP 200 via the alias resolver,
 * because Merchant Center can reject redirecting or unavailable product pages.
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

export type DualEntryAliasInfo = {
  canonicalSlug: string;
  variant: DualEntryVariant;
  side: "A" | "B";
  aliasSlug: string;
  pageTitle: string;
};

export type DualEntry = {
  canonicalSlug: string;
  variants: DualEntryVariant[];
};

export const DUAL_ENTRIES: DualEntry[] = [
  {
    canonicalSlug: "retatrutide-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "RTPHL1",
        titleA: "Retatrutide 10mg – High-Purity Research Compound", linkA: "/products/reta-10-phl",
        titleB: "Retatrutide 10mg – Analytical Reference Standard", linkB: "/products/retatrutide-10mg-phl" },
      { sizeKey: "20mg", sizeLabel: "20 mg", phlCode: "RTPHL2",
        titleA: "Retatrutide 20mg – Laboratory Grade Material",  linkA: "/products/reta-20-phl",
        titleB: "Retatrutide 20mg – Research Reference Compound", linkB: "/products/retatrutide-20mg-phl" },
    ],
  },
  {
    canonicalSlug: "tb-500-thymosin-beta-4",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL2",
        titleA: "TB500 Research Compound 10 mg — HPLC + CoA | PH Labs UK", linkA: "/products/h3n8wp",
        titleB: "TB500 PHL 10 mg Research Compound",                      linkB: "/products/h3n8wq" },
    ],
  },
  {
    canonicalSlug: "pt-141-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL3",
        titleA: "PT-141 Research Compound 10 mg — HPLC + CoA | PH Labs UK", linkA: "/products/v9r4tb",
        titleB: "PT41 PHL 10 mg Research Compound",                       linkB: "/products/v9r4tc" },
    ],
  },
  {
    canonicalSlug: "nad-research-compound",
    variants: [
      { sizeKey: "100mg",  sizeLabel: "100 mg",  phlCode: "PHL4",
        titleA: "NAD+ Research Compound 100 mg — HPLC + CoA | PH Labs UK", linkA: "/products/z2j5fd",
        titleB: "ND7 PHL 100 mg Research Compound",                       linkB: "/products/z2j5fe" },
      { sizeKey: "500mg",  sizeLabel: "500 mg",  phlCode: "PHL5",
        titleA: "NAD+ Research Compound 500 mg — HPLC + CoA | PH Labs UK", linkA: "/products/z2j6gd",
        titleB: "ND7 PHL 500 mg Research Compound",                       linkB: "/products/z2j6ge" },
      { sizeKey: "1000mg", sizeLabel: "1000 mg", phlCode: "PHL6",
        titleA: "NAD+ Research Compound 1000 mg — HPLC + CoA | PH Labs UK", linkA: "/products/z2j7hd",
        titleB: "ND7 PHL 1000 mg Research Compound",                       linkB: "/products/z2j7he" },
    ],
  },
  {
    canonicalSlug: "melanotan-ii-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL7",
        titleA: "Melanotan-II Research Compound 10 mg — HPLC + CoA | PH Labs UK", linkA: "/products/q8x1ly",
        titleB: "MT2 PHL 10 mg Research Compound",                                linkB: "/products/q8x1lz" },
    ],
  },
  {
    canonicalSlug: "mots-c-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "MOPHL3",
        titleA: "MOTS-c – Mitochondrial Research Compound", linkA: "/products/mots-01-phl",
        titleB: "MOTS-c – Laboratory Grade Standard",       linkB: "/products/mots-c-phl" },
    ],
  },
  {
    canonicalSlug: "klow-blend",
    variants: [
      { sizeKey: "80mg", sizeLabel: "80 mg", phlCode: "PHL9",
        titleA: "KLOW Blend Research Compound 80 mg — HPLC + CoA | PH Labs UK", linkA: "/products/t4w9rm",
        titleB: "KW5 PHL 80 mg Research Compound",                              linkB: "/products/t4w9rn" },
    ],
  },
  {
    canonicalSlug: "kpv-research-peptide",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL10",
        titleA: "KPV Research Compound 10 mg — HPLC + CoA | PH Labs UK", linkA: "/products/f6c3vp",
        titleB: "KP3 PHL 10 mg Research Compound",                      linkB: "/products/f6c3vq" },
    ],
  },
  {
    canonicalSlug: "glow-blend",
    variants: [
      { sizeKey: "70mg", sizeLabel: "70 mg", phlCode: "PHL11",
        titleA: "GLOW Blend Research Compound 70 mg — HPLC + CoA | PH Labs UK", linkA: "/products/u2s8gk",
        titleB: "GW4 PHL 70 mg Research Compound",                              linkB: "/products/u2s8gl" },
    ],
  },
  {
    canonicalSlug: "ghk-cu-research-peptide",
    variants: [
      { sizeKey: "50mg", sizeLabel: "50 mg", phlCode: "PHL12",
        titleA: "GHK-Cu – Bioactive Copper Complex",          linkA: "/products/ghk-01-phl",
        titleB: "GHK-Cu – High-Purity Research Material",     linkB: "/products/ghk-cu-phl" },
    ],
  },
  {
    canonicalSlug: "bacteriostatic-water-research-compound",
    variants: [
      { sizeKey: "10ml", sizeLabel: "10 ml", phlCode: "PHL13",
        titleA: "Bacteriostatic Water Research Compound 10 ml — Laboratory Use | PH Labs UK", linkA: "/products/d9p1ox",
        titleB: "BW9 PHL 10 ml Research Compound",                                      linkB: "/products/d9p1oy" },
    ],
  },
  {
    canonicalSlug: "bpc-157",
    variants: [
      { sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL14",
        titleA: "BPC-157 Research Compound 10 mg — HPLC + CoA | PH Labs UK", linkA: "/products/r3l6ja",
        titleB: "BPC PHL 10 mg Research Compound",                          linkB: "/products/r3l6jb" },
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

function displayTitleFromFeedTitle(title: string): string {
  return title
    .replace(/\s+—\s+(HPLC \+ CoA|Laboratory Use)\s+\|\s+PH Labs UK$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lookup helper for landing pages: alias slug → canonical product + visible alias title. */
export function getDualEntryAliasInfo(slug: string | undefined | null): DualEntryAliasInfo | null {
  if (!slug) return null;
  const needle = slug.toLowerCase().replace(/^\/products\//, "");
  for (const entry of DUAL_ENTRIES) {
    for (const variant of entry.variants) {
      const linkASlug = slugFromLink(variant.linkA).toLowerCase();
      if (linkASlug === needle) {
        return {
          canonicalSlug: entry.canonicalSlug,
          variant,
          side: "A",
          aliasSlug: linkASlug,
          pageTitle: displayTitleFromFeedTitle(variant.titleA),
        };
      }
      const linkBSlug = slugFromLink(variant.linkB).toLowerCase();
      if (linkBSlug === needle) {
        return {
          canonicalSlug: entry.canonicalSlug,
          variant,
          side: "B",
          aliasSlug: linkBSlug,
          pageTitle: displayTitleFromFeedTitle(variant.titleB),
        };
      }
    }
  }
  return null;
}

/** Lookup helper for the feed: returns variant rows by canonical slug. */
export function getDualVariantsForSlug(slug: string): DualEntryVariant[] {
  const e = DUAL_ENTRIES.find((d) => d.canonicalSlug === slug);
  return e ? e.variants : [];
}
