/**
 * Google Merchant Center–compliant product titles and descriptions.
 *
 * Strict rules applied to every entry (May 2026 compliance pass):
 *  - Title contains ONLY scientific/research terminology: "Research Use Only
 *    (RUO)", "Synthetic Peptide", "Analytical Standard", "Laboratory
 *    Reagent", purity %, and CAS number where available.
 *  - No health, medical, fitness, bodybuilding, dosing, or human-use language
 *    anywhere in title or description.
 *  - Description ALWAYS begins with the mandatory disclaimer:
 *      "For Research Use Only — Not for Human Consumption. For professional
 *       laboratory use only."
 *  - Description body contains technical data only: CAS, molecular formula
 *    and weight, amino acid sequence, purity method, storage conditions,
 *    physical form. NO benefits, effects, healing, recovery, anti-ageing,
 *    muscle, fat, sleep, skin, hair, immunity, hormones, or dosing.
 *  - All products map to Google Product Category 499954
 *    "Business & Industrial > Science & Laboratory > Laboratory Chemicals".
 *
 * Keys (`match`) are lowercase substrings matched against the Firestore
 * product `name` field (case-insensitive). The admin "Apply Merchant SEO"
 * action in ToolsTab uses this mapping to update each product's `name` and
 * `description` fields without altering price, stock, images, or variants.
 */

export const MERCHANT_GOOGLE_PRODUCT_CATEGORY =
  "Business & Industrial > Science & Laboratory > Laboratory Chemicals";
export const MERCHANT_GOOGLE_PRODUCT_CATEGORY_ID = 499954;

const DISCLAIMER =
  "For Research Use Only — Not for Human Consumption. For professional laboratory use only.";

export interface MerchantSeoEntry {
  /** Matches against the Firestore product name (case-insensitive substring). */
  match: string;
  /** Replacement product name (≤150 chars per Merchant title spec). */
  name: string;
  /** Replacement description (technical data only, disclaimer first). */
  description: string;
  /** Google Merchant product category (taxonomy string). */
  googleProductCategory: string;
}

function buildDescription(parts: {
  cas?: string;
  formula?: string;
  mw?: string;
  sequence?: string;
  purity?: string;
  form?: string;
  storage?: string;
  composition?: string;
  notes?: string;
}): string {
  const lines: string[] = [DISCLAIMER, ""];
  lines.push("Technical specification:");
  if (parts.cas) lines.push(`• CAS Number: ${parts.cas}`);
  if (parts.formula) lines.push(`• Molecular Formula: ${parts.formula}`);
  if (parts.mw) lines.push(`• Molecular Weight: ${parts.mw}`);
  if (parts.sequence) lines.push(`• Amino Acid Sequence: ${parts.sequence}`);
  if (parts.composition) lines.push(`• Composition: ${parts.composition}`);
  if (parts.purity) lines.push(`• Purity: ${parts.purity}`);
  if (parts.form) lines.push(`• Physical Form: ${parts.form}`);
  if (parts.storage) lines.push(`• Storage: ${parts.storage}`);
  lines.push("");
  lines.push(
    "Supplied as an analytical reference material to qualified research professionals and laboratories in the United Kingdom. Each batch ships with a batch-specific Certificate of Analysis including HPLC chromatogram, batch number, and manufacture date. Not a medicinal product, not a dietary supplement, not a cosmetic. Not for human or veterinary administration, ingestion, injection, topical application, or any in-vivo use. Not for diagnostic or therapeutic purposes.",
  );
  if (parts.notes) {
    lines.push("");
    lines.push(parts.notes);
  }
  return lines.join("\n");
}

