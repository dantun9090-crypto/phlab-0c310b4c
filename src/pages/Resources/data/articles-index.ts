// Lightweight index for sitewide use (nav, footer, SEO link hubs,
// search lists, and the splat route's Article JSON-LD head()).
// Importing this avoids pulling the full ~340KB articles dataset
// (with sections, references, related arrays) into bundles that only
// need slugs, headlines, and publication metadata.
//
// Keep in sync with `./articles.ts` (tests/jsonld-validation.test.ts
// asserts datePublished parity). The Resources detail page itself
// still imports the full data - this file is for everywhere else.

export interface ArticleIndexEntry {
  slug: string;
  title: string;
  /** ISO date, mirrors articles.ts publishDate. */
  publishDate: string;
  /** Minutes, mirrors articles.ts readTime. */
  readTime: number;
}

export const ARTICLE_INDEX: ArticleIndexEntry[] = [
  { slug: 'what-is-retatrutide', title: 'What is Retatrutide and How Does It Work in Research?', publishDate: '2026-03-18', readTime: 14 },
  { slug: 'hplc-testing-explained', title: 'HPLC Testing Explained: How Peptide Purity Is Verified', publishDate: '2026-03-05', readTime: 11 },
  { slug: 'bpc-157-tissue-repair', title: 'BPC-157 Research and Human Studies: Tissue Repair Mechanisms', publishDate: '2026-02-20', readTime: 13 },
  { slug: 'tb-500-thymosin-beta-4', title: 'TB-500 and Thymosin Beta-4: Actin Sequestration and Tissue Regeneration Research', publishDate: '2026-02-08', readTime: 12 },
  { slug: 'retatrutide-vs-tirzepatide-vs-semaglutide', title: 'Retatrutide vs Tirzepatide vs Semaglutide: A Research Comparison', publishDate: '2026-03-28', readTime: 15 },
  { slug: 'ipamorelin-ghrp-research', title: 'GHRP-2 vs Ipamorelin: A Comparative Research Guide', publishDate: '2026-01-30', readTime: 11 },
  { slug: 'epithalon-telomere-research', title: 'Epithalon (Epitalon): Telomerase Activation and Cellular Ageing Research', publishDate: '2026-01-15', readTime: 10 },
  { slug: 'peptide-storage-reconstitution', title: 'Peptide Storage and Reconstitution: A Laboratory Protocol Guide', publishDate: '2026-03-10', readTime: 9 },
  { slug: 'melanotan-2-melanocortin-research', title: 'Melanotan II and Melanocortin Receptor Research', publishDate: '2026-02-14', readTime: 10 },
  { slug: 'tb-500-thymosin-beta-4-research', title: 'TB-500 and Thymosin Beta-4: Actin Sequestration and Tissue Remodelling Research', publishDate: '2026-03-20', readTime: 10 },
  { slug: 'ghk-cu-copper-peptide-research', title: 'GHK-Cu: The Copper Tripeptide at the Intersection of Wound Healing, Gene Regulation, and Anti-Ageing Biology', publishDate: '2026-03-28', readTime: 9 },
  { slug: 'ghk-cu-research-guide', title: 'GHK-Cu Peptide: A Technical Research Guide for UK Laboratories', publishDate: '2026-05-12', readTime: 8 },
  { slug: 'peptide-storage-lyophilisation-science', title: 'Peptide Storage Science: Lyophilisation, Reconstitution, and Stability Maximisation', publishDate: '2026-04-02', readTime: 8 },
  { slug: 'selank-anxiolytic-nootropic-peptide', title: 'Selank: The Synthetic Tuftsin Analogue at the Frontier of Anxiolytic Peptide Research', publishDate: '2026-04-05', readTime: 9 },
  { slug: 'epithalon-telomere-epigenetic-research', title: 'Epithalon: Telomerase Activation, Epigenetic Remodelling, and Longevity Research', publishDate: '2026-04-07', readTime: 10 },
  { slug: 'semax-cognitive-neuroprotective-research', title: 'Semax: ACTH-Derived Neuropeptide Research in Cognition, BDNF Signalling, and Neuroprotection', publishDate: '2026-04-08', readTime: 10 },
  { slug: 'cjc-1295-mod-grf-ghrh-research', title: 'CJC-1295 and MOD GRF(1-29): GHRH Analogue Research for GH Pulse Amplification', publishDate: '2026-04-09', readTime: 9 },
  { slug: 'follistatin-344-myostatin-inhibition-research', title: 'Follistatin-344: Myostatin Inhibition, Muscle Hypertrophy Research, and TGF-beta Superfamily Antagonism', publishDate: '2026-04-10', readTime: 9 },
  { slug: 'tirzepatide-dual-agonist-research', title: 'Tirzepatide: Dual GIP/GLP-1 Receptor Agonism and Its Role in Metabolic Research', publishDate: '2026-03-22', readTime: 15 },
  { slug: 'kpv-tripeptide-anti-inflammatory-research', title: 'KPV Tripeptide: Alpha-MSH-Derived Anti-Inflammatory Signalling in Preclinical Research', publishDate: '2026-03-28', readTime: 13 },
  { slug: 'mots-c-mitochondrial-derived-peptide', title: 'MOTS-C: The Mitochondrial-Derived Peptide Regulating Metabolic Homeostasis and Exercise Adaptation', publishDate: '2026-04-01', readTime: 14 },
  { slug: 'nad-nicotinamide-adenine-dinucleotide-research', title: 'NAD+: Cellular Energy Currency, Sirtuin Activation, and the Biochemistry of Ageing', publishDate: '2026-04-03', readTime: 16 },
  { slug: 'pt-141-bremelanotide-melanocortin-research', title: 'PT-141 (Bremelanotide): Melanocortin Receptor Pharmacology and Central Arousal Pathway Research', publishDate: '2026-04-05', readTime: 12 },
  { slug: 'glow-blend-skin-peptide-research', title: 'GLOW Blend: A Multi-Peptide Complex for Skin Biology and Photoprotection Research', publishDate: '2026-04-05', readTime: 16 },
  { slug: 'klow-blend-cognitive-research', title: 'KLOW Blend: BPC-157, TB-500, GHK-Cu & KPV — A Multi-Peptide Recovery and Repair Research Complex', publishDate: '2026-04-06', readTime: 16 },
  { slug: 'mass-spectrometry-peptide-identity-verification', title: 'Mass Spectrometry for Peptide Identity Verification: ESI-MS, MALDI-TOF, and How to Read a Mass Spec Report', publishDate: '2026-04-10', readTime: 8 },
  { slug: 'how-to-read-hplc-certificate-of-analysis', title: 'How to Read an HPLC Certificate of Analysis (CoA): UK Guide for Research Peptides', publishDate: '2026-05-03', readTime: 7 },
  { slug: 'bpc-157-vs-tb-500-comparison', title: 'BPC-157 vs TB-500: Which Peptide for Tissue Repair Research? Complete UK Comparison 2025', publishDate: '2026-05-03', readTime: 9 },
  { slug: 'complete-uk-peptide-guide-2025', title: 'Complete UK Research Peptide Guide 2025: BPC-157, TB-500, Semaglutide & GLP-1 Agonists for Laboratory Use', publishDate: '2026-05-03', readTime: 12 },
  { slug: 'research-peptides-uk', title: 'Research Peptides UK: The 2026 Sourcing Guide for British Laboratories', publishDate: '2026-05-24', readTime: 12 },
  { slug: 'bpc-157-vs-tb-500', title: 'BPC-157 vs TB-500: Mechanisms, Pathways and Research Comparison', publishDate: '2026-06-08', readTime: 12 },
  { slug: 'retatrutide-research-guide', title: 'Retatrutide Research Peptide: An Analytical Profile for UK Laboratories', publishDate: '2026-06-16', readTime: 16 },
  { slug: 'peptide-safety-legality-uk', title: 'The Safety and Legality of Buying Research Peptides in the UK', publishDate: '2026-06-19', readTime: 10 },
  { slug: 'what-are-peptides', title: 'What Are Peptides? A Comprehensive Guide for UK Researchers', publishDate: '2026-06-24', readTime: 13 },
  { slug: 'tirzepatide-vs-retatrutide-mechanism', title: 'Tirzepatide vs Retatrutide: Dual vs Triple Receptor Agonism in Research Models', publishDate: '2026-06-25', readTime: 11 },
  { slug: 'peptide-categories-uk-research', title: 'Peptide Categories in UK Laboratory Research: 7 Classes Studied in Modern Labs', publishDate: '2026-06-28', readTime: 12 },
  { slug: 'peptide-reconstitution-guide', title: 'Peptide Reconstitution Guide for UK Laboratories: Bacteriostatic Water Protocol', publishDate: '2026-07-05', readTime: 10 },
];
