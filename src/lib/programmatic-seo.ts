/**
 * Programmatic SEO — Phase B
 *
 * One config drives 30+ long-tail comparison pages at /compare/{slug}.
 * Each entry produces a unique <title>, meta description, H1, JSON-LD
 * Article + FAQPage, and contextual internal links back to the per-peptide
 * hub categories (/products/category/{slug}). Compliance-safe wording:
 * no medical claims, no dosage, "research compounds" only.
 *
 * To add a new programmatic page, append to PROGRAMMATIC_PAGES — the route,
 * sitemap, and internal-link surfaces pick it up automatically.
 */

export interface ProgrammaticPage {
  slug: string;            // /compare/{slug}
  left: PeptideRef;
  right: PeptideRef;
  /** 150-160 char meta description; compliance-safe. */
  metaDescription: string;
  /** 1-paragraph intro shown above the comparison table. */
  intro: string;
  /** 3-5 FAQs rendered as accordion + FAQPage JSON-LD. */
  faqs: Array<{ q: string; a: string }>;
  /** Last content update — drives sitemap <lastmod>. */
  updated: string;         // YYYY-MM-DD
}

export interface PeptideRef {
  name: string;            // "BPC-157"
  slug: string;            // "bpc-157" → /products/category/{slug}
  family: string;          // "Pentadecapeptide", "GLP-1/GIP", etc.
  // Compliance-safe research-context bullets (NOT medical claims).
  bullets: string[];
}

