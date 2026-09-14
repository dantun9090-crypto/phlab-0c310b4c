/**
 * Google Merchant Center–compliant product titles and descriptions.
 *
 * Single house style (September 2026 consistency pass) — every one of the 13
 * entries is built from the same two helpers so titles and descriptions share
 * an identical structure, field order and length band:
 *
 *  TITLE  = <scientific name> — <physical form> — <purity/grade> — CAS <n>
 *           — For Research Use Only (RUO)          (≤150 chars, Merchant spec)
 *
 *  BODY   = mandated notice
 *           "Technical specification:" block, always in this field order:
 *             CAS → Molecular Formula → Molecular Weight → Amino Acid Sequence
 *             → Composition → Purity → Physical Form → Storage
 *           supply/documentation paragraph
 *           non-medicinal / no-human-use paragraph
 *
 * Strict content rules:
 *  - Scientific / analytical terminology only. UK spelling throughout
 *    (lyophilised, colourless, analysed, sterilised).
 *  - NO dosage, dosing, reconstitution volumes, administration or any
 *    instruction for use. NO health, medical, fitness or cosmetic language.
 *    NO marketing adjectives (premium, best, powerful, revolutionary).
 *  - Description ALWAYS begins with the mandated notice:
 *      "For Research Use Only. Not for Human Consumption."
 *  - Pack size is deliberately NOT in the title — sizes live on the product
 *    variants, so a fixed size in the title would contradict the variant data.
 *  - All products map to Google Product Category 499954
 *    "Business & Industrial > Science & Laboratory > Laboratory Chemicals".
 *
 * URL / link policy: this file contains NO product URLs, slugs or IDs. Feed
 * links are built from the Firestore `slug` / document ID by the feed routes
 * and MUST NOT be changed — the catalogue is synced to Google Merchant Center
 * and any URL change de-lists the products.
 *
 * Keys (`match`) are lowercase substrings matched against the Firestore
 * product `name` field (case-insensitive). The admin "Apply Merchant SEO"
 * action in ToolsTab uses this mapping to update each product's `name` and
 * `description` fields without altering price, stock, images, variants,
 * slug or document ID.
 */

export const MERCHANT_GOOGLE_PRODUCT_CATEGORY =
  "Business & Industrial > Science & Laboratory > Laboratory Chemicals";
export const MERCHANT_GOOGLE_PRODUCT_CATEGORY_ID = 499954;

/** Mandated research-use notice — exact wording, first line of every description. */
const DISCLAIMER = "For Research Use Only. Not for Human Consumption.";

/** Shared supply / documentation paragraph (identical for every entry). */
const SUPPLY_PARAGRAPH =
  "Supplied as an analytical reference material to qualified research professionals and laboratories in the United Kingdom. Each batch is despatched with a batch-specific Certificate of Analysis containing the RP-HPLC chromatogram, batch number and date of manufacture.";

/** Shared non-medicinal paragraph (identical for every entry). */
const NON_MEDICINAL_PARAGRAPH =
  "Not a medicinal product, not a dietary supplement, not a cosmetic. Not for human or veterinary administration, ingestion, injection, topical application or any in-vivo use. Not for diagnostic or therapeutic purposes. No instructions for use are supplied or implied.";

/** Standard purity statement — used in both title and body. */
const STANDARD_PURITY = "≥99% by RP-HPLC";
const STANDARD_PURITY_SHORT = "≥99% RP-HPLC";

/** Standard cold-storage statement (UK spelling). */
const STANDARD_STORAGE = "Store sealed at −20°C, protect from light and moisture";

export interface MerchantSeoEntry {
  /** Matches against the Firestore product name (case-insensitive substring). */
  match: string;
  /** Replacement product name (≤150 chars per Merchant title spec). */
  name: string;
  /** Replacement description (technical data only, notice first). */
  description: string;
  /** Google Merchant product category (taxonomy string). */
  googleProductCategory: string;
}

/**
 * Build a title in the single house pattern.
 * Every title has exactly five segments in the same order.
 */
