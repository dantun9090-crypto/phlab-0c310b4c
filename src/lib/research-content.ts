/**
 * Per-product research content — laboratory / research language ONLY.
 *
 * Strictly avoids: therapy, treatment, cure, supplement, dosage for humans,
 * clinical benefit, weight-loss / anti-aging / muscle-growth claims.
 * Uses: research compound, in-vitro model, laboratory use, research-grade,
 * analytical reference material.
 *
 * Keyed by the live Firestore product slug.
 */

export interface ResearchFAQ { q: string; a: string }
export interface ResearchRelated { slug: string; label: string; relationship: string }

export interface ResearchContent {
  overview: string;            // ~200 words — identity, discovery, in-vitro MoA
  applications: string;        // ~150 words — assays, concentrations, cell lines
  prepStorage: string;         // ~100 words — reconstitution, storage, shelf life
  qualityVerification: string; // ~80 words — HPLC, MS, CoA, sterility
  faqs: ResearchFAQ[];         // 8 research-context questions
  related: ResearchRelated[];  // 4 related compounds
}

export const RESEARCH_CONTENT: Record<string, ResearchContent> = {

  // ─────────── 1. Retatrutide ───────────
  "retatrutide-research-peptide": {
    overview: `Retatrutide (LY3437943) is a 39-residue synthetic acylated peptide engineered as a balanced triple agonist at the GIP, GLP-1, and glucagon receptors. Molecular formula C221H343N51O63, monoisotopic mass ≈ 4731 Da; CAS 2381089-83-2. Disclosed by Eli Lilly research (Coskun et al., Nat Metab, 2022), it incorporates a C20 fatty diacid moiety at Lys17 enabling non-covalent albumin association, which extends in-vivo half-life in rodent models. In-vitro pharmacology in CHO-K1 cell lines stably transfected with human GIPR, GLP-1R, and GCGR demonstrates concentration-dependent cAMP accumulation with EC50 values in the picomolar-to-low-nanomolar range across all three receptors (Urva et al., 2022). Within laboratory models retatrutide serves as a reference triagonist for receptor-pharmacology assays, β-arrestin recruitment (PathHunter platforms), and comparative incretin-signalling work alongside dual-agonist and mono-agonist references. The retained glucagon-receptor component differentiates it from tirzepatide in mechanistic in-vitro experiments probing hepatic lipid-metabolism endpoints in HepG2 and primary hepatocyte cultures.`,
    applications: `Used in receptor-pharmacology research: cAMP accumulation assays in HEK293 and CHO-K1 lines stably expressing human GIPR, GLP-1R, or GCGR; β-arrestin-2 recruitment via DiscoverX PathHunter; and competition binding against [125I]-GLP-1 in transfected membranes. Typical in-vitro concentrations span 1 pM–100 nM for dose-response curves. Mitochondrial-respiration studies in primary hepatocytes and INS-1 832/13 β-cell lines explore receptor-pathway crosstalk. Synergistic-compound research pairs retatrutide with tirzepatide and semaglutide as reference dual- and mono-agonists to deconvolute receptor contributions. Selective antagonists — Ex-9(39), GIP(3-30)NH2, des-His1-[Glu9]-glucagon(1-29) — isolate individual receptor signals in the same assay panels.`,
    prepStorage: `Supplied as a lyophilised white powder in a sealed vial under inert atmosphere. Reconstitute aseptically with bacteriostatic water (0.9% benzyl alcohol) or sterile sodium acetate buffer (pH 4.0) to a working stock (typical 1 mg/mL). Equilibrate the vial to room temperature before opening to prevent moisture condensation. Reconstituted solutions are stable up to 28 days at 2–8 °C; for long-term storage prepare single-use aliquots at −20 °C or below. Limit freeze-thaw cycles to three. Handle with nitrile gloves and lab coat — analytical reference material for in-vitro research use only.`,
    qualityVerification: `Each batch is characterised by reverse-phase HPLC (C18, 0.1% TFA / acetonitrile gradient) with a release specification of ≥99.0% peak-area purity at 220 nm. Identity is confirmed by ESI mass spectrometry against the theoretical monoisotopic mass. Counter-ion (TFA), residual solvents, and water content (Karl Fischer) are recorded per lot. A batch-specific Certificate of Analysis ships with each unit and includes endotoxin (LAL) and bioburden screening.`,
    faqs: [
      { q: "What chemical identifier corresponds to retatrutide?", a: "LY3437943; CAS 2381089-83-2. Molecular formula C221H343N51O63, monoisotopic mass ≈ 4731 Da." },
      { q: "What HPLC purity specification applies to this lot?", a: "Release specification is ≥99.0% by RP-HPLC peak area at 220 nm; the batch CoA reports the as-tested value." },
      { q: "Which in-vitro receptor systems use retatrutide?", a: "CHO-K1 and HEK293 cells stably expressing human GIPR, GLP-1R, or GCGR are standard for cAMP and β-arrestin recruitment research." },
      { q: "What reconstitution diluent is recommended?", a: "Bacteriostatic water (0.9% benzyl alcohol) or sterile sodium acetate buffer at pH 4.0." },
      { q: "How should reconstituted retatrutide be stored?", a: "Aliquot into single-use volumes at −20 °C or below; avoid more than three freeze-thaw cycles." },
      { q: "What is the documented shelf life of the lyophilised compound?", a: "24 months at −20 °C under nitrogen headspace in the sealed original vial." },
      { q: "Which selective antagonists are used alongside retatrutide?", a: "Ex-9(39) for GLP-1R, GIP(3-30)NH2 for GIPR, and des-His1-[Glu9]-glucagon(1-29) for GCGR." },
      { q: "What sterility documentation is provided?", a: "Each CoA includes endotoxin (LAL) and bioburden results for laboratory-handling assessment." },
    ],
    related: [
      { slug: "tirzepatide-research-peptide", label: "Tirzepatide", relationship: "Dual GIP/GLP-1 reference for isolating the glucagon-receptor contribution." },
      { slug: "mots-c-research-peptide", label: "MOTS-c", relationship: "Mitochondrial-derived peptide used in adjacent metabolic-pathway research." },
      { slug: "nad-research-compound", label: "NAD+", relationship: "Coenzyme reagent for mitochondrial-respiration assays." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Recommended diluent for in-vitro reconstitution." },
    ],
  },

  // ─────────── 2. Tirzepatide ───────────
  "tirzepatide-research-peptide": {
    overview: `Tirzepatide (LY3298176) is a 39-amino-acid synthetic acylated peptide acting as a dual agonist at the GIP and GLP-1 receptors. Molecular formula C225H348N48O68, monoisotopic mass ≈ 4813 Da; CAS 2023788-19-2. First reported by Coskun et al. (Mol Metab, 2018), it was engineered from a GIP backbone with a γ-Glu-C20 diacid pendant at Lys20 conferring albumin association. In-vitro pharmacology in HEK293 cells expressing human GLP-1R reports cAMP EC50 ≈ 0.93 nM; at human GIPR, EC50 ≈ 0.30 nM. Tirzepatide exhibits biased agonism at GLP-1R with reduced β-arrestin recruitment relative to native GLP-1 (Willard et al., JCI Insight, 2020) — a property that has driven laboratory research into signalling-pathway compartmentalisation. The compound serves as a reference dual agonist alongside selective GIP and GLP-1 mono-agonists and triagonists such as retatrutide. Research applications cover β-cell line work (INS-1 832/13, MIN6), primary rodent islet preparations, and adipocyte-differentiation studies in 3T3-L1 cultures.`,
    applications: `Receptor-pharmacology research includes cAMP accumulation in CHO/HEK293 lines transfected with human GIPR and GLP-1R, β-arrestin recruitment (PathHunter, Tango), and receptor-internalisation imaging using SNAP-tag GLP-1R constructs. Typical in-vitro concentrations: 0.01–100 nM. β-cell line work (INS-1 832/13, MIN6) and isolated rodent islets measure glucose-stimulated insulin secretion in response to tirzepatide. Adipocyte and hepatocyte cultures (3T3-L1, HepG2, primary hepatocytes) examine downstream metabolic-pathway markers. Synergistic-compound research pairs tirzepatide with selective GIP mono-agonists, GLP-1 analogues, and antagonists Ex-9(39) and GIP(3-30)NH2 to deconvolute pathway contributions.`,
    prepStorage: `Supplied as a sterile-filtered lyophilised powder in a sealed vial. Reconstitute aseptically with bacteriostatic water or sterile PBS to the working stock (commonly 1–5 mg/mL). Equilibrate to room temperature before opening. Reconstituted solutions are stable up to 28 days at 2–8 °C; for longer storage prepare single-use aliquots and freeze at −20 °C or below. Limit freeze-thaw cycles to three. Lyophilised material is stable for 24 months at −20 °C under nitrogen. Handle with nitrile gloves in a controlled laboratory environment — not for human or veterinary use.`,
    qualityVerification: `Released against ≥99.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm). Identity is confirmed by ESI-MS against the theoretical monoisotopic mass. Each batch CoA records purity, mass match, water content (Karl Fischer), residual solvents, counter-ion (TFA) content, endotoxin (LAL), and bioburden. Lot numbers are tracked from raw-material receipt through fill-finish for full laboratory traceability.`,
    faqs: [
      { q: "What is the molecular formula and mass of tirzepatide?", a: "C225H348N48O68; monoisotopic mass ≈ 4813 Da. CAS 2023788-19-2." },
      { q: "What HPLC purity does the lot meet?", a: "≥99.0% by RP-HPLC at 220 nm; the supplied CoA reports the as-tested value." },
      { q: "What in-vitro EC50 has been reported at the GLP-1R?", a: "Approximately 0.93 nM for cAMP accumulation in HEK293-GLP-1R cells (Willard et al., 2020)." },
      { q: "Which selective antagonists are used in companion assays?", a: "Ex-9(39) for GLP-1R and GIP(3-30)NH2 for GIPR are standard tools in pathway-deconvolution studies." },
      { q: "What reconstitution diluent is recommended?", a: "Bacteriostatic water or sterile PBS, prepared aseptically; dilution depends on the assay stock concentration." },
      { q: "What is the storage stability of lyophilised tirzepatide?", a: "24 months at −20 °C under inert atmosphere in the sealed original vial." },
      { q: "How many freeze-thaw cycles can the reconstituted stock tolerate?", a: "Best practice limits aliquots to three freeze-thaw cycles before HPLC-detectable degradation." },
      { q: "What sterility data accompanies the lot?", a: "Each CoA reports endotoxin (LAL) and bioburden results for laboratory-handling assessment." },
    ],
    related: [
      { slug: "retatrutide-research-peptide", label: "Retatrutide", relationship: "Triple GIP/GLP-1/glucagon agonist for triagonist vs. dual-agonist comparisons." },
      { slug: "mots-c-research-peptide", label: "MOTS-c", relationship: "Mitochondrial peptide used in adjacent metabolic-pathway research." },
      { slug: "nad-research-compound", label: "NAD+", relationship: "Coenzyme reagent for mitochondrial-respiration assays." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Recommended diluent for in-vitro reconstitution." },
    ],
  },

  // ─────────── 3. BPC-157 ───────────
  "bpc-157": {
    overview: `BPC-157 (Body Protection Compound-157) is a synthetic 15-residue peptide, Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val, derived from a partial sequence of human gastric-juice protein BPC. Molecular formula C62H98N16O22, monoisotopic mass ≈ 1419.5 Da; CAS 137525-51-0. Characterised in tissue-repair research by Sikiric and colleagues since the early 1990s (Curr Pharm Des, 2013), the peptide has been studied across multiple in-vitro and rodent models of musculoskeletal, gastric-epithelial, and vascular biology. Reported in-vitro mechanisms include upregulation of vascular endothelial growth factor receptor-2 (VEGFR2) in endothelial cultures (Hsieh et al., 2017), modulation of the FAK–paxillin axis in fibroblasts (Chang et al., J Appl Physiol, 2011), and influence on nitric-oxide-pathway markers in epithelial systems. Activity at concentrations in the 1–10 µg/mL range has been documented in scratch-closure and tube-formation assays. In laboratory research BPC-157 functions as a reference pentadecapeptide for angiogenesis, tendon-fibroblast migration, and gastro-epithelial in-vitro models.`,
    applications: `Used in tissue-repair-focused research: scratch-closure assays in HUVEC and primary tendon-fibroblast cultures, Matrigel tube-formation studies of in-vitro angiogenesis, and collagen-synthesis quantification (Sirius Red, hydroxyproline) in dermal fibroblast monolayers. Typical in-vitro concentrations are 1 ng/mL–10 µg/mL. Common cell-line models include HUVEC, NIH/3T3, primary rat tendon fibroblasts, and AGS gastric-epithelial cultures. Synergistic-compound research pairs BPC-157 with TB-500 to compare actin-sequestering versus VEGFR2-modulating mechanisms in parallel migration assays, and with GHK-Cu in matrix-remodelling endpoints (MMP-1, TIMP-1, collagen-I qPCR).`,
    prepStorage: `Supplied as a lyophilised powder in a sealed glass vial. Reconstitute aseptically with bacteriostatic water (0.9% benzyl alcohol) to a working stock of 1 mg/mL. Bring the vial to room temperature before opening to prevent moisture ingress. Reconstituted solutions are stable up to 30 days at 2–8 °C; for longer storage prepare single-use aliquots at −20 °C. Avoid repeated freeze-thaw cycles. Lyophilised powder is stable 24 months at −20 °C in the sealed original vial. Handle with standard PPE — research use only, not for human or veterinary administration.`,
    qualityVerification: `Released against ≥99.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm). Identity confirmed by ESI-MS against the calculated monoisotopic mass of 1419.5 Da. Each batch CoA reports purity, mass match, water content (Karl Fischer), residual solvents, counter-ion (TFA), endotoxin (LAL), and bioburden. Lots are tracked from synthesis through fill-finish.`,
    faqs: [
      { q: "What is the amino-acid sequence of BPC-157?", a: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val (15 residues)." },
      { q: "What CAS number is associated with BPC-157?", a: "137525-51-0; molecular formula C62H98N16O22, monoisotopic mass ≈ 1419.5 Da." },
      { q: "What HPLC purity is released per batch?", a: "≥99.0% by RP-HPLC at 220 nm; lot-specific value on the CoA." },
      { q: "Which in-vitro assays use BPC-157 as a reference?", a: "Scratch-closure assays in HUVEC and tendon fibroblasts and Matrigel tube-formation studies for angiogenesis research." },
      { q: "What concentration range is typical for in-vitro work?", a: "1 ng/mL to 10 µg/mL for dose-response curves in fibroblast migration and tube-formation assays." },
      { q: "Which related compounds are paired with BPC-157 in research?", a: "TB-500 for parallel cell-migration work and GHK-Cu for matrix-remodelling endpoints." },
      { q: "How long does reconstituted BPC-157 remain stable?", a: "Up to 30 days at 2–8 °C; longer storage as single-use −20 °C aliquots." },
      { q: "What handling precautions apply?", a: "Standard laboratory PPE (nitrile gloves, lab coat, eye protection); aseptic technique during reconstitution; for in-vitro research use only." },
    ],
    related: [
      { slug: "tb-500-thymosin-beta-4", label: "TB-500", relationship: "Thymosin Beta-4 fragment for parallel cell-migration / actin-dynamics assays." },
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Copper-binding tripeptide for matrix-remodelling endpoint comparison." },
      { slug: "kpv-research-peptide", label: "KPV", relationship: "α-MSH tripeptide used in adjacent inflammation in-vitro work." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Recommended diluent for reconstitution." },
    ],
  },
};
