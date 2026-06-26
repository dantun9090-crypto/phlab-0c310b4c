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

export interface ResearchReference { citation: string; doi?: string }

export interface ResearchContent {
  overview: string;            // ~200 words — identity, discovery, in-vitro MoA
  applications: string;        // ~150 words — assays, concentrations, cell lines
  prepStorage: string;         // ~100 words — reconstitution, storage, shelf life
  qualityVerification: string; // ~80 words — HPLC, MS, CoA, sterility
  faqs: ResearchFAQ[];         // 8 research-context questions
  related: ResearchRelated[];  // 4 related compounds
  /** Optional deep-dive HPLC/MS method paragraph (~300 words). */
  methodDetail?: string;
  /** Optional comparative receptor-pharmacology paragraph (~250 words). */
  receptorPharmacology?: string;
  /** Optional structural / sequence detail block (~150 words). */
  structuralDetail?: string;
  /** Optional cited references (peer-reviewed). */
  references?: ResearchReference[];
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
    structuralDetail: `Retatrutide is assembled by Fmoc-based solid-phase peptide synthesis on a low-loading Rink amide ChemMatrix resin, with orthogonal protection on the Lys17 ε-amine to permit selective on-resin acylation with the γ-Glu-γ-Glu-C20 fatty diacid spacer. The full 39-residue chain incorporates non-canonical residues α-methyl-Lys at position 13 and 2-aminoisobutyric acid (Aib) at position 2 — both engineered to suppress dipeptidyl-peptidase-4 (DPP-4) cleavage in plasma-stability assays. Following global deprotection with TFA/TIS/H2O/EDT (94:2.5:2.5:1), the crude peptide is precipitated in cold MTBE, lyophilised, and purified by preparative C18 reverse-phase chromatography. The albumin-binding C20 diacid pendant mediates non-covalent association with serum albumin in in-vitro plasma-stability assays, extending the apparent in-vitro half-life to roughly six days in rodent pharmacokinetic models (Coskun et al., 2022). Identity is confirmed against the theoretical monoisotopic mass of 4731.05 Da; the observed ESI-MS [M+5H]5+ envelope centres at m/z ≈ 947.2, with deconvoluted mass matching the calculated value to within 0.5 Da. Disulfide-bond mapping is not applicable — retatrutide contains no cysteine residues — but tryptic-digest LC-MS/MS coverage maps are recorded per release lot for sequence verification.`,
    methodDetail: `Release HPLC is run on a 4.6 × 250 mm, 5 µm C18 column (e.g. Phenomenex Luna or Waters XBridge BEH) thermostatted at 30 °C. Mobile phase A is 0.1% trifluoroacetic acid in water; mobile phase B is 0.1% TFA in acetonitrile. A typical analytical gradient ramps from 25% B to 55% B over 30 minutes at 1.0 mL/min, with UV detection at 220 nm. Retatrutide elutes at approximately 18–20 minutes under these conditions; peak-area purity is integrated from 5 to 35 minutes excluding the solvent front. The release specification is ≥99.0% main-peak area, with no single related-substance peak above 0.5%. System suitability is established with a reference standard injected in triplicate at the start of each sequence (%RSD < 1.0% on retention time, < 2.0% on peak area). Identity is confirmed in a parallel LC-MS run using a 0.1% formic acid gradient on a UPLC C18 column coupled to an ESI-Q-TOF spectrometer scanning m/z 500–2000; the deconvoluted mass must match the calculated monoisotopic value within 1 Da. Counter-ion content (TFA) is quantified by ion chromatography against a TFA reference curve and typically reports 4–10% w/w. Residual organic solvents (acetonitrile, MTBE, isopropanol) are screened by headspace GC against ICH Q3C class-2 and class-3 limits. Water content is measured by coulometric Karl Fischer titration on a 10–20 mg sub-sample. Endotoxin is quantified by kinetic-chromogenic LAL (limit < 5 EU/mg for in-vitro reference material), and bioburden by membrane filtration with TSA/SDA incubation. All release data are compiled into the batch-specific Certificate of Analysis shipped with each vial.`,
    receptorPharmacology: `Retatrutide is most informative in comparative incretin-receptor assay panels alongside tirzepatide (GIP/GLP-1 dual agonist), semaglutide (selective GLP-1R agonist), and native glucagon (GCGR reference). In CHO-K1 lines stably expressing human GIPR, GLP-1R, or GCGR coupled to a cAMP biosensor (e.g. cAMP Hunter, DiscoverX), retatrutide produces concentration-dependent cAMP accumulation with reported EC50 values of approximately 0.05–0.30 nM at all three receptors (Urva et al., Lancet 2022), placing its potency in a comparable range to tirzepatide at GIPR/GLP-1R while retaining glucagon-receptor activity that tirzepatide lacks. In β-arrestin-2 recruitment assays (PathHunter, Tango), the triagonist shows a partial-bias profile at GLP-1R relative to native GLP-1, with reduced β-arrestin recruitment per unit cAMP signal — a feature that has driven mechanistic in-vitro research into signalling-pathway compartmentalisation. Companion antagonists are used to deconvolute individual receptor contributions in mixed populations: exendin-9(39) blocks GLP-1R, GIP(3-30)NH2 blocks GIPR, and des-His1-[Glu9]-glucagon(1-29) blocks GCGR. In primary mouse and rat hepatocyte cultures, the glucagon-receptor component differentiates retatrutide from tirzepatide in mechanistic experiments probing hepatic-lipid-metabolism endpoints (PKA target phosphorylation, ATGL induction). For in-vitro plasma-stability work, the albumin-bound fraction can be modelled with 4% human serum albumin in the incubation buffer; the C20 fatty-diacid pendant is the principal determinant of extended in-vitro half-life under these conditions. Researchers benchmarking new triagonist candidates frequently include retatrutide as the pharmacological reference standard.`,
    references: [
      { citation: "Coskun T. et al. (2022). LY3437943, a novel triple glucagon, GIP, and GLP-1 receptor agonist for glycaemic control and weight loss: from discovery to clinical proof of concept. Nature Metabolism.", doi: "10.1038/s42255-022-00683-w" },
      { citation: "Urva S. et al. (2022). LY3437943, a novel triple GIP/GLP-1/glucagon receptor agonist in people with type 2 diabetes: a phase 1b, multicentre, double-blind, placebo-controlled, randomised, multiple-ascending-dose trial. The Lancet.", doi: "10.1016/S0140-6736(22)02033-5" },
      { citation: "Willard F.S. et al. (2020). Tirzepatide is an imbalanced and biased dual GIP and GLP-1 receptor agonist. JCI Insight.", doi: "10.1172/jci.insight.140532" },
      { citation: "Jastreboff A.M. et al. (2023). Triple-Hormone-Receptor Agonist Retatrutide for Obesity — A Phase 2 Trial. NEJM.", doi: "10.1056/NEJMoa2301972" },
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

  // ─────────── 4. TB-500 (Thymosin Beta-4) ───────────
  "tb-500-thymosin-beta-4": {
    overview: `TB-500 is a synthetic 43-residue acetylated peptide corresponding to the full-length sequence of human Thymosin Beta-4 (Tβ4). Molecular formula C212H350N56O78S, monoisotopic mass ≈ 4963 Da; CAS 77591-33-4. Originally isolated from bovine thymus by Low and Goldstein (PNAS, 1981), Tβ4 is now recognised as the principal G-actin–sequestering protein in mammalian cells, binding monomeric actin through its central 17-LKKTETQ-23 motif (Safer et al., J Biol Chem, 1991). In-vitro studies in HUVEC, dermal fibroblast, and rat-cardiomyocyte cultures document modulation of cell migration, F/G-actin equilibrium, and integrin-linked kinase signalling at concentrations of 10 ng/mL–1 µg/mL (Bock-Marquette et al., Nature, 2004; Goldstein et al., Ann NY Acad Sci, 2012). TB-500 functions as the reference Tβ4 standard for actin-dynamics and wound-closure research, complementing BPC-157 in parallel migration assays where the two compounds engage distinct upstream mechanisms — actin sequestration versus VEGFR2 modulation.`,
    applications: `Used in cell-migration research: scratch-closure assays in HUVEC, primary dermal fibroblasts, and HaCaT keratinocytes; transwell Boyden-chamber migration with collagen-IV coatings; and F/G-actin ratio quantification via fluorescent phalloidin/DNase-I staining. Typical in-vitro concentrations are 10 ng/mL–1 µg/mL. Cardiomyocyte-progenitor research uses neonatal-rat ventricular myocyte cultures to track integrin-linked kinase phosphorylation. Synergistic-compound research pairs TB-500 with BPC-157 to dissect actin-sequestering versus angiogenic mechanisms, and with GHK-Cu in matrix-remodelling endpoints (MMP-2, MMP-9, collagen-I qPCR).`,
    prepStorage: `Supplied as a lyophilised white powder in a sealed glass vial under inert headspace. Reconstitute aseptically with bacteriostatic water (0.9% benzyl alcohol) or sterile PBS to a working stock of 1–2 mg/mL. Equilibrate the vial to room temperature before opening to prevent moisture ingress. Reconstituted solutions are stable up to 21 days at 2–8 °C; for longer storage prepare single-use aliquots at −20 °C or below. Limit freeze-thaw cycles to three. Lyophilised material is stable 24 months at −20 °C. Handle with standard PPE — research use only.`,
    qualityVerification: `Released against ≥99.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm). Identity confirmed by ESI-MS against the calculated monoisotopic mass (≈ 4963 Da). Each batch CoA reports purity, mass match, water content (Karl Fischer), residual solvents, counter-ion (TFA / acetate), endotoxin (LAL), and bioburden. Full lot traceability from peptide synthesis through fill-finish.`,
    faqs: [
      { q: "What is the parent protein of TB-500?", a: "Human Thymosin Beta-4 (Tβ4), a 43-residue G-actin–sequestering protein first isolated from bovine thymus." },
      { q: "What CAS number and molecular mass apply?", a: "CAS 77591-33-4; molecular formula C212H350N56O78S, monoisotopic mass ≈ 4963 Da." },
      { q: "What is the actin-binding motif within TB-500?", a: "Residues 17–23 (LKKTETQ) form the central G-actin–sequestering motif characterised by Safer and colleagues (1991)." },
      { q: "Which in-vitro assays use TB-500 as a standard?", a: "Scratch-closure and transwell migration assays in HUVEC, dermal fibroblasts, and HaCaT keratinocytes." },
      { q: "What concentration range is used in cell culture?", a: "Dose-response curves typically span 10 ng/mL to 1 µg/mL in actin-dynamics and migration research." },
      { q: "Why is TB-500 often run alongside BPC-157?", a: "The two compounds engage distinct upstream mechanisms — actin sequestration versus VEGFR2 modulation — allowing pathway deconvolution in parallel cell-migration assays." },
      { q: "What is the HPLC release specification?", a: "≥99.0% by RP-HPLC peak area at 220 nm; lot-specific value reported on the CoA." },
      { q: "What storage conditions preserve activity?", a: "Lyophilised material: 24 months at −20 °C under nitrogen. Reconstituted: up to 21 days at 2–8 °C, or single-use aliquots at −20 °C." },
    ],
    related: [
      { slug: "bpc-157", label: "BPC-157", relationship: "Pentadecapeptide reference for parallel migration / angiogenesis assays." },
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Copper tripeptide for matrix-remodelling endpoint comparison." },
      { slug: "kpv-research-peptide", label: "KPV", relationship: "Anti-inflammatory tripeptide used in adjacent in-vitro work." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Recommended diluent for reconstitution." },
    ],
  },

  // ─────────── 5. KPV ───────────
  "kpv-research-peptide": {
    overview: `KPV is the C-terminal tripeptide Lys-Pro-Val derived from α-melanocyte-stimulating hormone (α-MSH 11-13). Molecular formula C16H30N4O4, monoisotopic mass 342.23 Da; CAS 67727-97-3. First characterised as the active anti-inflammatory fragment of α-MSH by Hiltz and Lipton (Peptides, 1990), KPV retains α-MSH's NF-κB-modulating activity while lacking melanocortin-receptor pigmentary signalling. In-vitro research in HT-29 and Caco-2 colonic epithelial lines, RAW 264.7 macrophages, and HaCaT keratinocytes documents suppression of NF-κB nuclear translocation, reduced TNF-α and IL-6 secretion, and downregulation of iNOS at concentrations of 1–100 µM (Brzoska et al., Endocr Rev, 2008; Kannengiesser et al., Inflamm Bowel Dis, 2008). KPV serves as a tripeptide reference in epithelial-barrier research using transepithelial electrical resistance (TEER) and FITC-dextran flux endpoints, and as a comparator alongside full-length α-MSH and selective MC1R/MC3R agonists in receptor-pathway studies.`,
    applications: `Used in inflammation-pathway research: NF-κB luciferase-reporter assays in HEK293 and HT-29 lines, TNF-α / IL-6 ELISA quantification in LPS-challenged RAW 264.7 macrophages, and iNOS Western blot in HaCaT keratinocytes. Typical in-vitro concentrations are 1–100 µM. Epithelial-barrier research uses TEER and FITC-dextran permeability assays on Caco-2 monolayers. Synergistic-compound research pairs KPV with BPC-157 in dual-compound barrier-integrity panels, and with selective MC1R agonists (NDP-α-MSH) to deconvolute melanocortin-receptor versus receptor-independent pathways.`,
    prepStorage: `Supplied as a lyophilised white powder in a sealed glass vial. Reconstitute aseptically with sterile water or PBS to a working stock of 1–10 mg/mL. The tripeptide is highly soluble in aqueous buffers. Reconstituted solutions are stable up to 28 days at 2–8 °C; for longer storage prepare single-use aliquots at −20 °C. Lyophilised material is stable 24 months at −20 °C in the sealed original vial. Handle with standard laboratory PPE — research use only, not for human or veterinary use.`,
    qualityVerification: `Released against ≥99.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm). Identity confirmed by ESI-MS against the calculated monoisotopic mass of 342.23 Da. Each batch CoA reports purity, mass match, water content, residual solvents, counter-ion (TFA / acetate), endotoxin (LAL), and bioburden. Full lot traceability.`,
    faqs: [
      { q: "What is the sequence of KPV?", a: "Lysine-Proline-Valine (Lys-Pro-Val), the C-terminal tripeptide of α-MSH (residues 11-13)." },
      { q: "What CAS number identifies KPV?", a: "67727-97-3; molecular formula C16H30N4O4, monoisotopic mass 342.23 Da." },
      { q: "Why is KPV used instead of full-length α-MSH in some assays?", a: "KPV retains α-MSH's NF-κB-modulating activity without engaging the pigmentary melanocortin signalling typical of the full-length hormone." },
      { q: "Which cell lines are standard for KPV in-vitro research?", a: "HT-29 and Caco-2 colonic epithelial lines, RAW 264.7 macrophages, and HaCaT keratinocytes." },
      { q: "What concentration range is used in inflammation assays?", a: "1–100 µM for dose-response curves on NF-κB activation, TNF-α / IL-6 secretion, and iNOS expression." },
      { q: "What HPLC purity does the lot meet?", a: "≥99.0% by RP-HPLC at 220 nm; lot-specific value on the CoA." },
      { q: "How is barrier integrity quantified in companion assays?", a: "Transepithelial electrical resistance (TEER) and FITC-dextran flux on Caco-2 monolayers." },
      { q: "How should KPV be stored once reconstituted?", a: "Up to 28 days at 2–8 °C, or as single-use aliquots at −20 °C; avoid more than three freeze-thaw cycles." },
    ],
    related: [
      { slug: "bpc-157", label: "BPC-157", relationship: "Pentadecapeptide for dual-compound epithelial-barrier panels." },
      { slug: "tb-500-thymosin-beta-4", label: "TB-500", relationship: "Tβ4 reference for parallel migration / cytoskeletal endpoints." },
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Copper tripeptide for adjacent matrix-remodelling research." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Optional diluent for reconstitution." },
    ],
  },

  // ─────────── 6. MOTS-c ───────────
  "mots-c-research-peptide": {
    overview: `MOTS-c (Mitochondrial Open-reading-frame of the Twelve-S rRNA-c) is a 16-residue mitochondrial-derived peptide encoded within the small mitochondrial 12S rRNA gene. Sequence: Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg; molecular formula C100H152N28O22S2, monoisotopic mass ≈ 2174 Da; CAS 1627580-64-6. First characterised by Lee, Cohen and colleagues (Cell Metab, 2015), MOTS-c modulates the folate / methionine cycle, increases intracellular AICAR, and activates AMPK signalling in HEK293, L6 myotubes, and primary skeletal-muscle cultures at concentrations of 1–10 µM. In-vitro work also documents nuclear translocation under metabolic stress (Kim et al., Cell Metab, 2018) and modulation of insulin-stimulated glucose uptake in adipocyte models. MOTS-c serves as the reference mitochondrial-derived-peptide standard for AMPK / acetyl-CoA-carboxylase phosphorylation Western blots and Seahorse extracellular-flux analyses of mitochondrial respiration.`,
    applications: `Used in metabolic-pathway research: phospho-AMPK (Thr172) and phospho-ACC (Ser79) Western blots in L6 myotubes, C2C12 myoblasts, and HepG2 hepatocytes; Seahorse XF mitochondrial-stress and glycolytic-stress assays measuring OCR/ECAR; and 2-NBDG glucose-uptake assays in 3T3-L1 adipocytes. Typical in-vitro concentrations are 1–10 µM. Synergistic-compound research pairs MOTS-c with NAD+ as parallel mitochondrial-pathway references, and with metformin / AICAR as orthogonal AMPK-activator controls.`,
    prepStorage: `Supplied as a lyophilised powder in a sealed glass vial. Reconstitute aseptically with sterile water, PBS, or bacteriostatic water to a working stock of 1 mg/mL. Solubility is good in aqueous buffers at neutral pH. Reconstituted solutions are stable up to 14 days at 2–8 °C; for longer storage prepare single-use aliquots at −20 °C or below. Avoid repeated freeze-thaw cycles. Lyophilised material is stable 24 months at −20 °C. Handle with standard PPE — research use only.`,
    qualityVerification: `Released against ≥98.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm). Identity confirmed by ESI-MS against the calculated monoisotopic mass (≈ 2174 Da). Each batch CoA reports purity, mass match, water content (Karl Fischer), residual solvents, counter-ion (TFA / acetate), endotoxin (LAL), and bioburden.`,
    faqs: [
      { q: "Where is MOTS-c encoded in the genome?", a: "Within the mitochondrial 12S rRNA gene — one of the first characterised mitochondrial-derived peptides (Lee et al., 2015)." },
      { q: "What is the molecular mass of MOTS-c?", a: "Monoisotopic mass ≈ 2174 Da; formula C100H152N28O22S2; CAS 1627580-64-6." },
      { q: "Which signalling pathway is the primary in-vitro readout?", a: "AMPK activation — phospho-AMPK (Thr172) and phospho-ACC (Ser79) via Western blot in myotube and hepatocyte models." },
      { q: "What concentration range is used in cell culture?", a: "1–10 µM for dose-response curves on AMPK phosphorylation and Seahorse respiration assays." },
      { q: "Which cell lines are standard for MOTS-c research?", a: "L6 myotubes, C2C12 myoblasts, HepG2 hepatocytes, and 3T3-L1 adipocytes." },
      { q: "What HPLC purity is released per lot?", a: "≥98.0% by RP-HPLC at 220 nm; lot-specific value on the CoA." },
      { q: "Which orthogonal controls are paired with MOTS-c?", a: "Metformin and AICAR as canonical AMPK activators; NAD+ as an adjacent mitochondrial-pathway reference." },
      { q: "How long is the reconstituted stock stable?", a: "Up to 14 days at 2–8 °C; longer storage as single-use −20 °C aliquots." },
    ],
    related: [
      { slug: "nad-research-compound", label: "NAD+", relationship: "Mitochondrial / sirtuin-pathway cofactor for parallel respiration assays." },
      { slug: "retatrutide-research-peptide", label: "Retatrutide", relationship: "Metabolic-pathway triagonist for adjacent receptor research." },
      { slug: "tirzepatide-research-peptide", label: "Tirzepatide", relationship: "Dual GIP/GLP-1 agonist for metabolic in-vitro comparisons." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Optional diluent for reconstitution." },
    ],
  },

  // ─────────── 7. PT-141 (Bremelanotide) ───────────
  "pt-141-research-peptide": {
    overview: `PT-141 (Bremelanotide) is a cyclic heptapeptide melanocortin-receptor agonist, Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-OH. Molecular formula C50H68N14O10, monoisotopic mass 1024.52 Da; CAS 189691-06-3. Developed from the α-MSH analogue Melanotan-II by removal of the C-terminal amide (Molinoff et al., Ann NY Acad Sci, 2003), PT-141 binds the MC4R with sub-nanomolar affinity and the MC3R / MC1R with lower potency, while lacking the strong MC1R-mediated pigmentary signalling characteristic of MT-II. In-vitro receptor pharmacology in HEK293 cells stably expressing human MC1R-MC5R reports cAMP EC50 values of 0.1–10 nM depending on receptor subtype (Rosen et al., 2004). PT-141 functions as the reference cyclic melanocortin agonist for cAMP accumulation assays, β-arrestin-2 recruitment (PathHunter), and competition binding against [125I]-NDP-α-MSH on transfected membranes.`,
    applications: `Used in melanocortin-receptor pharmacology: cAMP accumulation assays in HEK293-MCxR lines for all five receptor subtypes, β-arrestin-2 recruitment via PathHunter / Tango, and radioligand competition binding against [125I]-NDP-α-MSH. Typical in-vitro concentrations span 0.1 nM–1 µM for full dose-response curves. Companion antagonists include SHU-9119 (MC3R/MC4R), MBP10 (MC4R-selective), and agouti-related protein (AgRP) fragments. PT-141 is run alongside NDP-α-MSH as the prototypical reference full agonist and MT-II for comparative cyclic-analogue research.`,
    prepStorage: `Supplied as a lyophilised acetate salt in a sealed glass vial. Reconstitute aseptically with bacteriostatic water (0.9% benzyl alcohol) or sterile saline to a working stock of 1–10 mg/mL. Solubility in aqueous buffers is excellent. Reconstituted solutions are stable up to 30 days at 2–8 °C; for longer storage prepare single-use aliquots at −20 °C. Limit freeze-thaw cycles to three. Lyophilised material is stable 24 months at −20 °C protected from light. Handle with standard PPE — research use only.`,
    qualityVerification: `Released against ≥99.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm). Identity confirmed by ESI-MS against the calculated monoisotopic mass of 1024.52 Da. Each batch CoA records purity, mass match, water content, residual solvents, counter-ion (acetate), endotoxin (LAL), and bioburden.`,
    faqs: [
      { q: "What is the cyclic structure of PT-141?", a: "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-OH — a side-chain lactam-bridged heptapeptide derived from Melanotan-II by C-terminal-amide removal." },
      { q: "What CAS number and mass apply?", a: "CAS 189691-06-3; molecular formula C50H68N14O10; monoisotopic mass 1024.52 Da." },
      { q: "Which melanocortin receptor shows the highest affinity?", a: "MC4R, with sub-nanomolar binding affinity; lower potency at MC3R/MC1R, minimal MC2R activity." },
      { q: "What companion antagonists are used in pathway-deconvolution research?", a: "SHU-9119 (MC3R/MC4R), MBP10 (MC4R-selective), and AgRP fragments." },
      { q: "What concentration range is standard for in-vitro work?", a: "0.1 nM to 1 µM for cAMP dose-response curves; lower for high-affinity competition binding." },
      { q: "What HPLC purity does each lot meet?", a: "≥99.0% by RP-HPLC at 220 nm; lot-specific value reported on the CoA." },
      { q: "Why is PT-141 paired with NDP-α-MSH in assays?", a: "NDP-α-MSH serves as the prototypical reference full agonist for all melanocortin receptors, providing a comparison baseline." },
      { q: "What storage conditions apply?", a: "Lyophilised: 24 months at −20 °C, protected from light. Reconstituted: 30 days at 2–8 °C." },
    ],
    related: [
      { slug: "melanotan-ii-research-peptide", label: "Melanotan-II", relationship: "Parent cyclic α-MSH analogue for comparative MC1R/MC4R research." },
      { slug: "kpv-research-peptide", label: "KPV", relationship: "C-terminal α-MSH tripeptide for receptor-independent pathway comparison." },
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Copper tripeptide used in adjacent dermal in-vitro work." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Recommended diluent for reconstitution." },
    ],
  },

  // ─────────── 8. NAD+ ───────────
  "nad-research-compound": {
    overview: `Nicotinamide Adenine Dinucleotide (NAD+) is the oxidised form of the canonical pyridine-nucleotide redox cofactor. Molecular formula C21H27N7O14P2, monoisotopic mass 663.11 Da; CAS 53-84-9. First isolated by Harden and Young (1906) and later structurally elucidated by Warburg, NAD+ is a substrate or cosubstrate for >500 enzymes including the sirtuin deacylases (SIRT1-7), poly(ADP-ribose) polymerases (PARP1-3), and CD38 / CD157 ectoenzymes (Verdin, Science, 2015). In-vitro biochemistry uses purified NAD+ as a stoichiometric cosubstrate in sirtuin deacetylase reactions (e.g. fluor-de-lys SIRT1 assays), as a coupling cofactor in NADH-linked dehydrogenase kinetics (LDH, MDH, ADH), and as a substrate in PARP automodification assays. Cell-culture research applies NAD+ or its precursors (NMN, NR) at 100 µM–1 mM to manipulate intracellular NAD+ pools and probe sirtuin-dependent deacetylation in HEK293, HepG2, and primary hepatocyte models.`,
    applications: `Used in enzymology and cell biology: SIRT1-7 deacetylase activity assays (Fluor-de-Lys, LC-MS deacetylation), NAD+ / NADH cycling assays for dehydrogenase kinetics, and PARP1 automodification quantification. Cell-culture work uses 100 µM–1 mM in HEK293, HepG2, primary hepatocytes, and C2C12 myotubes to manipulate intracellular pyridine-nucleotide pools. Companion reagents include nicotinamide and EX-527 (selective SIRT1 inhibitor), olaparib (PARP inhibitor), and FK866 (NAMPT inhibitor) for pathway-specific antagonist work. Compatible LC-MS quantification methods are available for intracellular NAD+/NADH pool measurement.`,
    prepStorage: `Supplied as a hygroscopic crystalline powder in a sealed amber vial under inert atmosphere. Reconstitute aseptically with cold distilled water or sterile PBS to a working stock of 10–50 mg/mL immediately before use — NAD+ degrades in solution. Adjust pH to 6.5–7.5 if required; alkaline conditions accelerate hydrolysis. Reconstituted solutions are stable up to 7 days at 2–8 °C, protected from light; for longer storage prepare single-use frozen aliquots at −80 °C. Lyophilised powder is stable 24 months at −20 °C, desiccated, protected from light. Handle with standard PPE — research use only.`,
    qualityVerification: `Released against ≥98.0% HPLC purity (anion-exchange or ion-pair RP-HPLC, 260 nm). Identity confirmed by UV spectrum (λmax ≈ 260 nm, ε260 = 18,000 M⁻¹cm⁻¹) and ESI-MS against 663.11 Da. Each batch CoA reports purity, water content (Karl Fischer), residual solvents, heavy-metal residues, endotoxin (LAL), and bioburden.`,
    faqs: [
      { q: "What is the molecular formula and CAS number of NAD+?", a: "C21H27N7O14P2; CAS 53-84-9; monoisotopic mass 663.11 Da." },
      { q: "Which enzyme classes use NAD+ as cosubstrate?", a: "Sirtuin deacylases (SIRT1-7), PARP polymerases (PARP1-3), CD38/CD157 ectoenzymes, and the broad family of NAD-linked dehydrogenases." },
      { q: "What UV absorbance applies to NAD+ quantification?", a: "λmax ≈ 260 nm with ε260 = 18,000 M⁻¹cm⁻¹ for the oxidised form; reduced NADH adds a peak at 340 nm." },
      { q: "What concentration range is used in cell-culture research?", a: "100 µM to 1 mM for manipulating intracellular NAD+ pools in HEK293, HepG2, and primary hepatocytes." },
      { q: "Why does NAD+ require freshly prepared solutions?", a: "It hydrolyses in aqueous solution, particularly under alkaline conditions or elevated temperature — reconstitute immediately before use and keep cold." },
      { q: "Which selective inhibitors pair with NAD+ in research?", a: "EX-527 (SIRT1), olaparib (PARP), and FK866 (NAMPT) for pathway-specific antagonist comparisons." },
      { q: "What HPLC purity is released per lot?", a: "≥98.0% by anion-exchange or ion-pair RP-HPLC at 260 nm; lot-specific value on the CoA." },
      { q: "What is the recommended long-term storage?", a: "Lyophilised at −20 °C desiccated and light-protected; reconstituted single-use aliquots at −80 °C." },
    ],
    related: [
      { slug: "mots-c-research-peptide", label: "MOTS-c", relationship: "Mitochondrial-derived peptide for parallel AMPK/respiration research." },
      { slug: "retatrutide-research-peptide", label: "Retatrutide", relationship: "Metabolic triagonist used in adjacent in-vitro respiration assays." },
      { slug: "tirzepatide-research-peptide", label: "Tirzepatide", relationship: "Dual GIP/GLP-1 agonist for metabolic-pathway comparisons." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Optional diluent for peptide-cofactor co-administration assays." },
    ],
  },

  // ─────────── 9. GHK-Cu ───────────
  "ghk-cu-research-peptide": {
    overview: `GHK-Cu is the copper(II) complex of the human-plasma tripeptide Glycyl-L-Histidyl-L-Lysine. Molecular formula C14H22CuN6O4, monoisotopic mass 401.10 Da; CAS 89030-95-5 (free peptide CAS 49557-75-7). Isolated from human serum by Pickart (1973) as an albumin-bound copper-carrier fraction, GHK-Cu has been characterised extensively in fibroblast, keratinocyte, and HUVEC cultures for matrix-remodelling and antioxidant endpoints (Pickart and Margolina, Int J Mol Sci, 2018). In-vitro studies at 1 nM–10 µM document modulation of MMP-1, MMP-2, and TIMP-1 expression, upregulation of decorin and collagen-I synthesis in dermal fibroblasts, and downregulation of selected inflammatory markers (NF-κB, TNF-α). The 2:1 peptide:Cu²⁺ complex is the species responsible for the redox and metal-transfer activity used as a reference in copper-coordination chemistry research and superoxide-dismutase mimetic assays.`,
    applications: `Used in extracellular-matrix research: MMP-1/2/9 and TIMP-1/2 qPCR + ELISA in human dermal fibroblast (HDF) and HaCaT cultures; Sirius-Red and hydroxyproline collagen-synthesis quantification; decorin and integrin-β1 Western blots. Typical in-vitro concentrations span 1 nM–10 µM. Antioxidant research includes superoxide-dismutase mimetic activity (xanthine/xanthine-oxidase + cytochrome-c reduction) and DPPH radical-scavenging assays. Synergistic-compound research pairs GHK-Cu with BPC-157 and TB-500 in tri-compound matrix-remodelling panels.`,
    prepStorage: `Supplied as a deep-blue lyophilised powder reflecting the Cu²⁺ chromophore, in a sealed amber glass vial. Reconstitute aseptically with sterile water or bacteriostatic water to a working stock of 1–5 mg/mL; the complex is freely soluble. Avoid strongly reducing buffers that displace copper. Reconstituted solutions are stable up to 28 days at 2–8 °C protected from light; for longer storage prepare single-use aliquots at −20 °C. Lyophilised material is stable 24 months at −20 °C protected from light. Handle with standard PPE — research use only.`,
    qualityVerification: `Released against ≥98.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm), with the characteristic blue Cu²⁺ d-d band (λmax ≈ 525 nm) confirmed by UV-Vis. Identity confirmed by ESI-MS and ICP-MS for copper stoichiometry (target 2:1 peptide:Cu²⁺). Each batch CoA records purity, mass match, copper content, water (Karl Fischer), residual solvents, endotoxin (LAL), and bioburden.`,
    faqs: [
      { q: "What is the peptide sequence and copper stoichiometry?", a: "Glycyl-L-Histidyl-L-Lysine coordinated 2:1 with Cu²⁺. CAS 89030-95-5 for the complex." },
      { q: "What confirms the copper complex identity?", a: "ESI-MS for the peptide and ICP-MS for copper content, plus the characteristic blue d-d band at ≈ 525 nm by UV-Vis." },
      { q: "Which in-vitro assays use GHK-Cu as a reference?", a: "Dermal-fibroblast MMP/TIMP qPCR, collagen-synthesis (Sirius-Red, hydroxyproline), and decorin Western blots." },
      { q: "What concentration range is used in HDF cultures?", a: "1 nM to 10 µM for dose-response curves on matrix-remodelling endpoints." },
      { q: "What HPLC release purity applies?", a: "≥98.0% by RP-HPLC at 220 nm; lot-specific value on the CoA." },
      { q: "Why must strongly reducing buffers be avoided?", a: "They reduce Cu²⁺ to Cu⁺ and can displace the metal from the peptide, altering the active species." },
      { q: "Which related compounds are paired with GHK-Cu?", a: "BPC-157 and TB-500 in tri-compound matrix-remodelling and migration panels." },
      { q: "What storage preserves the complex?", a: "Lyophilised at −20 °C protected from light; reconstituted up to 28 days at 2–8 °C protected from light." },
    ],
    related: [
      { slug: "bpc-157", label: "BPC-157", relationship: "Pentadecapeptide for combined matrix-remodelling / migration panels." },
      { slug: "tb-500-thymosin-beta-4", label: "TB-500", relationship: "Tβ4 reference for parallel actin / migration endpoints." },
      { slug: "kpv-research-peptide", label: "KPV", relationship: "Anti-inflammatory tripeptide for adjacent NF-κB pathway work." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Optional diluent for reconstitution." },
    ],
  },

  // ─────────── 10. Glow Blend ───────────
  "glow-blend": {
    overview: `Glow Blend is a research-grade lyophilised mixture combining GHK-Cu (copper tripeptide, CAS 89030-95-5) and BPC-157 (pentadecapeptide, CAS 137525-51-0) co-formulated at a fixed mass ratio for parallel in-vitro evaluation of skin-relevant cell-culture endpoints. Combined molecular masses ≈ 401 Da (GHK-Cu complex) + 1419.5 Da (BPC-157). Individual mechanisms are well characterised in the literature: GHK-Cu modulates MMP/TIMP expression and collagen synthesis in dermal-fibroblast cultures (Pickart and Margolina, Int J Mol Sci, 2018), while BPC-157 upregulates VEGFR2 signalling in endothelial cell models (Hsieh et al., 2017). The co-formulation serves as a single reference for tri-endpoint research panels — matrix-remodelling, fibroblast migration, and endothelial angiogenesis — without requiring two separate weighing and reconstitution steps. The blended composition is intended for benchtop assay convenience in dermal-research workflows only.`,
    applications: `Used in combined-compound dermal research: parallel HDF migration (scratch closure), HUVEC tube-formation, and MMP-1 / collagen-I qPCR endpoints on the same plate. Typical reconstituted working concentrations are normalised against the individual component contributions, with GHK-Cu spanning 10 nM–10 µM and BPC-157 spanning 100 ng/mL–10 µg/mL. Companion controls include matched single-compound preparations (GHK-Cu alone, BPC-157 alone) at the same nominal concentrations to deconvolute additive versus interactive effects. Compatible with standard fluorescence and absorbance plate readers; no specialised instrumentation required.`,
    prepStorage: `Supplied as a sterile-filtered lyophilised blue-tinged powder in a sealed amber vial. Reconstitute aseptically with bacteriostatic water (0.9% benzyl alcohol) to the indicated total-mass working stock, ensuring complete dissolution by gentle inversion (do not vortex aggressively — the GHK-Cu complex is light-sensitive). Reconstituted solutions are stable up to 21 days at 2–8 °C protected from light; for longer storage prepare single-use aliquots at −20 °C. Lyophilised blend is stable 18 months at −20 °C protected from light. Handle with standard PPE — research use only.`,
    qualityVerification: `Each component is released individually against ≥98.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm) before blending. The final blend is characterised by RP-HPLC for the relative peak-area ratio against the target component-mass ratio. Identity of each component confirmed by ESI-MS. Each batch CoA reports per-component purity, mass match, copper content (ICP-MS for GHK-Cu), water (Karl Fischer), residual solvents, endotoxin (LAL), and bioburden.`,
    faqs: [
      { q: "Which compounds make up Glow Blend?", a: "GHK-Cu copper tripeptide and BPC-157 pentadecapeptide, co-formulated at a fixed mass ratio." },
      { q: "Why blend the two compounds?", a: "To run tri-endpoint dermal-research panels (matrix-remodelling, fibroblast migration, endothelial tube formation) from a single reconstitution step." },
      { q: "How are component purities verified?", a: "Each compound is released individually at ≥98.0% RP-HPLC purity before blending; the final mix is re-tested for the relative peak-area ratio." },
      { q: "What concentration ranges apply per component?", a: "GHK-Cu: 10 nM–10 µM. BPC-157: 100 ng/mL–10 µg/mL. Normalised against the total-mass working stock." },
      { q: "Why protect Glow Blend from light?", a: "The Cu²⁺ chromophore in GHK-Cu is light-sensitive; ambient-light exposure can alter the complex over time." },
      { q: "Which controls accompany blend experiments?", a: "Matched single-compound preparations of GHK-Cu alone and BPC-157 alone at the same nominal concentrations to assess additive vs. interactive contributions." },
      { q: "What reconstitution diluent is recommended?", a: "Bacteriostatic water (0.9% benzyl alcohol); avoid aggressive vortexing." },
      { q: "What sterility data accompanies the blend?", a: "Each CoA includes endotoxin (LAL) and bioburden results, plus per-component copper content by ICP-MS for the GHK-Cu fraction." },
    ],
    related: [
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Single-compound copper-tripeptide reference for component-control assays." },
      { slug: "bpc-157", label: "BPC-157", relationship: "Single-compound pentadecapeptide reference for component-control assays." },
      { slug: "tb-500-thymosin-beta-4", label: "TB-500", relationship: "Tβ4 reference for adjacent actin / migration research." },
      { slug: "klow-blend", label: "Klow Blend", relationship: "Companion 4-peptide blend for broader research-panel comparison." },
    ],
  },

  // ─────────── 11. Klow Blend ───────────
  "klow-blend": {
    overview: `Klow Blend is a research-grade lyophilised four-peptide mixture combining BPC-157 (10 mg), TB-500 / Thymosin Beta-4 (10 mg), GHK-Cu copper tripeptide (50 mg), and KPV α-MSH tripeptide (10 mg) co-formulated for parallel in-vitro evaluation across tissue-repair, actin-dynamics, matrix-remodelling, and NF-κB inflammation-pathway endpoints. The blend brings together four well-characterised reference compounds — pentadecapeptide, Thymosin Beta-4 full-length, copper-coordinated tripeptide, and α-MSH C-terminal tripeptide — covering complementary mechanisms (VEGFR2 modulation, G-actin sequestration, MMP/TIMP regulation, NF-κB suppression) at a single reconstitution step. Intended for benchtop assay panels in cell-migration, angiogenesis, matrix-remodelling, and inflammation research, with each component traceable to its individually released lot.`,
    applications: `Used in multi-endpoint research panels: HUVEC scratch-closure (BPC-157 / TB-500 contribution), tube-formation angiogenesis (BPC-157 contribution), HDF MMP-1 / collagen-I qPCR (GHK-Cu contribution), and HT-29 / RAW 264.7 NF-κB / TNF-α suppression (KPV contribution). Total working stock is normalised against the labelled component-mass ratio; component-equivalent concentrations span the published in-vitro ranges per compound. Companion controls comprise matched single-compound preparations at the same nominal concentrations to deconvolute each compound's contribution to combined endpoints.`,
    prepStorage: `Supplied as a sterile-filtered lyophilised faintly blue-tinged powder in a sealed amber vial (Cu²⁺ chromophore contributes the colour). Reconstitute aseptically with bacteriostatic water (0.9% benzyl alcohol) to the total-mass working stock; mix by gentle inversion only. Reconstituted solutions are stable up to 21 days at 2–8 °C protected from light; for longer storage prepare single-use aliquots at −20 °C. Lyophilised blend is stable 18 months at −20 °C protected from light. Handle with standard PPE — research use only, not for human or veterinary use.`,
    qualityVerification: `Each of the four components is released individually against ≥98.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm) before blending. The final blend is characterised by RP-HPLC for the four-peak relative peak-area ratio against the target component-mass ratio. Identities confirmed by ESI-MS per component; copper stoichiometry of the GHK-Cu fraction confirmed by ICP-MS. Each batch CoA reports per-component purity, mass match, copper content, water (Karl Fischer), residual solvents, endotoxin (LAL), and bioburden.`,
    faqs: [
      { q: "Which compounds make up Klow Blend?", a: "BPC-157 10 mg, TB-500 10 mg, GHK-Cu 50 mg, and KPV 10 mg per labelled unit." },
      { q: "Why combine four peptides?", a: "To support multi-endpoint research panels (tissue-repair migration, angiogenesis, matrix-remodelling, NF-κB inflammation) from a single reconstitution." },
      { q: "How is component purity verified?", a: "Each peptide is released individually at ≥98.0% RP-HPLC before blending; the final mix is re-tested for the four-peak ratio." },
      { q: "Which controls accompany blend experiments?", a: "Matched single-compound preparations of each component at the same nominal concentrations to deconvolute individual contributions." },
      { q: "Why protect the blend from light?", a: "The GHK-Cu chromophore is light-sensitive; ambient-light exposure can alter the copper complex over time." },
      { q: "What reconstitution diluent is recommended?", a: "Bacteriostatic water (0.9% benzyl alcohol). Mix by gentle inversion — do not vortex aggressively." },
      { q: "What is the recommended storage profile?", a: "Lyophilised: 18 months at −20 °C protected from light. Reconstituted: 21 days at 2–8 °C protected from light, or single-use −20 °C aliquots." },
      { q: "What sterility data accompanies each batch?", a: "Each CoA reports endotoxin (LAL) and bioburden plus copper stoichiometry (ICP-MS) for the GHK-Cu fraction." },
    ],
    related: [
      { slug: "bpc-157", label: "BPC-157", relationship: "Single-compound pentadecapeptide reference for component-control assays." },
      { slug: "tb-500-thymosin-beta-4", label: "TB-500", relationship: "Single-compound Tβ4 reference for component-control assays." },
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Single-compound copper-tripeptide reference for component-control assays." },
      { slug: "kpv-research-peptide", label: "KPV", relationship: "Single-compound α-MSH tripeptide reference for component-control assays." },
    ],
  },

  // ─────────── 12. Melanotan-II ───────────
  "melanotan-ii-research-peptide": {
    overview: `Melanotan-II (MT-II) is a cyclic heptapeptide α-MSH analogue, Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2. Molecular formula C50H69N15O9, monoisotopic mass 1023.54 Da; CAS 121062-08-6. Developed at the University of Arizona by Hadley and Hruby in the late 1980s as a metabolically stable α-MSH analogue, MT-II is a broad-spectrum melanocortin-receptor agonist with sub-nanomolar to low-nanomolar potency at MC1R, MC3R, MC4R, and MC5R (Hadley et al., Pigment Cell Res, 1998). In-vitro pharmacology in HEK293-MCxR cells reports cAMP EC50 values of 0.05–5 nM depending on receptor subtype. The C-terminal amide and lactam-bridge cyclisation distinguish MT-II from its acidic-C-terminus analogue PT-141. MT-II functions as the reference cyclic α-MSH analogue for full melanocortin-panel cAMP and β-arrestin recruitment research, and as a comparator alongside NDP-α-MSH, PT-141, and AgRP fragments.`,
    applications: `Used in melanocortin-receptor pharmacology: cAMP accumulation in HEK293-MCxR lines for all five receptor subtypes, β-arrestin-2 recruitment (PathHunter, Tango), and radioligand competition binding against [125I]-NDP-α-MSH. Typical in-vitro concentrations span 0.01 nM–1 µM. Pigmentation-pathway research uses B16-F10 murine melanoma and primary melanocyte cultures to track tyrosinase activity and eumelanin synthesis at 1 nM–100 nM. Companion antagonists include SHU-9119 (MC3R/MC4R), MBP10 (MC4R-selective), and AgRP(83-132) fragments.`,
    prepStorage: `Supplied as a lyophilised acetate salt in a sealed glass vial under inert atmosphere. Reconstitute aseptically with bacteriostatic water (0.9% benzyl alcohol) or sterile saline to a working stock of 1–10 mg/mL; the cyclic structure is freely soluble in aqueous buffers. Reconstituted solutions are stable up to 30 days at 2–8 °C protected from light; for longer storage prepare single-use aliquots at −20 °C. Limit freeze-thaw cycles to three. Lyophilised material is stable 24 months at −20 °C protected from light. Handle with standard PPE — research use only.`,
    qualityVerification: `Released against ≥99.0% RP-HPLC purity (C18, 0.1% TFA / MeCN gradient, 220 nm). Identity confirmed by ESI-MS against the calculated monoisotopic mass of 1023.54 Da. Each batch CoA records purity, mass match, water (Karl Fischer), residual solvents, counter-ion (acetate), endotoxin (LAL), and bioburden.`,
    faqs: [
      { q: "What is the cyclic structure of MT-II?", a: "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2 — a side-chain lactam-bridged α-MSH analogue with C-terminal amide." },
      { q: "How does MT-II differ structurally from PT-141?", a: "PT-141 carries a free C-terminal carboxylate; MT-II retains the C-terminal amide, altering relative receptor selectivity." },
      { q: "What CAS number and mass apply?", a: "CAS 121062-08-6; molecular formula C50H69N15O9; monoisotopic mass 1023.54 Da." },
      { q: "Which receptors does MT-II activate?", a: "Broad-spectrum agonist at MC1R, MC3R, MC4R, and MC5R, with sub-nanomolar to low-nanomolar potency depending on subtype." },
      { q: "Which in-vitro cell lines are standard?", a: "HEK293 stably expressing human MCxR for cAMP / β-arrestin assays; B16-F10 melanoma for pigmentation-pathway research." },
      { q: "What HPLC purity does each lot meet?", a: "≥99.0% by RP-HPLC at 220 nm; lot-specific value on the CoA." },
      { q: "Which selective antagonists pair with MT-II?", a: "SHU-9119 (MC3R/MC4R), MBP10 (MC4R-selective), and AgRP(83-132)." },
      { q: "How should MT-II be stored?", a: "Lyophilised: 24 months at −20 °C protected from light. Reconstituted: up to 30 days at 2–8 °C protected from light." },
    ],
    related: [
      { slug: "pt-141-research-peptide", label: "PT-141", relationship: "C-terminal-carboxylate analogue for comparative cyclic-melanocortin research." },
      { slug: "kpv-research-peptide", label: "KPV", relationship: "Linear C-terminal α-MSH tripeptide for receptor-independent pathway comparison." },
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Copper tripeptide for adjacent dermal in-vitro work." },
      { slug: "bacteriostatic-water-research-compound", label: "Bacteriostatic Water", relationship: "Recommended diluent for reconstitution." },
    ],
  },

  // ─────────── 13. Bacteriostatic Water ───────────
  "bacteriostatic-water-research-compound": {
    overview: `Bacteriostatic Water for Injection USP is sterile water containing 0.9% (9 mg/mL) benzyl alcohol as a bacteriostatic preservative. Benzyl alcohol CAS 100-51-6; molecular formula C7H8O; molecular weight 108.14 g/mol. First introduced into USP monograph in the mid-20th century, the formulation enables multi-dose reconstitution of lyophilised peptide and small-molecule research compounds while suppressing microbial growth between aliquot withdrawals. The benzyl-alcohol preservative is compatible with the majority of research peptides characterised in the supplied product range, including BPC-157, TB-500, GHK-Cu, KPV, retatrutide, tirzepatide, and PT-141. Bacteriostatic water functions as the default diluent for in-vitro peptide reconstitution at concentrations of 0.5–10 mg/mL, with documented stability for reconstituted stocks of 7–30 days at 2–8 °C depending on the parent compound's chemistry.`,
    applications: `Used as the default reconstitution diluent for lyophilised research peptides: typical 1–2 mL aseptic withdrawal per vial through a sealed elastomeric stopper. Working-stock concentrations range from 0.5 mg/mL (low-mass peptides) to 10 mg/mL (high-solubility compounds). The benzyl-alcohol preservative permits multi-use vials over the labelled 28-day window, supporting time-course assays with stable stock concentrations. Bacteriostatic water is not compatible with benzyl-alcohol-sensitive cell-culture models or with certain neonatal-tissue preparations; in those cases substitute sterile water for injection or appropriate buffer.`,
    prepStorage: `Supplied as a clear colourless solution in a sealed elastomeric-stoppered multi-dose vial under USP-compliant sterile fill. Store at controlled room temperature (15–30 °C); do not freeze (benzyl alcohol can precipitate at low temperature). Once the stopper is first punctured, label the vial with the date and discard after 28 days per USP guidance regardless of remaining volume. Use aseptic technique with a fresh sterile needle for each withdrawal. Handle with standard PPE — research use only, not for human or veterinary administration.`,
    qualityVerification: `Released to USP <1231> sterile-water-for-injection specifications plus benzyl-alcohol content of 0.9% ± 5% by GC-FID. Each batch CoA reports benzyl-alcohol assay, pH (4.5–7.0), conductivity, total organic carbon (TOC), endotoxin (LAL ≤ 0.25 EU/mL), and sterility (USP <71> direct-inoculation method). Container-closure integrity verified by dye-ingress testing.`,
    faqs: [
      { q: "What is the active preservative?", a: "Benzyl alcohol at 0.9% (9 mg/mL); CAS 100-51-6; MW 108.14 g/mol." },
      { q: "How long is a multi-dose vial usable after first puncture?", a: "28 days per USP labelling; discard after the labelled period regardless of remaining volume." },
      { q: "What compounds are suitable for reconstitution?", a: "Most lyophilised research peptides including BPC-157, TB-500, GHK-Cu, KPV, retatrutide, tirzepatide, and PT-141." },
      { q: "What stock concentration range is typical?", a: "0.5 mg/mL to 10 mg/mL depending on the parent compound's solubility profile." },
      { q: "What sterility specification applies?", a: "USP <71> direct-inoculation sterility test; endotoxin LAL ≤ 0.25 EU/mL." },
      { q: "Why is bacteriostatic water not always suitable?", a: "Benzyl alcohol can be cytotoxic to certain neonatal-tissue preparations and benzyl-alcohol-sensitive cell-culture models; substitute plain sterile water in those contexts." },
      { q: "What storage temperature applies?", a: "Controlled room temperature 15–30 °C. Do NOT freeze — benzyl alcohol can precipitate." },
      { q: "What analytical method confirms benzyl-alcohol content?", a: "GC-FID assay against a benzyl-alcohol reference standard, with release at 0.9% ± 5%." },
    ],
    related: [
      { slug: "bpc-157", label: "BPC-157", relationship: "Common reconstitution target — bacteriostatic water at 1 mg/mL." },
      { slug: "tb-500-thymosin-beta-4", label: "TB-500", relationship: "Common reconstitution target — bacteriostatic water at 1–2 mg/mL." },
      { slug: "ghk-cu-research-peptide", label: "GHK-Cu", relationship: "Common reconstitution target — bacteriostatic water at 1–5 mg/mL." },
      { slug: "retatrutide-research-peptide", label: "Retatrutide", relationship: "Common reconstitution target — bacteriostatic water at 1 mg/mL." },
    ],
  },
};