const PEPTIDES: Record<string, PeptideRef> = {
  "bpc-157": {
    name: "BPC-157",
    slug: "bpc-157",
    family: "Pentadecapeptide (15-aa)",
    bullets: [
      "Stable peptide widely cited in tissue-repair in-vitro studies",
      "Reconstituted in bacteriostatic water for laboratory use",
      "Common research molecular weight: ~1,419 Da",
      "Stored lyophilised at −20°C; reconstituted vials at 2–8°C",
    ],
  },
  "tb-500": {
    name: "TB-500",
    slug: "tb-500",
    family: "Thymosin Beta-4 fragment",
    bullets: [
      "Synthetic fragment of the Tβ4 protein used in in-vitro research",
      "Higher MW (~4,963 Da) than BPC-157 — different reconstitution math",
      "Studied alongside BPC-157 in comparative tissue-repair literature",
      "Lyophilised; reconstitute with bacteriostatic water",
    ],
  },
  "ghk-cu": {
    name: "GHK-Cu",
    slug: "ghk-cu",
    family: "Copper tripeptide",
    bullets: [
      "Copper-binding tripeptide used in dermatology research",
      "Distinct chemistry — copper complex rather than a chain peptide",
      "Frequently used in cosmetic-chemistry and skin-fibroblast studies",
      "Lyophilised vials; reconstitute with bacteriostatic water",
    ],
  },
  "retatrutide": {
    name: "Retatrutide",
    slug: "retatrutide",
    family: "GLP-1 / GIP / glucagon triple agonist (research)",
    bullets: [
      "Triple-agonist research peptide (GLP-1 + GIP + glucagon receptors)",
      "Novel compared with dual-agonist analogues",
      "Active research interest in metabolic-pathway literature",
      "Lyophilised; reconstituted vials kept at 2–8°C",
    ],
  },
  "tirzepatide": {
    name: "Tirzepatide",
    slug: "tirzepatide",
    family: "GLP-1 / GIP dual agonist (research)",
    bullets: [
      "Dual-agonist research peptide (GLP-1 + GIP receptors)",
      "Well-characterised in receptor-binding research papers",
      "Stocked across multiple research masses",
      "Lyophilised; reconstituted vials kept at 2–8°C",
    ],
  },
  "mots-c": {
    name: "MOTS-c",
    slug: "metabolic-signaling",
    family: "Mitochondrial-derived peptide (16-aa)",
    bullets: [
      "Encoded within mitochondrial DNA (12S rRNA region)",
      "Studied in mitochondrial-signalling and AMPK-pathway research",
      "Small peptide (~2,174 Da)",
      "Lyophilised; reconstitute with bacteriostatic water",
    ],
  },
  "nad-plus": {
    name: "NAD+",
    slug: "cellular-aging",
    family: "Coenzyme (nicotinamide adenine dinucleotide)",
    bullets: [
      "Coenzyme — not a peptide — central to redox research",
      "Used in cellular-aging and sirtuin-pathway studies",
      "Stocked across multiple research masses",
      "Lyophilised; reconstitute with sterile diluent",
    ],
  },
  "pt-141": {
    name: "PT-141",
    slug: "neurological",
    family: "Melanocortin receptor research peptide",
    bullets: [
      "Synthetic analogue of α-MSH (alpha-melanocyte-stimulating hormone)",
      "Used in melanocortin-receptor binding research",
      "Small peptide (~1,025 Da)",
      "Lyophilised; reconstitute with bacteriostatic water",
    ],
  },
  "melanotan-2": {
    name: "Melanotan-II",
    slug: "melanin",
    family: "Melanocortin agonist (research)",
    bullets: [
      "Cyclic analogue of α-MSH used in pigmentation research",
      "Frequently compared with PT-141 in melanocortin literature",
      "Lyophilised; reconstitute with bacteriostatic water",
      "Stored lyophilised at −20°C",
    ],
  },
  "kpv": {
    name: "KPV",
    slug: "tissue-repair",
    family: "Tripeptide (Lys-Pro-Val) — α-MSH C-terminal fragment",
    bullets: [
      "Three-amino-acid fragment of α-MSH used in inflammation research",
      "Very small peptide — easy reconstitution math",
      "Lyophilised vials",
      "Stored at −20°C lyophilised; 2–8°C once reconstituted",
    ],
  },
  "glow": {
    name: "GLOW Blend",
    slug: "blends",
    family: "Research blend (GHK-Cu + BPC-157 + TB-500)",
    bullets: [
      "Pre-blended research formulation combining three peptides",
      "Used in comparative blend-vs-single-agent research designs",
      "Lyophilised vial; reconstitute with bacteriostatic water",
      "Stored at −20°C lyophilised",
    ],
  },
  "klow": {
    name: "KLOW Blend",
    slug: "blends",
    family: "Research blend (KPV + GHK-Cu + BPC-157 + TB-500)",
    bullets: [
      "Four-peptide research blend extending GLOW with KPV",
      "Used in comparative research where KPV is a study variable",
      "Lyophilised vial; reconstitute with bacteriostatic water",
      "Stored at −20°C lyophilised",
    ],
  },
  "bacteriostatic-water": {
    name: "Bacteriostatic Water",
    slug: "bacteriostatic-water",
    family: "Diluent (0.9% benzyl alcohol)",
    bullets: [
      "Standard diluent for reconstituting lyophilised research peptides",
      "0.9% benzyl alcohol — inhibits bacterial growth in opened vials",
      "Not a peptide — laboratory accessory",
      "Stored at room temperature; refrigerate after opening",
    ],
  },
};

function pair(slug: string, leftKey: string, rightKey: string, opts: {
  metaDescription: string;
  intro: string;
  faqs: Array<{ q: string; a: string }>;
  updated: string;
}): ProgrammaticPage {
  return {
    slug,
    left: PEPTIDES[leftKey],
    right: PEPTIDES[rightKey],
    ...opts,
  };
}

const UPDATED = "2026-06-26";

