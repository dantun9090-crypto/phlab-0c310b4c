/**
 * High-value per-slug SEO overrides for product pages.
 *
 * Driven by Semrush keyword analysis (UK database): we override the
 * Firestore-managed `seoTitle` / `seoDescription` for slugs targeting
 * high-volume UK queries so the head() tags lead with the target
 * keyword + "UK" + brand within the 60/160 char limits.
 *
 * Compliance: research-only language. No medical, dosage, weight-loss,
 * cosmetic, or human-use claims.
 */
export interface ProductSeoOverride {
  /** ≤60 chars — keep target keyword + "UK" + "PH Labs" in front. */
  title: string;
  /** ≤160 chars — research-use framing, HPLC + CoA trust signals. */
  description: string;
}

export const PRODUCT_SEO_OVERRIDES: Record<string, ProductSeoOverride> = {
  // Primary target: "retatrutide uk" 22,200/mo · KD 30 · currently #70
  // Captures: retatrutide uk, buy retatrutide uk, retatrutide research peptide
  "retatrutide-research-peptide": {
    title: "Retatrutide UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "Buy Retatrutide in the UK as a lyophilised research peptide. HPLC-verified ≥99% purity, batch CoA included. For laboratory research use only — not for human consumption.",
  },

  // "tirzepatide peptides uk" 210/mo currently #37; "tirzepatide uk" 8,100/mo KD 59
  "tirzepatide-research-peptide": {
    title: "Tirzepatide UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "Buy Tirzepatide in the UK as a lyophilised research peptide. HPLC-verified ≥99% purity, batch CoA included. Strictly for in-vitro laboratory research — not for human consumption.",
  },

  // "bpc 157 uk" 2,900/mo · KD 13 — easy win
  "bpc-157": {
    title: "BPC-157 UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "Buy BPC-157 in the UK as a lyophilised research peptide. HPLC-tested ≥99% purity with a batch Certificate of Analysis. For laboratory research use only — not for human consumption.",
  },

  // "tb labs" 110/mo currently #23; "tb 500 uk" 90/mo · KD 10
  "tb-500-thymosin-beta-4": {
    title: "TB-500 UK — Thymosin β-4 Research Peptide | PH Labs",
    description:
      "Buy TB-500 (Thymosin β-4 fragment) in the UK as a research peptide. HPLC-verified ≥99% purity, batch CoA included. For laboratory research use only — not for human consumption.",
  },

  // "buy bacteriostatic water" 110/mo currently #59; "bacteriostatic water uk" 170/mo · KD 3
  "bacteriostatic-water-research-compound": {
    title: "Bacteriostatic Water UK — Lab Diluent 0.9% BA | PH Labs",
    description:
      "Bacteriostatic water (0.9% benzyl alcohol) in the UK as a sterile laboratory diluent for in-vitro reconstitution. CoA available. For research use only — not for human consumption.",
  },

  // "ghk-cu uk" 90/mo · KD 11 — easy win
  "ghk-cu-research-peptide": {
    title: "GHK-Cu UK — Copper Tripeptide Research | PH Labs",
    description:
      "Buy GHK-Cu (copper tripeptide) in the UK as a lyophilised research reagent. HPLC-verified ≥99% purity, batch CoA included. For laboratory research only — not for human consumption.",
  },

  // "klow blend peptide" 170/mo · currently #57
  "klow-blend": {
    title: "KLOW Blend UK — Research Peptide Mix | PH Labs",
    description:
      "Buy KLOW research peptide blend in the UK. HPLC-verified components with a batch Certificate of Analysis. For laboratory research use only — not for human consumption.",
  },

  // "glow blend" — companion product
  "glow-blend": {
    title: "GLOW Blend UK — Research Peptide Mix | PH Labs",
    description:
      "Buy GLOW research peptide blend in the UK. HPLC-verified components with a batch Certificate of Analysis. For laboratory research use only — not for human consumption.",
  },

  // MOTS-c
  "mots-c-research-peptide": {
    title: "MOTS-c UK — Mitochondrial Research Peptide | PH Labs",
    description:
      "Buy MOTS-c in the UK as a lyophilised research peptide. HPLC-verified ≥99% purity, batch CoA included. For in-vitro laboratory research only — not for human consumption.",
  },

  // KPV
  "kpv-research-peptide": {
    title: "KPV Tripeptide UK — Research Peptide | PH Labs",
    description:
      "Buy KPV tripeptide in the UK as a lyophilised research reagent. HPLC-verified ≥99% purity, batch CoA included. For laboratory research use only — not for human consumption.",
  },

  // PT-141
  "pt-141-research-peptide": {
    title: "PT-141 UK — Bremelanotide Research Peptide | PH Labs",
    description:
      "Buy PT-141 (bremelanotide) in the UK as a lyophilised research peptide. HPLC-verified ≥99% purity, batch CoA included. For laboratory research only — not for human consumption.",
  },

  // Melanotan-II
  "melanotan-2-research-peptide": {
    title: "Melanotan-II UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "Buy Melanotan-II in the UK as a lyophilised research peptide. HPLC-verified ≥99% purity, batch CoA included. For laboratory research use only — not for human consumption.",
  },

  // NAD+
  "nad-research-compound": {
    title: "NAD+ UK — Research Compound, HPLC + CoA | PH Labs",
    description:
      "Buy NAD+ (nicotinamide adenine dinucleotide) in the UK as a lyophilised research reagent. HPLC-verified, batch CoA included. For laboratory research only — not for human consumption.",
  },
};