export const MERCHANT_SEO_ENTRIES: MerchantSeoEntry[] = [
  {
    match: "retatrutide",
    name: "Retatrutide Synthetic Peptide — Analytical Standard, ≥99% HPLC, CAS 2381089-83-2 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "2381089-83-2",
      formula: "C221H343F2N51O64",
      mw: "≈ 4731.4 g/mol",
      sequence: "Synthetic 39-residue polypeptide (proprietary triagonist analogue)",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "tirzepatide",
    name: "Tirzepatide Synthetic Peptide — Analytical Standard, ≥99% HPLC, CAS 2023788-19-2 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "2023788-19-2",
      formula: "C225H348N48O68",
      mw: "≈ 4813.5 g/mol",
      sequence: "Synthetic 39-residue polypeptide",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "bpc-157",
    name: "Synthetic Pentadecapeptide Reference Material 10 mg — Analytical Standard, ≥99% HPLC, CAS 137525-51-0 — For In Vitro Research Use Only (RUO)",
    description: buildDescription({
      cas: "137525-51-0",
      formula: "C62H98N16O22",
      mw: "1419.53 g/mol",
      sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, 10 mg per sealed glass vial",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "kpv",
    name: "KPV Synthetic Tripeptide (Lys-Pro-Val) — Analytical Standard, ≥99% HPLC, CAS 67727-97-3 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "67727-97-3",
      formula: "C16H30N4O4",
      mw: "342.43 g/mol",
      sequence: "Lys-Pro-Val (H-Lys-Pro-Val-OH)",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "ghk-cu",
    name: "GHK-Cu Synthetic Tripeptide Copper Complex — Analytical Standard, ≥99% HPLC, CAS 89030-95-5 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "89030-95-5",
      formula: "C14H22CuN6O4",
      mw: "401.91 g/mol",
      sequence: "Gly-His-Lys (GHK) coordinated with Cu(II)",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised blue powder, sealed glass vial",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "tb-500",
    name: "Synthetic Heptapeptide Fragment TB-500 — Analytical Standard, ≥99% HPLC, CAS 77591-33-4 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "77591-33-4",
      formula: "C38H68N10O12",
      mw: "889.01 g/mol",
      sequence: "Ac-Leu-Lys-Lys-Thr-Glu-Thr-Gln (acetylated 7-residue fragment of Thymosin β-4)",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "mots-c",
    name: "MOTS-c Synthetic 16-Residue Peptide — Analytical Standard, ≥99% HPLC, CAS 1627580-64-6 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "1627580-64-6",
      formula: "C100H156N32O22S2",
      mw: "≈ 2174.6 g/mol",
      sequence: "Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "nad",
    name: "β-Nicotinamide Adenine Dinucleotide (NAD+) — Analytical Standard, ≥99% HPLC, CAS 53-84-9 — Laboratory Reagent for Research Use Only (RUO)",
    description: buildDescription({
      cas: "53-84-9",
      formula: "C21H27N7O14P2",
      mw: "663.43 g/mol",
      composition: "Oxidised form of nicotinamide adenine dinucleotide (free acid)",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "pt-141",
    name: "PT-141 Synthetic Cyclic Heptapeptide — Analytical Standard, ≥99% HPLC, CAS 189691-06-3 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "189691-06-3",
      formula: "C50H68N14O10",
      mw: "1025.18 g/mol",
      sequence: "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-OH (cyclic 7-residue α-MSH analogue)",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "melanotan",
    name: "Melanotan-II Synthetic Cyclic Heptapeptide — Analytical Standard, ≥99% HPLC, CAS 121062-08-6 — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "121062-08-6",
      formula: "C50H69N15O9",
      mw: "1024.18 g/mol",
      sequence: "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2",
      purity: "≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "glow",
    name: "GLOW Synthetic Peptide Reference Blend (GHK-Cu / BPC-157 / TB-500) — ≥99% HPLC — For Research Use Only (RUO)",
    description: buildDescription({
      composition: "Lyophilised reference blend of three synthetic peptides: GHK-Cu (CAS 89030-95-5), Pentadecapeptide BPC-157 (CAS 137525-51-0), and TB-500 acetate fragment (CAS 77591-33-4)",
      purity: "Each constituent ≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "klow",
    name: "KLOW Synthetic Peptide Reference Blend (KPV / GHK-Cu / BPC-157 / TB-500) — ≥99% HPLC — For Research Use Only (RUO)",
    description: buildDescription({
      composition: "Lyophilised reference blend of four synthetic peptides: KPV tripeptide (CAS 67727-97-3), GHK-Cu (CAS 89030-95-5), Pentadecapeptide BPC-157 (CAS 137525-51-0), and TB-500 acetate fragment (CAS 77591-33-4)",
      purity: "Each constituent ≥99% by RP-HPLC",
      form: "Lyophilised powder, sealed glass vial under nitrogen",
      storage: "Store sealed at −20°C, protect from light and moisture",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "bacteriostatic",
    name: "Bacteriostatic Water 0.9% Benzyl Alcohol — Laboratory Diluent / Reagent — For Research Use Only (RUO)",
    description: buildDescription({
      cas: "7732-18-5 (water) / 100-51-6 (benzyl alcohol)",
      composition: "Sterile water containing 0.9% w/v benzyl alcohol as bacteriostatic preservative",
      purity: "USP-grade analytical diluent",
      form: "Clear colourless solution, sealed multi-dose vial",
      storage: "Store at 15–25°C, protect from light",
      notes: "Supplied as a laboratory diluent / reagent for reconstitution of lyophilised reference materials in controlled in-vitro analytical workflows.",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
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