export const PROGRAMMATIC_PAGES: ProgrammaticPage[] = [
  pair("bpc-157-vs-tb-500", "bpc-157", "tb-500", {
    metaDescription:
      "BPC-157 vs TB-500 — research-peptide comparison covering molecular weight, family, reconstitution and lab storage. UK research-use-only data.",
    intro:
      "BPC-157 and TB-500 are the two peptides most often compared in tissue-repair research literature. Both are lyophilised and reconstituted with bacteriostatic water, but they differ in size, family and typical research workflows. This page summarises the laboratory characteristics relevant when planning a research design.",
    faqs: [
      { q: "Are BPC-157 and TB-500 the same molecule?", a: "No. BPC-157 is a 15-amino-acid pentadecapeptide (~1,419 Da). TB-500 is a synthetic fragment of Thymosin Beta-4 (~4,963 Da). They are different molecules with different reconstitution math." },
      { q: "Can they be reconstituted in the same diluent?", a: "Both are typically reconstituted in bacteriostatic water for in-vitro research. Storage conditions are similar (lyophilised at −20°C, reconstituted at 2–8°C)." },
      { q: "Which is more studied in tissue-repair research?", a: "BPC-157 has a larger body of published research; TB-500 is often introduced as a comparison arm. Both appear together in comparative in-vitro studies." },
      { q: "Are they sold for human use?", a: "No. PH Labs supplies both strictly For Research Use Only. Not for Human Consumption." },
    ],
    updated: UPDATED,
  }),
  pair("retatrutide-vs-tirzepatide", "retatrutide", "tirzepatide", {
    metaDescription:
      "Retatrutide vs Tirzepatide — research peptide comparison: receptor profile, agonist class and laboratory handling. UK research use only.",
    intro:
      "Retatrutide and Tirzepatide are both incretin-family research peptides. The defining difference is the receptor profile: Tirzepatide is a dual GLP-1/GIP agonist, while Retatrutide adds a third (glucagon) receptor target. This page covers the laboratory characteristics, not therapeutic claims.",
    faqs: [
      { q: "What's the core difference in receptor profile?", a: "Tirzepatide targets two receptors (GLP-1 and GIP). Retatrutide is a triple agonist (GLP-1, GIP and glucagon)." },
      { q: "Are they both available in multiple research masses?", a: "Yes — PH Labs stocks both across multiple research masses to suit different in-vitro study designs." },
      { q: "Are they sold for human use?", a: "No. Both are supplied strictly For Research Use Only. Not for Human Consumption." },
    ],
    updated: UPDATED,
  }),
  pair("ghk-cu-vs-bpc-157", "ghk-cu", "bpc-157", {
    metaDescription:
      "GHK-Cu vs BPC-157 — copper-tripeptide vs pentadecapeptide research comparison. Reconstitution, storage and family differences explained.",
    intro:
      "GHK-Cu and BPC-157 are two of the most-cited peptides in tissue and skin research, but they belong to different families. GHK-Cu is a copper-binding tripeptide; BPC-157 is a 15-amino-acid chain. This page lays out the laboratory differences side by side.",
    faqs: [
      { q: "Is GHK-Cu a peptide or a metal complex?", a: "Both — it is a tripeptide (Gly-His-Lys) bound to a copper(II) ion. The copper is integral to its chemistry." },
      { q: "Are they reconstituted the same way?", a: "Both are lyophilised and reconstituted with bacteriostatic water for in-vitro work, though the reconstitution math differs because of molecular-weight differences." },
      { q: "Which appears more in skin-fibroblast research?", a: "GHK-Cu has a long history in dermatology and skin-fibroblast research. BPC-157 appears more in connective-tissue research." },
    ],
    updated: UPDATED,
  }),
  pair("pt-141-vs-melanotan-2", "pt-141", "melanotan-2", {
    metaDescription:
      "PT-141 vs Melanotan-II — melanocortin research peptides compared by family, structure and laboratory handling. Research use only.",
    intro:
      "PT-141 and Melanotan-II are both melanocortin-receptor research peptides derived from α-MSH. They are frequently compared in the receptor-binding literature. This page summarises the differences in family, structure and reconstitution.",
    faqs: [
      { q: "Are PT-141 and Melanotan-II related?", a: "Both are α-MSH-derived research peptides used in melanocortin-receptor studies, but they are distinct molecules with different selectivity profiles in published research." },
      { q: "Are they reconstituted the same way?", a: "Both are lyophilised and typically reconstituted in bacteriostatic water for in-vitro work." },
    ],
    updated: UPDATED,
  }),
  pair("klow-vs-glow", "klow", "glow", {
    metaDescription:
      "KLOW Blend vs GLOW Blend — pre-blended research peptide vials compared. Composition, storage and research-design context.",
    intro:
      "KLOW and GLOW are two of the most-requested research blends. GLOW combines GHK-Cu, BPC-157 and TB-500. KLOW extends this by adding KPV. This page sets out the composition difference and the research-design context.",
    faqs: [
      { q: "How do GLOW and KLOW differ?", a: "GLOW is a three-peptide blend (GHK-Cu + BPC-157 + TB-500). KLOW adds KPV as a fourth peptide." },
      { q: "Why pick a blend over single peptides?", a: "Pre-blended vials are used in research designs where the combined effect is the variable of interest. Single peptides are preferred when each agent must be controlled independently." },
    ],
    updated: UPDATED,
  }),
  pair("mots-c-vs-nad-plus", "mots-c", "nad-plus", {
    metaDescription:
      "MOTS-c vs NAD+ — mitochondrial-derived peptide vs coenzyme comparison for cellular-aging research. UK research use only.",
    intro:
      "MOTS-c and NAD+ both appear in cellular-aging and mitochondrial-signalling research, but they are different categories of molecule. MOTS-c is a mitochondrial-derived peptide; NAD+ is a coenzyme. This page sets out the difference for research planning.",
    faqs: [
      { q: "Is NAD+ a peptide?", a: "No. NAD+ (nicotinamide adenine dinucleotide) is a coenzyme, not a peptide. It is grouped with peptides here because it is widely used alongside them in cellular-aging research." },
      { q: "Are they reconstituted the same way?", a: "Both ship lyophilised and are reconstituted with sterile diluent (bacteriostatic water for MOTS-c; appropriate sterile diluent for NAD+). Match diluent to the published protocol you are following." },
    ],
    updated: UPDATED,
  }),
  pair("bpc-157-vs-ghk-cu", "bpc-157", "ghk-cu", {
    metaDescription:
      "BPC-157 vs GHK-Cu — chain peptide vs copper tripeptide research comparison. Family, MW and reconstitution differences.",
    intro:
      "BPC-157 and GHK-Cu are both popular in regenerative-research literature, but they sit in different chemical families. This page summarises the practical laboratory differences for researchers selecting between them.",
    faqs: [
      { q: "Which is smaller?", a: "GHK-Cu is a tripeptide; BPC-157 is a 15-residue pentadecapeptide. GHK-Cu is the smaller molecule." },
      { q: "Are they used in the same studies?", a: "They sometimes appear in combined research designs (see GLOW Blend), but most published work studies them independently." },
    ],
    updated: UPDATED,
  }),
  pair("tb-500-vs-ghk-cu", "tb-500", "ghk-cu", {
    metaDescription:
      "TB-500 vs GHK-Cu — Thymosin Beta-4 fragment vs copper tripeptide research peptide comparison. Reconstitution and storage.",
    intro:
      "TB-500 (a Thymosin Beta-4 fragment) and GHK-Cu (a copper tripeptide) are both studied in tissue and skin research. This page sets out the family, size and handling differences.",
    faqs: [
      { q: "Which has the higher molecular weight?", a: "TB-500 is the larger molecule (~4,963 Da) vs GHK-Cu (~340 Da as the copper complex)." },
      { q: "Are they often combined in research?", a: "Both appear in the GLOW Blend alongside BPC-157. Single-peptide vials are preferred when each agent must be controlled independently." },
    ],
    updated: UPDATED,
  }),
  pair("kpv-vs-bpc-157", "kpv", "bpc-157", {
    metaDescription:
      "KPV vs BPC-157 — tripeptide α-MSH fragment vs pentadecapeptide research comparison. Inflammation and tissue-repair research.",
    intro:
      "KPV (Lys-Pro-Val) is the C-terminal tripeptide of α-MSH and is widely cited in inflammation research. BPC-157 is a longer pentadecapeptide cited in tissue-repair research. This page compares them as laboratory reagents.",
    faqs: [
      { q: "Is KPV related to α-MSH?", a: "Yes — KPV is the C-terminal three-amino-acid fragment of α-MSH (the same parent peptide as PT-141 derives from)." },
      { q: "Are they ever combined in research?", a: "KPV appears in the KLOW Blend with BPC-157, TB-500 and GHK-Cu. Single-peptide vials are used when each agent must be controlled independently." },
    ],
    updated: UPDATED,
  }),
  pair("bpc-157-vs-kpv", "bpc-157", "kpv", {
    metaDescription:
      "BPC-157 vs KPV — research peptide comparison. Pentadecapeptide vs α-MSH C-terminal tripeptide. Family and laboratory handling.",
    intro:
      "Researchers planning inflammation or tissue-repair studies often compare BPC-157 with the smaller α-MSH-derived tripeptide KPV. This page summarises the laboratory differences.",
    faqs: [
      { q: "Which is the larger peptide?", a: "BPC-157 (15 amino acids) is much larger than KPV (3 amino acids)." },
      { q: "Are storage requirements the same?", a: "Both are stored lyophilised at −20°C and at 2–8°C after reconstitution with bacteriostatic water." },
    ],
    updated: UPDATED,
  }),
  pair("retatrutide-vs-mots-c", "retatrutide", "mots-c", {
    metaDescription:
      "Retatrutide vs MOTS-c — incretin triple agonist vs mitochondrial-derived peptide. Research-only laboratory comparison.",
    intro:
      "Retatrutide and MOTS-c both appear in metabolic-signalling research, but via very different mechanisms. Retatrutide is a receptor-level triple agonist; MOTS-c is a mitochondrial-derived peptide. This page sets out the differences.",
    faqs: [
      { q: "Are they in the same peptide family?", a: "No. Retatrutide is an incretin-family triple agonist. MOTS-c is a mitochondrial-derived peptide encoded inside mtDNA." },
      { q: "Can they be reconstituted in the same diluent?", a: "Both are lyophilised and reconstituted in bacteriostatic water for in-vitro work." },
    ],
    updated: UPDATED,
  }),
  pair("tirzepatide-vs-mots-c", "tirzepatide", "mots-c", {
    metaDescription:
      "Tirzepatide vs MOTS-c — dual incretin agonist vs mitochondrial peptide. Research peptide comparison and lab handling.",
    intro:
      "Tirzepatide and MOTS-c sit on opposite ends of the metabolic-research toolkit: Tirzepatide acts at the receptor level (GLP-1 + GIP), MOTS-c at the mitochondrial level. This page compares them for research-design planning.",
    faqs: [
      { q: "Are they comparable mechanisms?", a: "No — they act through completely different pathways. They are sometimes included as separate arms in metabolic-pathway research." },
    ],
    updated: UPDATED,
  }),
  pair("retatrutide-vs-mots-c-cellular-aging", "retatrutide", "nad-plus", {
    metaDescription:
      "Retatrutide vs NAD+ — incretin triple agonist vs coenzyme. Cellular-aging and metabolic research comparison for UK laboratories.",
    intro:
      "This page compares Retatrutide (an incretin-family triple agonist research peptide) with NAD+ (a coenzyme used in cellular-aging research). The molecules are not directly substitutable — the comparison is provided for research-design context only.",
    faqs: [
      { q: "Is NAD+ a peptide?", a: "No. NAD+ is a coenzyme, not a peptide. It appears in our catalogue because it is widely used alongside research peptides in metabolic and cellular-aging studies." },
    ],
    updated: UPDATED,
  }),
  pair("ghk-cu-vs-kpv", "ghk-cu", "kpv", {
    metaDescription:
      "GHK-Cu vs KPV — copper tripeptide vs α-MSH-derived tripeptide comparison. Skin and inflammation research peptides.",
    intro:
      "Both GHK-Cu and KPV are tripeptides, but their chemistry and research context differ. GHK-Cu binds copper and is cited in skin-fibroblast research; KPV is derived from α-MSH and cited in inflammation research.",
    faqs: [
      { q: "Are they both tripeptides?", a: "Yes — both are three-amino-acid peptides, but with completely different sequences and chemistry." },
      { q: "Do they appear together in any blend?", a: "Yes — both are present in the KLOW Blend alongside BPC-157 and TB-500." },
    ],
    updated: UPDATED,
  }),
  pair("tirzepatide-vs-glow", "tirzepatide", "glow", {
    metaDescription:
      "Tirzepatide vs GLOW Blend — single incretin research peptide vs pre-blended tissue-research vial. Research-use comparison.",
    intro:
      "This page contrasts a single-agent research peptide (Tirzepatide, a GLP-1/GIP dual agonist) with a pre-blended tissue-research vial (GLOW: GHK-Cu + BPC-157 + TB-500). The two are not interchangeable — the comparison is presented to clarify when each is appropriate in a research design.",
    faqs: [
      { q: "Why would a researcher compare them?", a: "They occupy different research niches — incretin signalling vs tissue-repair pathways. Comparing them helps clarify which study design is appropriate." },
    ],
    updated: UPDATED,
  }),
  pair("retatrutide-vs-glow", "retatrutide", "glow", {
    metaDescription:
      "Retatrutide vs GLOW Blend — incretin triple agonist vs tissue-research pre-blended vial. Research peptide comparison.",
    intro:
      "Retatrutide (a triple agonist incretin research peptide) and GLOW Blend (GHK-Cu + BPC-157 + TB-500) occupy different research niches. This page sets out the differences so researchers can select the right reagent for their study design.",
    faqs: [
      { q: "Are they in the same research category?", a: "No. Retatrutide is an incretin-pathway research peptide; GLOW is a tissue-research blend. They are not substitutes." },
    ],
    updated: UPDATED,
  }),
  pair("pt-141-vs-kpv", "pt-141", "kpv", {
    metaDescription:
      "PT-141 vs KPV — both derived from α-MSH. Melanocortin-agonist research peptide vs C-terminal tripeptide comparison.",
    intro:
      "PT-141 and KPV both trace back to α-MSH. PT-141 is a synthetic analogue used in melanocortin-receptor research; KPV is the C-terminal tripeptide cited in inflammation research. This page compares them as laboratory reagents.",
    faqs: [
      { q: "Why are both linked to α-MSH?", a: "PT-141 is a synthetic analogue of α-MSH; KPV is the C-terminal three-amino-acid fragment of the same parent peptide." },
    ],
    updated: UPDATED,
  }),
  pair("melanotan-2-vs-kpv", "melanotan-2", "kpv", {
    metaDescription:
      "Melanotan-II vs KPV — α-MSH-derived research peptide comparison. Melanocortin research vs inflammation research.",
    intro:
      "Melanotan-II and KPV are both linked to α-MSH but used in very different research contexts. Melanotan-II is studied in pigmentation research; KPV in inflammation research. This page summarises the differences.",
    faqs: [
      { q: "Are Melanotan-II and KPV interchangeable?", a: "No. They share an α-MSH ancestry but are different molecules used in different research contexts." },
    ],
    updated: UPDATED,
  }),
  pair("bpc-157-vs-bacteriostatic-water", "bpc-157", "bacteriostatic-water", {
    metaDescription:
      "BPC-157 and bacteriostatic water — research peptide and standard diluent. How they pair for in-vitro reconstitution.",
    intro:
      "BPC-157 is a lyophilised research peptide. Bacteriostatic water is the standard diluent used to reconstitute it. This page explains the pairing for laboratory researchers planning a research workflow.",
    faqs: [
      { q: "Why is bacteriostatic water used?", a: "The 0.9% benzyl alcohol inhibits bacterial growth in opened multi-use vials, which is useful for short-term in-vitro research storage." },
      { q: "Is bacteriostatic water a peptide?", a: "No — it is a sterile diluent (water + 0.9% benzyl alcohol). It is stocked as a laboratory accessory." },
    ],
    updated: UPDATED,
  }),
  pair("retatrutide-vs-tirzepatide-research-mass", "retatrutide", "tirzepatide", {
    slug: "retatrutide-vs-tirzepatide-research-mass",
    metaDescription:
      "Retatrutide vs Tirzepatide research masses — incretin research peptide variants compared. UK research-use-only catalogue.",
    intro:
      "Both Retatrutide and Tirzepatide are stocked across multiple research masses to suit different in-vitro study designs. This page summarises the variants available and the receptor-profile differences.",
    faqs: [
      { q: "Why do research masses matter?", a: "Different in-vitro protocols call for different working concentrations. Stocking multiple masses lets researchers pick the closest fit and minimise dilution error." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("ghk-cu-vs-tb-500", "ghk-cu", "tb-500", {
    metaDescription:
      "GHK-Cu vs TB-500 — copper tripeptide vs Thymosin Beta-4 fragment. Research peptide comparison for tissue and skin research.",
    intro:
      "GHK-Cu and TB-500 both appear in tissue and skin research literature. This page compares them by family, molecular weight and laboratory handling.",
    faqs: [
      { q: "Which is the larger molecule?", a: "TB-500 (~4,963 Da) is much larger than GHK-Cu (the tripeptide–copper complex)." },
    ],
    updated: UPDATED,
  }),
  pair("nad-plus-vs-mots-c", "nad-plus", "mots-c", {
    metaDescription:
      "NAD+ vs MOTS-c — coenzyme vs mitochondrial-derived peptide for cellular-aging research. UK research-use-only data.",
    intro:
      "NAD+ and MOTS-c are both used in cellular-aging and mitochondrial-pathway research, but they are different categories of molecule. This page sets out the differences.",
    faqs: [
      { q: "Are they interchangeable?", a: "No — they act through different mechanisms. NAD+ is a coenzyme; MOTS-c is a mitochondrial-derived peptide." },
    ],
    updated: UPDATED,
  }),
  pair("klow-vs-bpc-157", "klow", "bpc-157", {
    metaDescription:
      "KLOW Blend vs BPC-157 — four-peptide research blend vs single-peptide vial. When to pick each for tissue research.",
    intro:
      "KLOW is a four-peptide research blend (KPV + GHK-Cu + BPC-157 + TB-500); BPC-157 on its own is a single-peptide vial. This page explains the trade-offs of blend vs single-agent research designs.",
    faqs: [
      { q: "Why choose a blend?", a: "Blends are used when the combined effect is the variable of interest. Single peptides are used when each agent must be controlled independently." },
    ],
    updated: UPDATED,
  }),
  pair("glow-vs-bpc-157", "glow", "bpc-157", {
    metaDescription:
      "GLOW Blend vs BPC-157 — three-peptide research blend vs single-peptide vial. Comparison for tissue-research designs.",
    intro:
      "GLOW combines GHK-Cu, BPC-157 and TB-500. BPC-157 on its own is the single-peptide vial. This page sets out when each is appropriate for a research design.",
    faqs: [
      { q: "Is BPC-157 the same in GLOW as in the single-peptide vial?", a: "The peptide identity is the same; the blend simply pre-combines it with GHK-Cu and TB-500 at fixed ratios." },
    ],
    updated: UPDATED,
  }),
  pair("klow-vs-glow-blend", "klow", "glow", {
    slug: "klow-vs-glow-blend",
    metaDescription:
      "KLOW vs GLOW Blend — four-peptide vs three-peptide research blend compared. Composition difference and research context.",
    intro:
      "KLOW and GLOW differ by a single peptide: KLOW adds KPV. This page summarises the composition difference for researchers selecting between the two blends.",
    faqs: [
      { q: "What's added in KLOW vs GLOW?", a: "KPV is added in KLOW. The other three peptides (GHK-Cu, BPC-157, TB-500) are common to both." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("tirzepatide-vs-retatrutide-receptor", "tirzepatide", "retatrutide", {
    slug: "tirzepatide-vs-retatrutide-receptor",
    metaDescription:
      "Tirzepatide vs Retatrutide receptor profiles — dual vs triple incretin agonist research peptide comparison.",
    intro:
      "The headline difference between Tirzepatide and Retatrutide is the number of receptor targets. Tirzepatide is dual (GLP-1 + GIP); Retatrutide is triple (GLP-1 + GIP + glucagon). This page sets out the implications for research design.",
    faqs: [
      { q: "Why does the third receptor matter?", a: "Adding glucagon-receptor activity broadens the research surface compared with a dual agonist. The literature on the triple-agonist class is newer and actively growing." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("bpc-157-research-mass", "bpc-157", "bacteriostatic-water", {
    slug: "bpc-157-research-mass",
    metaDescription:
      "BPC-157 research mass and reconstitution guide — molecular weight, vial mass and bacteriostatic water pairing.",
    intro:
      "This page summarises the research-mass and reconstitution context for BPC-157, paired with its standard diluent (bacteriostatic water). For research use only.",
    faqs: [
      { q: "What molecular weight is used in BPC-157 research?", a: "Approximately 1,419 Da is the commonly cited research molecular weight for BPC-157." },
      { q: "Why pair this guide with bacteriostatic water?", a: "Because reconstitution is part of the workflow — bacteriostatic water is the standard diluent for BPC-157 in in-vitro research." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("tirzepatide-research-mass", "tirzepatide", "bacteriostatic-water", {
    slug: "tirzepatide-research-mass",
    metaDescription:
      "Tirzepatide research mass and reconstitution guide — multiple masses stocked, bacteriostatic water diluent pairing.",
    intro:
      "PH Labs stocks Tirzepatide across multiple research masses to suit different in-vitro study designs. This page outlines the reconstitution pairing with bacteriostatic water.",
    faqs: [
      { q: "Why are multiple masses useful?", a: "They reduce dilution error by letting researchers pick the closest fit to their working concentration." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("retatrutide-research-mass", "retatrutide", "bacteriostatic-water", {
    slug: "retatrutide-research-mass",
    metaDescription:
      "Retatrutide research mass and reconstitution guide — triple-agonist research peptide paired with bacteriostatic water.",
    intro:
      "PH Labs stocks Retatrutide across multiple research masses. This page outlines the reconstitution pairing with bacteriostatic water and the receptor-profile context.",
    faqs: [
      { q: "What is the receptor profile?", a: "Retatrutide is a triple agonist (GLP-1 + GIP + glucagon)." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("tb-500-vs-bpc-157-mass", "tb-500", "bpc-157", {
    slug: "tb-500-vs-bpc-157-mass",
    metaDescription:
      "TB-500 vs BPC-157 molecular weight comparison — reconstitution math and research-mass differences explained.",
    intro:
      "TB-500 and BPC-157 differ significantly in molecular weight, which affects reconstitution math and working concentrations. This page summarises the difference for laboratory researchers.",
    faqs: [
      { q: "What MW values are commonly cited?", a: "BPC-157 ≈ 1,419 Da; TB-500 ≈ 4,963 Da. These values feed into reconstitution calculations." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("ghk-cu-research-mass", "ghk-cu", "bacteriostatic-water", {
    slug: "ghk-cu-research-mass",
    metaDescription:
      "GHK-Cu research mass and reconstitution guide — copper tripeptide paired with bacteriostatic water diluent.",
    intro:
      "GHK-Cu is supplied lyophilised and reconstituted with bacteriostatic water for in-vitro research. This page summarises the molecule and the reconstitution pairing.",
    faqs: [
      { q: "Why is GHK-Cu bound to copper?", a: "The copper(II) ion is integral to GHK-Cu chemistry — it is a copper-binding tripeptide, not a chain peptide alone." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
  pair("mots-c-research-mass", "mots-c", "bacteriostatic-water", {
    slug: "mots-c-research-mass",
    metaDescription:
      "MOTS-c research mass and reconstitution guide — mitochondrial-derived peptide paired with bacteriostatic water.",
    intro:
      "MOTS-c is a 16-amino-acid mitochondrial-derived peptide (~2,174 Da). This page outlines the reconstitution pairing with bacteriostatic water and the research context.",
    faqs: [
      { q: "Where is MOTS-c encoded?", a: "Within mitochondrial DNA — specifically the 12S rRNA region." },
    ],
    updated: UPDATED,
  } as Omit<ProgrammaticPage, "slug"> & { slug: string }),
];

export function findProgrammaticPage(slug: string): ProgrammaticPage | undefined {
  return PROGRAMMATIC_PAGES.find((p) => p.slug === slug);
}

export function listProgrammaticSlugs(): string[] {
  return PROGRAMMATIC_PAGES.map((p) => p.slug);
}
