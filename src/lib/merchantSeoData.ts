/**
 * Google Merchant Center–compliant titles and descriptions for the 13 active
 * research products. All copy is written in British English, scientific tone,
 * with explicit "laboratory research use only — not for human or veterinary
 * consumption" framing and no therapeutic, dosing, or efficacy claims.
 *
 * Keys are lowercase name fragments matched against the Firestore product
 * `name` field (case-insensitive substring). The admin "Apply Merchant SEO"
 * action in ToolsTab uses this mapping to update each product's `name` and
 * `description` fields without altering price, stock, images, or variants.
 */

export interface MerchantSeoEntry {
  /** Matches against the Firestore product name (case-insensitive substring). */
  match: string;
  /** Replacement product name (≤60 chars, used as <title> in route head). */
  name: string;
  /** Replacement product description (Merchant Center compliant, ~300–600 chars). */
  description: string;
}

export const MERCHANT_SEO_ENTRIES: MerchantSeoEntry[] = [
  {
    match: "retatrutide",
    name: "Retatrutide | Laboratory Research Reference Compound",
    description:
      "Retatrutide lyophilised reference compound supplied for in-vitro laboratory research only. HPLC-verified to ≥99% purity with a batch-specific Certificate of Analysis. Strictly not for human or veterinary use, not a medicinal product, and not for diagnostic or therapeutic application. Sold exclusively to qualified research professionals in the United Kingdom for controlled scientific investigation.",
  },
  {
    match: "tirzepatide",
    name: "Tirzepatide | Research Reference Compound for Lab Use",
    description:
      "Tirzepatide lyophilised reference compound for in-vitro laboratory research use only. Independently HPLC-tested to ≥99% purity with a batch Certificate of Analysis. Not for human or veterinary use, not a medicinal product, and not intended for diagnostic, therapeutic, or in-vivo application. Supplied to qualified research professionals in the United Kingdom for controlled scientific study.",
  },
  {
    match: "bpc-157",
    name: "BPC-157 | Laboratory Reference Peptide (Research Only)",
    description:
      "BPC-157 (Body Protection Compound 157) lyophilised reference peptide for in-vitro laboratory research only. HPLC-verified to ≥99% purity with batch-matched Certificate of Analysis. Not for human or veterinary use, not a medicinal product, and not for diagnostic or therapeutic application. Sold to qualified research professionals in the United Kingdom for controlled scientific investigation.",
  },
  {
    match: "kpv",
    name: "KPV Tripeptide | Reference Compound for Lab Research",
    description:
      "KPV tripeptide (Lys-Pro-Val) lyophilised reference compound for in-vitro laboratory research only. HPLC-tested to ≥99% purity with batch Certificate of Analysis. Not for human or veterinary use, not a medicinal product, and not for diagnostic or therapeutic application. Supplied to qualified UK research professionals for controlled laboratory study.",
  },
  {
    match: "tb-500",
    name: "TB-500 (Thymosin β-4 Fragment) | Lab Reference Compound",
    description:
      "TB-500, a synthetic fragment of Thymosin Beta-4, supplied as a lyophilised reference compound for in-vitro laboratory research only. HPLC-verified to ≥99% purity with batch Certificate of Analysis. Not for human or veterinary use, not a medicinal product, and not for diagnostic or therapeutic application. Sold to qualified UK research professionals.",
  },
  {
    match: "mots-c",
    name: "MOTS-c | Mitochondrial Peptide Lab Reference Compound",
    description:
      "MOTS-c, a mitochondrial-derived peptide reference compound supplied lyophilised for in-vitro laboratory research only. HPLC-tested to ≥99% purity with batch Certificate of Analysis. Not for human or veterinary use, not a medicinal product, and not for diagnostic or therapeutic application. Sold to qualified UK research professionals for controlled laboratory study.",
  },
  {
    match: "ghk-cu",
    name: "GHK-Cu | Copper Tripeptide Laboratory Reference Compound",
    description:
      "GHK-Cu copper tripeptide complex supplied as a lyophilised reference compound for in-vitro laboratory research only. HPLC-verified to ≥99% purity with batch Certificate of Analysis. Not for human or veterinary use, not a cosmetic, and not a medicinal product. Intended exclusively for controlled scientific investigation by qualified UK research professionals.",
  },
  {
    match: "nad",
    name: "NAD+ | Nicotinamide Adenine Dinucleotide (Lab Use Only)",
    description:
      "NAD+ (Nicotinamide Adenine Dinucleotide) supplied as a lyophilised laboratory reference compound for in-vitro research use only. HPLC-tested to ≥99% purity with batch Certificate of Analysis. Not for human or veterinary use, not a dietary supplement, and not a medicinal product. Sold to qualified research professionals in the United Kingdom for controlled scientific study.",
  },
  {
    match: "pt-141",
    name: "PT-141 | Laboratory Reference Compound (Research Only)",
    description:
      "PT-141 lyophilised reference compound supplied for in-vitro laboratory research only. Independently HPLC-tested to ≥99% purity with a batch Certificate of Analysis. Not for human or veterinary use, not a medicinal product, and not for diagnostic or therapeutic application. Supplied to qualified UK research professionals for controlled scientific investigation.",
  },
  {
    match: "melanotan",
    name: "Melanotan II | Laboratory Reference Compound (Research)",
    description:
      "Melanotan II lyophilised reference compound supplied for in-vitro laboratory research only. HPLC-verified to ≥99% purity with batch Certificate of Analysis. Not for human or veterinary use, not a cosmetic, and not a medicinal product. Not for diagnostic, therapeutic, or in-vivo application. Sold strictly to qualified UK research professionals for controlled scientific study.",
  },
  {
    match: "glow",
    name: "GLOW Blend | Laboratory Reference Blend (Research Use)",
    description:
      "GLOW research blend supplied as a lyophilised reference preparation for in-vitro laboratory study only. Each batch is HPLC-tested with a Certificate of Analysis. Not for human or veterinary use, not a cosmetic, and not a medicinal product. Intended exclusively for controlled scientific investigation by qualified UK research professionals.",
  },
  {
    match: "klow",
    name: "KLOW Blend | Laboratory Reference Blend (Research Use)",
    description:
      "KLOW research blend supplied as a lyophilised reference preparation for in-vitro laboratory study only. Each batch is HPLC-tested with a Certificate of Analysis. Not for human or veterinary use, not a cosmetic, and not a medicinal product. Intended exclusively for controlled scientific investigation by qualified UK research professionals.",
  },
  {
    match: "bacteriostatic",
    name: "Bacteriostatic Water 0.9% Benzyl Alcohol | Lab Diluent",
    description:
      "Bacteriostatic water (0.9% benzyl alcohol) supplied as a laboratory diluent for reconstitution of lyophilised research reference compounds in controlled in-vitro investigation. For laboratory research use only. Not for human or veterinary use, not for injection, and not a medicinal product. Sold to qualified UK research professionals.",
  },
];

/**
 * Find the matching Merchant Center SEO entry for a given product name.
 * Returns null when no entry's `match` substring appears in the name.
 */
export function findMerchantEntry(productName: string): MerchantSeoEntry | null {
  const lower = (productName || "").toLowerCase();
  return (
    MERCHANT_SEO_ENTRIES.find((entry) => lower.includes(entry.match)) ?? null
  );
}
