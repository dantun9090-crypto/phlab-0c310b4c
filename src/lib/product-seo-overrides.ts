/**
 * High-value per-slug SEO overrides for product pages.
 *
 * Driven by Semrush keyword analysis (UK database): hand-tuned titles
 * (≤60) and descriptions (≤160) leading with the target keyword + "UK"
 * + brand. Compliance: research-only language. No medical, dosage,
 * weight-loss, cosmetic, or human-use claims.
 */
export interface ProductSeoOverride {
  title: string;       // ≤60 chars
  description: string; // ≤160 chars
  /** Common misspellings / alternate spellings — added to meta keywords
   *  and rendered as a subtle "Also known as" line for organic capture.
   *  Sourced from Semrush UK organic rankings (low-competition long tail). */
  misspellings?: string[];
  /** Keyword-targeted FAQs prepended to the generic FAQ block + JSON-LD.
   *  Use to capture striking-distance long-tail queries (e.g. "retatrutide uk buy"). */
  faqs?: { q: string; a: string }[];
}

export const PRODUCT_SEO_OVERRIDES: Record<string, ProductSeoOverride> = {
  // "retatrutide uk" 22,200/mo · KD 30 · currently #70 — primary target
  "retatrutide-research-peptide": {
    title: "Retatrutide UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "Retatrutide UK research peptide. HPLC-verified ≥99% purity, batch CoA included. For laboratory research only — not for human consumption.",
    // Semrush UK: ~1,300/mo combined misspell volume, near-zero competition
    misspellings: [
      "retatrtide",
      "retatrutife",
      "retatrudtide",
      "retatrutidw",
      "retatide",
      "reta peptide",
    ],
    // Targeting 22,200/mo "retatrutide uk" + 1,600/mo "retatrutide uk buy"
    // + 320/mo "retatrutide uk source" + 260/mo "reta peptide uk"
    faqs: [
      {
        q: "Where can I buy Retatrutide UK research peptide from a verified source?",
        a: "PH Labs is a UK-based research compound supplier shipping Retatrutide directly from our facility. Every Retatrutide UK order ships with the batch-matched HPLC Certificate of Analysis (CoA) verifying ≥99% purity. Orders are dispatched within 1 business day via tracked UK courier. For laboratory research use only — not for human consumption.",
      },
      {
        q: "What concentrations of Retatrutide does PH Labs supply in the UK?",
        a: "PH Labs supplies Retatrutide UK in two research-grade lyophilised concentrations — 10 mg and 20 mg vials. Both are produced from the same HPLC-verified lot and shipped sealed with batch CoA documentation, packaged for temperature-stable UK courier transit. Custom institutional quantities available on request.",
      },
      {
        q: "How is Retatrutide UK purity verified and what does the CoA show?",
        a: "Each Retatrutide batch is tested by reverse-phase HPLC and confirmed by mass spectrometry, with the resulting Certificate of Analysis showing ≥99% purity, peptide content, water content, acetate content, and identity confirmation. The CoA is batch-matched to the vial you receive and is available on the product page or by request.",
      },
      {
        q: "Is Retatrutide legal to buy in the UK for laboratory research?",
        a: "Yes. Retatrutide is legally sold in the United Kingdom as a research chemical (analytical reference standard) for in-vitro laboratory use. It is not a controlled substance under the Misuse of Drugs Act in Great Britain. It is not a licensed medicine and must not be sold for, or used in, human consumption, supplementation, or veterinary treatment.",
      },
      {
        q: "How should Retatrutide be stored after delivery?",
        a: "Lyophilised Retatrutide should be stored sealed at −20°C in a dry, light-protected environment. Once reconstituted with bacteriostatic water for laboratory work, store the working solution refrigerated at 2–8°C and minimise freeze-thaw cycles. Handle exclusively under laboratory conditions in line with standard COSHH guidance.",
      },
      {
        q: "How does Retatrutide differ from Tirzepatide as a research reference?",
        a: "Retatrutide (LY3437943) is a balanced triple agonist at the GIP, GLP-1, and glucagon receptors, whereas Tirzepatide (LY3298176) is a dual GIP/GLP-1 agonist with no glucagon-receptor activity. In comparative in-vitro receptor-pharmacology assays, Retatrutide enables researchers to isolate the glucagon-receptor contribution that Tirzepatide lacks — for example in hepatocyte-lipid-metabolism experiments. Both are supplied by PH Labs as ≥99% HPLC-verified analytical reference standards with batch CoA for in-vitro research only.",
      },
      {
        q: "Is Retatrutide 10 mg available for UK research orders?",
        a: "Yes. PH Labs supplies Retatrutide UK in 10 mg lyophilised vials as well as 20 mg. Both share the same HPLC-verified batch and ship with the matched Certificate of Analysis. Orders are dispatched within one business day via tracked UK courier. Supplied as analytical reference material for in-vitro laboratory use only — not for human consumption.",
      },
      {
        q: "How is Retatrutide shipped within the UK and is packaging discreet?",
        a: "Retatrutide UK orders are dispatched within one business day in temperature-stable, plain outer packaging via tracked UK courier — typically delivered next business day. Vials ship sealed under inert headspace with the batch-matched HPLC CoA enclosed. Free UK shipping is included on orders over £50. Supplied to laboratory and research customers only.",
      },
    ],
  },



  // "tirzepatide peptides uk" 210/mo currently #37
  // Semrush UK typo cluster: ~600/mo combined, near-zero competition
  "tirzepatide-research-peptide": {
    title: "Tirzepatide UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "Tirzepatide UK research peptide. HPLC-verified ≥99% purity, batch CoA included. For laboratory research only — not for human consumption.",
    misspellings: [
      "tirzepetide",
      "tirzepatid",
      "tirzepatyde",
      "tirzeptide",
      "tirzapatide",
      "terzepatide",
      "tirz peptide",
    ],
    faqs: [
      {
        q: "Where can I buy Tirzepatide UK research peptide with a verified CoA?",
        a: "PH Labs supplies Tirzepatide UK direct from our laboratory facility. Every Tirzepatide order includes the batch-matched HPLC Certificate of Analysis confirming ≥99% purity. Dispatched within 1 business day via tracked UK courier. Supplied as an analytical reference standard for in-vitro research only — not for human consumption.",
      },
      {
        q: "What concentrations of Tirzepatide does PH Labs offer in the UK?",
        a: "Tirzepatide UK is available from PH Labs in four research-grade concentrations to support flexible laboratory protocols. All variants ship as lyophilised powder in sealed vials with full batch documentation. Custom institutional quantities available on request.",
      },
      {
        q: "How is Tirzepatide purity verified by PH Labs?",
        a: "Each Tirzepatide UK batch is tested by reverse-phase HPLC and confirmed by mass spectrometry to ≥99% purity. The Certificate of Analysis covers identity, peptide content, water content, and acetate content, batch-matched to your vial.",
      },
    ],
  },

  // "bpc 157 uk" 2,900/mo · KD 13 — easy win
  // Semrush UK typo cluster: ~450/mo combined
  "bpc-157": {
    title: "BPC-157 UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "BPC-157 UK research peptide. HPLC-tested ≥99% purity, batch Certificate of Analysis. For laboratory research only — not for human consumption.",
    misspellings: [
      "bpc157",
      "bpc 157",
      "bcp-157",
      "bpc-175",
      "bpc peptide",
      "pbc-157",
    ],
    faqs: [
      {
        q: "Where can I buy BPC-157 UK research peptide from a verified lab?",
        a: "PH Labs ships BPC-157 UK direct from our facility with the batch-matched HPLC Certificate of Analysis included on every order. ≥99% purity verified by reverse-phase HPLC and mass spectrometry. Dispatched within 1 business day by tracked UK courier. For in-vitro laboratory research only — not for human consumption.",
      },
      {
        q: "Is BPC-157 legal to buy in the UK for research?",
        a: "Yes. BPC-157 is legally sold in the UK as a research chemical (analytical reference standard) for in-vitro laboratory use. It is not a controlled substance under the Misuse of Drugs Act in Great Britain and is not a licensed medicine. It must not be used for human consumption or veterinary treatment.",
      },
      {
        q: "How should BPC-157 be stored after delivery?",
        a: "Lyophilised BPC-157 should be stored sealed at −20°C, light-protected and dry. Once reconstituted with bacteriostatic water for laboratory work, store the working solution refrigerated at 2–8°C and avoid repeated freeze-thaw cycles.",
      },
    ],
  },

  // "tb 500 uk" 2,400/mo · KD 38 + "tb labs" 110/mo currently #23
  // Semrush UK typo cluster: ~6k/mo combined (tb500 4.4k, tb500 peptide 1.3k)
  "tb-500-thymosin-beta-4": {
    title: "TB-500 UK — Thymosin β-4 Research Peptide | PH Labs",
    description:
      "TB-500 (Thymosin β-4 fragment) UK research peptide. HPLC ≥99% purity, batch CoA. For laboratory research only — not for human consumption.",
    misspellings: [
      "tb500",
      "tb 500",
      "tb500 peptide",
      "thymosin beta 4",
      "thymosin b4",
      "tb-500 peptide",
      "tb labs",
    ],
    faqs: [
      {
        q: "Where can I buy TB-500 UK from a verified research lab (TB Labs)?",
        a: "PH Labs (also searched as TB Labs) supplies TB-500 — the Thymosin β-4 fragment — direct from our UK facility. Every TB-500 UK order ships with the batch-matched HPLC Certificate of Analysis confirming ≥99% purity. Dispatched within 1 business day by tracked UK courier. For in-vitro laboratory research only — not for human consumption.",
      },
      {
        q: "What is the difference between TB-500 and Thymosin β-4?",
        a: "TB-500 is the synthetic active fragment of the naturally occurring Thymosin β-4 protein, used as an analytical reference standard in laboratory research. PH Labs TB-500 is manufactured to ≥99% purity verified by HPLC and mass spectrometry, with a batch-matched CoA included.",
      },
      {
        q: "How is PH Labs TB-500 UK purity verified?",
        a: "Each TB-500 batch is tested by reverse-phase HPLC and confirmed by mass spectrometry. The Certificate of Analysis documents identity, peptide content, water content, and acetate content — batch-matched to the vial you receive.",
      },
    ],
  },

  // "bacteriostatic water uk" 170/mo · KD 3 — very easy win
  "bacteriostatic-water-research-compound": {
    title: "Bacteriostatic Water UK — Lab Diluent 0.9% BA | PH Labs",
    description:
      "Bacteriostatic water (0.9% benzyl alcohol) UK — sterile laboratory diluent for in-vitro reconstitution. For research use only — not for human consumption.",
  },

  // "ghk-cu uk" 90/mo · KD 11 — easy win
  // Semrush UK typo cluster: ~7k/mo combined (ghkcu 5.4k, ghk 1.6k), near-zero competition
  "ghk-cu-research-peptide": {
    title: "GHK-Cu UK — Copper Tripeptide Research | PH Labs",
    description:
      "GHK-Cu (copper tripeptide) UK research reagent. HPLC ≥99% purity, batch CoA included. For laboratory research only — not for human consumption.",
    misspellings: [
      "ghkcu",
      "ghk",
      "gkh-cu",
      "ghk cu",
      "copper tripeptide",
      "copper peptide",
      "ghk peptide",
      "hk-cu",
    ],
  },

  // "klow blend peptide" 170/mo · currently #57
  "klow-blend": {
    title: "KLOW Blend UK — Research Peptide Mix | PH Labs",
    description:
      "KLOW research peptide blend UK. HPLC-verified components with batch CoA. For laboratory research only — not for human consumption.",
  },

  "glow-blend": {
    title: "GLOW Blend UK — Research Peptide Mix | PH Labs",
    description:
      "GLOW research peptide blend UK. HPLC-verified components with batch CoA. For laboratory research only — not for human consumption.",
  },

  // "mots c peptide uk" 110/mo · KD 48
  // Semrush UK typo cluster: ~3k/mo combined (mots-c 3.6k, mots c 1.3k, mot c 880)
  "mots-c-research-peptide": {
    title: "MOTS-c UK — Mitochondrial Research Peptide | PH Labs",
    description:
      "MOTS-c UK research peptide. HPLC ≥99% purity, batch CoA included. For in-vitro laboratory research only — not for human consumption.",
    misspellings: [
      "mots c",
      "mots-c",
      "mot c",
      "mot-c",
      "motc",
      "motsc",
      "mot-c peptide",
    ],
  },

  // "kpv peptide uk" 90/mo · KD 12 — very easy win
  // Semrush UK typo cluster: ~1.3k/mo combined (kpv 720, k.p.v 320, k p v 110)
  "kpv-research-peptide": {
    title: "KPV Tripeptide UK — Research Peptide | PH Labs",
    description:
      "KPV tripeptide UK research reagent. HPLC ≥99% purity, batch CoA included. For laboratory research only — not for human consumption.",
    misspellings: [
      "kpv",
      "k.p.v",
      "k p v",
      "kpv peptide",
    ],
  },

  // "pt 141 uk" 210/mo · KD 53
  // Semrush UK typo cluster: ~2.6k/mo combined (pt141 1.3k, pt 141 peptide 1k)
  "pt-141-research-peptide": {
    title: "PT-141 UK — Bremelanotide Research Peptide | PH Labs",
    description:
      "PT-141 (bremelanotide) UK research peptide. HPLC ≥99% purity, batch CoA. For laboratory research only — not for human consumption.",
    misspellings: [
      "pt141",
      "pt 141",
      "pt-141 peptide",
      "pt141 peptide",
      "bremelanotide",
      "pt 141 uk",
    ],
  },

  // "melanotan 2" 4,400/mo · KD 63
  // Semrush UK typo cluster: ~6.5k/mo combined (mt2 3.6k, melanotan 2.9k)
  "melanotan-2-research-peptide": {
    title: "Melanotan-II UK — Research Peptide, HPLC + CoA | PH Labs",
    description:
      "Melanotan-II UK research peptide. HPLC ≥99% purity, batch CoA included. For laboratory research only — not for human consumption.",
    misspellings: [
      "melanotan",
      "melanotan 2",
      "mt2",
      "melanatan",
      "melanton",
      "melanotan ii",
    ],
  },

  // "nad+ uk" / "nad plus uk" — Semrush UK: ~2.4k/mo combined, near-zero competition
  "nad-research-compound": {
    title: "NAD+ UK — Research Compound, HPLC + CoA | PH Labs",
    description:
      "NAD+ (nicotinamide adenine dinucleotide) UK research reagent. HPLC-verified, batch CoA. For laboratory research only — not for human consumption.",
    misspellings: [
      "nad",
      "nad plus",
      "nadplus",
      "nadd",
      "naad",
      "nicotinamide adenine dinucleotide",
      "n-ad",
      "nad +",
    ],
  },
};
