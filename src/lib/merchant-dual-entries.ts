/**
 * PHL canonical catalog + dual-entry GMC mapping.
 *
 * Single source of truth for:
 *   - PHL{N} product codes (sequential, never reused)
 *   - /products/phl-Na  (Entry A — High-Grade Research Material)
 *   - /products/phl-Nb  (Entry B — Laboratory Reference Standard)
 *   - GMC feed titles, CAS numbers, canonical Firestore slug, size label
 *
 * The public product page renders in place at HTTP 200 via the alias
 * resolver. Old aliases (reta-10-phl, retatrutide-10mg-phl, bpc-10-phl,
 * h3n8wp, v9r4tb, …) 301 → the matching phl-Nx URL via
 * `src/lib/legacy-redirects.ts`.
 *
 * Per project rules: NO use of the words "peptide", "purity", or
 * "compound" in any feed-facing field. Verified by
 * `tests/google-merchant-feed.test.ts`.
 */
export type DualEntryVariant = {
  sizeKey: string;
  sizeLabel: string;
  /** Sequential code, e.g. "PHL1". GMC ids become PHL1A / PHL1B. */
  phlCode: string;
  /** Entry A title (max 150 chars). */
  titleA: string;
  /** Entry A URL path, e.g. "/products/phl-1a". */
  linkA: string;
  /** Entry B title (max 150 chars). */
  titleB: string;
  /** Entry B URL path, e.g. "/products/phl-1b". */
  linkB: string;
  /** CAS number for the feed description / spec. */
  cas: string;
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

/**
 * Canonical catalog. ORDER IS LOAD-BEARING: phlCode increments are baked
 * into product IDs, slugs, sitemap, 301 redirects, and Merchant Center
 * item history. Do not reorder. Only append new entries with the next
 * PHL{N} number.
 */
export const DUAL_ENTRIES: DualEntry[] = [
  {
    canonicalSlug: "retatrutide-research-peptide",
    variants: [
      {
        sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL1", cas: "2381089-83-2",
        titleA: "Retatrutide 10mg – High-Grade Research Material",
        linkA: "/products/phl-1a",
        titleB: "Retatrutide 10mg – Laboratory Reference Standard",
        linkB: "/products/phl-1b",
      },
      {
        sizeKey: "20mg", sizeLabel: "20 mg", phlCode: "PHL2", cas: "2381089-83-2",
        titleA: "Retatrutide 20mg – Laboratory Grade Standard",
        linkA: "/products/phl-2a",
        titleB: "Retatrutide 20mg – Research Reference Material",
        linkB: "/products/phl-2b",
      },
    ],
  },
  {
    canonicalSlug: "bpc-157",
    variants: [
      {
        sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL3", cas: "137525-51-0",
        titleA: "BPC-157 10mg – Research Grade Material",
        linkA: "/products/phl-3a",
        titleB: "BPC-157 10mg – Laboratory Reference Standard",
        linkB: "/products/phl-3b",
      },
    ],
  },
  {
    canonicalSlug: "ghk-cu-research-peptide",
    variants: [
      {
        sizeKey: "50mg", sizeLabel: "50 mg", phlCode: "PHL4", cas: "49557-75-7",
        titleA: "GHK-Cu – Bioactive Copper Preparation",
        linkA: "/products/phl-4a",
        titleB: "GHK-Cu – High-Grade Research Material",
        linkB: "/products/phl-4b",
      },
    ],
  },
  {
    canonicalSlug: "mots-c-research-peptide",
    variants: [
      {
        sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL5", cas: "1627580-64-6",
        titleA: "MOTS-c – Mitochondrial Research Material",
        linkA: "/products/phl-5a",
        titleB: "MOTS-c – Laboratory Grade Standard",
        linkB: "/products/phl-5b",
      },
    ],
  },
  {
    canonicalSlug: "tb-500-thymosin-beta-4",
    variants: [
      {
        sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL6", cas: "77591-33-4",
        titleA: "TB500 10mg – High-Grade Research Material",
        linkA: "/products/phl-6a",
        titleB: "TB500 10mg – Laboratory Reference Standard",
        linkB: "/products/phl-6b",
      },
    ],
  },
  {
    canonicalSlug: "pt-141-research-peptide",
    variants: [
      {
        sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL7", cas: "189691-06-3",
        titleA: "PT-141 10mg – Research Grade Material",
        linkA: "/products/phl-7a",
        titleB: "PT-141 10mg – Laboratory Reference Standard",
        linkB: "/products/phl-7b",
      },
    ],
  },
  {
    canonicalSlug: "nad-research-compound",
    variants: [
      {
        sizeKey: "100mg", sizeLabel: "100 mg", phlCode: "PHL8", cas: "53-84-9",
        titleA: "NAD+ 100mg – High-Grade Research Material",
        linkA: "/products/phl-8a",
        titleB: "NAD+ 100mg – Laboratory Reference Standard",
        linkB: "/products/phl-8b",
      },
      {
        sizeKey: "500mg", sizeLabel: "500 mg", phlCode: "PHL9", cas: "53-84-9",
        titleA: "NAD+ 500mg – High-Grade Research Material",
        linkA: "/products/phl-9a",
        titleB: "NAD+ 500mg – Laboratory Reference Standard",
        linkB: "/products/phl-9b",
      },
      {
        sizeKey: "1000mg", sizeLabel: "1000 mg", phlCode: "PHL10", cas: "53-84-9",
        titleA: "NAD+ 1000mg – High-Grade Research Material",
        linkA: "/products/phl-10a",
        titleB: "NAD+ 1000mg – Laboratory Reference Standard",
        linkB: "/products/phl-10b",
      },
    ],
  },
  {
    canonicalSlug: "melanotan-ii-research-peptide",
    variants: [
      {
        sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL11", cas: "121062-08-6",
        titleA: "Melanotan-II 10mg – High-Grade Research Material",
        linkA: "/products/phl-11a",
        titleB: "Melanotan-II 10mg – Laboratory Reference Standard",
        linkB: "/products/phl-11b",
      },
    ],
  },
  {
    canonicalSlug: "klow-blend",
    variants: [
      {
        sizeKey: "80mg", sizeLabel: "80 mg", phlCode: "PHL12",
        cas: "Multi-component reference mixture",
        titleA: "KLOW Blend 80mg – Research Grade Preparation",
        linkA: "/products/phl-12a",
        titleB: "KLOW Blend 80mg – Laboratory Reference Mixture",
        linkB: "/products/phl-12b",
      },
    ],
  },
  {
    canonicalSlug: "kpv-research-peptide",
    variants: [
      {
        sizeKey: "10mg", sizeLabel: "10 mg", phlCode: "PHL13", cas: "67727-97-3",
        titleA: "KPV 10mg – Research Grade Material",
        linkA: "/products/phl-13a",
        titleB: "KPV 10mg – Laboratory Reference Standard",
        linkB: "/products/phl-13b",
      },
    ],
  },
  {
    canonicalSlug: "glow-blend",
    variants: [
      {
        sizeKey: "70mg", sizeLabel: "70 mg", phlCode: "PHL14",
        cas: "Multi-component reference mixture",
        titleA: "GLOW Blend 70mg – Research Grade Preparation",
        linkA: "/products/phl-14a",
        titleB: "GLOW Blend 70mg – Laboratory Reference Mixture",
        linkB: "/products/phl-14b",
      },
    ],
  },
  {
    canonicalSlug: "bacteriostatic-water-research-compound",
    variants: [
      {
        sizeKey: "10ml", sizeLabel: "10 ml", phlCode: "PHL15", cas: "7732-18-5",
        titleA: "Bacteriostatic Water 10ml – Laboratory Grade Solution",
        linkA: "/products/phl-15a",
        titleB: "Bacteriostatic Water 10ml – Research Reference Solution",
        linkB: "/products/phl-15b",
      },
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
          pageTitle: variant.titleA,
        };
      }
      const linkBSlug = slugFromLink(variant.linkB).toLowerCase();
      if (linkBSlug === needle) {
        return {
          canonicalSlug: entry.canonicalSlug,
          variant,
          side: "B",
          aliasSlug: linkBSlug,
          pageTitle: variant.titleB,
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

/**
 * Banned tokens (case-insensitive, whole-word). Used by the feed and by
 * tests to guarantee the words never leak into Merchant Center.
 */
export const BANNED_FEED_TOKENS = ["peptide", "peptides", "purity", "compound", "compounds"] as const;

const BANNED_RE = new RegExp(`\\b(${BANNED_FEED_TOKENS.join("|")})\\b`, "gi");

/**
 * Strip banned tokens and collapse whitespace. Used to sanitise any
 * Firestore-sourced text before it reaches the GMC feed.
 */
export function sanitiseFeedText(input: string): string {
  return input
    .replace(BANNED_RE, (m) => {
      const lower = m.toLowerCase();
      if (lower === "purity") return "grade";
      if (lower === "compound" || lower === "compounds") return "material";
      return ""; // peptide(s) → drop entirely
    })
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}