function buildName(parts: {
  /** Scientific / masked product designation. */
  designation: string;
  /** Physical form segment, e.g. "Lyophilised Powder". */
  form: string;
  /** Purity or grade segment, e.g. "≥99% RP-HPLC". */
  grade?: string;
  /** CAS segment content, omitted for blends with no single CAS. */
  cas?: string;
}): string {
  const segments = [parts.designation, parts.form];
  segments.push(parts.grade ?? STANDARD_PURITY_SHORT);
  if (parts.cas) segments.push(`CAS ${parts.cas}`);
  segments.push("For Research Use Only (RUO)");
  return segments.join(" — ");
}

/**
 * Build a description in the single house pattern.
 * Field order is fixed and independent of the order of the object keys.
 */
function buildDescription(parts: {
  cas?: string;
  formula?: string;
  mw?: string;
  sequence?: string;
  composition?: string;
  purity?: string;
  form?: string;
  storage?: string;
}): string {
  const lines: string[] = [DISCLAIMER, "", "Technical specification:"];
  if (parts.cas) lines.push(`• CAS Number: ${parts.cas}`);
  if (parts.formula) lines.push(`• Molecular Formula: ${parts.formula}`);
  if (parts.mw) lines.push(`• Molecular Weight: ${parts.mw}`);
  if (parts.sequence) lines.push(`• Amino Acid Sequence: ${parts.sequence}`);
  if (parts.composition) lines.push(`• Composition: ${parts.composition}`);
  lines.push(`• Purity: ${parts.purity ?? STANDARD_PURITY}`);
  if (parts.form) lines.push(`• Physical Form: ${parts.form}`);
  lines.push(`• Storage: ${parts.storage ?? STANDARD_STORAGE}`);
  lines.push("", SUPPLY_PARAGRAPH, "", NON_MEDICINAL_PARAGRAPH);
  return lines.join("\n");
}

const LYO_VIAL = "Lyophilised powder, sealed glass vial under nitrogen";

export const MERCHANT_SEO_ENTRIES: MerchantSeoEntry[] = [
  {
    match: "retatrutide",
    name: buildName({
      designation: "Retatrutide Synthetic Peptide",
      form: "Lyophilised Powder",
      cas: "2381089-83-2",
    }),
    description: buildDescription({
      cas: "2381089-83-2",
      formula: "C221H343F2N51O64",
      mw: "≈ 4731.4 g/mol",
      sequence: "Synthetic 39-residue polypeptide (triagonist analogue)",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "tirzepatide",
    name: buildName({
      designation: "Tirzepatide Synthetic Peptide",
      form: "Lyophilised Powder",
      cas: "2023788-19-2",
    }),
    description: buildDescription({
      cas: "2023788-19-2",
      formula: "C225H348N48O68",
      mw: "≈ 4813.5 g/mol",
      sequence: "Synthetic 39-residue polypeptide",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "bpc-157",
    // Masked designation retained deliberately for the paid Merchant channel.
    name: buildName({
      designation: "Synthetic Pentadecapeptide Reference Material",
      form: "Lyophilised Powder",
      cas: "137525-51-0",
    }),
    description: buildDescription({
      cas: "137525-51-0",
      formula: "C62H98N16O22",
      mw: "1419.53 g/mol",
      sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "kpv",
    name: buildName({
      designation: "KPV Synthetic Tripeptide (Lys-Pro-Val)",
      form: "Lyophilised Powder",
      cas: "67727-97-3",
    }),
    description: buildDescription({
      cas: "67727-97-3",
      formula: "C16H30N4O4",
      mw: "342.43 g/mol",
      sequence: "Lys-Pro-Val (H-Lys-Pro-Val-OH)",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "ghk-cu",
    name: buildName({
      designation: "GHK-Cu Synthetic Tripeptide Copper Complex",
      form: "Lyophilised Powder",
      cas: "89030-95-5",
    }),
    description: buildDescription({
      cas: "89030-95-5",
      formula: "C14H22CuN6O4",
      mw: "401.91 g/mol",
      sequence: "Gly-His-Lys (GHK) coordinated with Cu(II)",
      form: "Lyophilised blue powder, sealed glass vial under nitrogen",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "tb-500",
    // Masked designation retained deliberately for the paid Merchant channel.
    name: buildName({
      designation: "Synthetic Heptapeptide Fragment Reference Material",
      form: "Lyophilised Powder",
      cas: "77591-33-4",
    }),
    description: buildDescription({
      cas: "77591-33-4",
      formula: "C38H68N10O12",
      mw: "889.01 g/mol",
      sequence: "Ac-Leu-Lys-Lys-Thr-Glu-Thr-Gln (acetylated 7-residue fragment of thymosin β-4)",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "mots-c",
    name: buildName({
      designation: "MOTS-c Synthetic 16-Residue Peptide",
      form: "Lyophilised Powder",
      cas: "1627580-64-6",
    }),
    description: buildDescription({
      cas: "1627580-64-6",
      formula: "C100H156N32O22S2",
      mw: "≈ 2174.6 g/mol",
      sequence: "Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "nad",
    name: buildName({
      designation: "β-Nicotinamide Adenine Dinucleotide (NAD+) Laboratory Reagent",
      form: "Lyophilised Powder",
      cas: "53-84-9",
    }),
    description: buildDescription({
      cas: "53-84-9",
      formula: "C21H27N7O14P2",
      mw: "663.43 g/mol",
      composition: "Oxidised form of nicotinamide adenine dinucleotide (free acid)",
      form: "Lyophilised powder, sealed glass vial",
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "pt-141",
    name: buildName({
      designation: "PT-141 Synthetic Cyclic Heptapeptide",
      form: "Lyophilised Powder",
      cas: "189691-06-3",
    }),
    description: buildDescription({
      cas: "189691-06-3",
      formula: "C50H68N14O10",
      mw: "1025.18 g/mol",
      sequence: "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-OH (cyclic 7-residue α-MSH analogue)",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "melanotan",
    name: buildName({
      designation: "Melanotan-II Synthetic Cyclic Heptapeptide",
      form: "Lyophilised Powder",
      cas: "121062-08-6",
    }),
    description: buildDescription({
      cas: "121062-08-6",
      formula: "C50H69N15O9",
      mw: "1024.18 g/mol",
      sequence: "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "glow",
    name: buildName({
      designation: "GLOW Synthetic Peptide Reference Blend (GHK-Cu / BPC-157 / TB-500)",
      form: "Lyophilised Powder",
    }),
    description: buildDescription({
      composition:
        "Lyophilised reference blend of three synthetic peptides — GHK-Cu (CAS 89030-95-5), pentadecapeptide BPC-157 (CAS 137525-51-0) and TB-500 acetate fragment (CAS 77591-33-4)",
      purity: "Each constituent ≥99% by RP-HPLC",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "klow",
    name: buildName({
      designation: "KLOW Synthetic Peptide Reference Blend (KPV / GHK-Cu / BPC-157 / TB-500)",
      form: "Lyophilised Powder",
    }),
    description: buildDescription({
      composition:
        "Lyophilised reference blend of four synthetic peptides — KPV tripeptide (CAS 67727-97-3), GHK-Cu (CAS 89030-95-5), pentadecapeptide BPC-157 (CAS 137525-51-0) and TB-500 acetate fragment (CAS 77591-33-4)",
      purity: "Each constituent ≥99% by RP-HPLC",
      form: LYO_VIAL,
    }),
    googleProductCategory: MERCHANT_GOOGLE_PRODUCT_CATEGORY,
  },
  {
    match: "bacteriostatic",
    name: buildName({
      designation: "Bacteriostatic Water 0.9% Benzyl Alcohol Diluent",
      form: "Sterile Solution",
      grade: "USP-Grade Analytical Diluent",
      cas: "7732-18-5",
    }),
    description: buildDescription({
      cas: "7732-18-5 (water) / 100-51-6 (benzyl alcohol)",
      formula: "H2O with C7H8O (0.9% w/v)",
      composition:
        "Sterile water containing 0.9% w/v benzyl alcohol as bacteriostatic preservative, supplied as a laboratory diluent for in-vitro analytical workflows",
      purity: "USP-grade analytical diluent",
      form: "Clear, colourless solution, sealed multi-dose vial",
      storage: "Store at 15–25°C, protect from light",
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
