// Lightweight slug+title index for sitewide use (nav, footer, SEO link hubs,
// search lists). Importing this avoids pulling the full ~200KB articles
// dataset (with sections, references, related arrays) into bundles that only
// need a list of slugs and headlines.
//
// Keep in sync with `./articles.ts`. The Resources detail page itself still
// imports the full data — this file is for everywhere else.

export interface ArticleIndexEntry {
  slug: string;
  title: string;
}

export const ARTICLE_INDEX: ArticleIndexEntry[] = [
  { slug: 'what-is-retatrutide', title: 'What is Retatrutide and How Does It Work in Research?' },
  { slug: 'hplc-testing-explained', title: 'HPLC Testing Explained: How Peptide Purity Is Verified' },
  { slug: 'bpc-157-tissue-repair', title: 'BPC-157 in Tissue Repair Studies: Mechanisms and Research Findings' },
  { slug: 'tb-500-thymosin-beta-4', title: 'TB-500 and Thymosin Beta-4: Actin Sequestration and Tissue Regeneration Research' },
  { slug: 'retatrutide-vs-tirzepatide-vs-semaglutide', title: 'Retatrutide vs Tirzepatide vs Semaglutide: A Research Comparison' },
  { slug: 'ipamorelin-ghrp-research', title: 'Ipamorelin and the GHRP Class: Growth Hormone Secretagogue Research' },
  { slug: 'epithalon-telomere-research', title: 'Epithalon (Epitalon): Telomerase Activation and Cellular Ageing Research' },
  { slug: 'peptide-storage-reconstitution', title: 'Peptide Storage and Reconstitution: A Laboratory Protocol Guide' },
  { slug: 'melanotan-2-melanocortin-research', title: 'Melanotan II and Melanocortin Receptor Research' },
  { slug: 'tb-500-thymosin-beta-4-research', title: 'TB-500 and Thymosin Beta-4: Actin Sequestration and Tissue Remodelling Research' },
  { slug: 'ghk-cu-copper-peptide-research', title: 'GHK-Cu: The Copper Tripeptide at the Intersection of Wound Healing, Gene Regulation, and Anti-Ageing Biology' },
  { slug: 'ghk-cu-research-guide', title: 'GHK-Cu Peptide: A Technical Research Guide for UK Laboratories' },
  { slug: 'peptide-storage-lyophilisation-science', title: 'Peptide Storage Science: Lyophilisation, Reconstitution, and Stability Maximisation' },
  { slug: 'selank-anxiolytic-nootropic-peptide', title: 'Selank: The Synthetic Tuftsin Analogue at the Frontier of Anxiolytic Peptide Research' },
  { slug: 'epithalon-telomere-epigenetic-research', title: 'Epithalon: Telomerase Activation, Epigenetic Remodelling, and Longevity Research' },
  { slug: 'semax-cognitive-neuroprotective-research', title: 'Semax: ACTH-Derived Neuropeptide Research in Cognition, BDNF Signalling, and Neuroprotection' },
  { slug: 'cjc-1295-mod-grf-ghrh-research', title: 'CJC-1295 and MOD GRF(1-29): GHRH Analogue Research for GH Pulse Amplification' },
  { slug: 'follistatin-344-myostatin-inhibition-research', title: 'Follistatin-344: Myostatin Inhibition, Muscle Hypertrophy Research, and TGF-beta Superfamily Antagonism' },
  { slug: 'tirzepatide-dual-agonist-research', title: 'Tirzepatide: Dual GIP/GLP-1 Receptor Agonism and Its Role in Metabolic Research' },
  { slug: 'kpv-tripeptide-anti-inflammatory-research', title: 'KPV Tripeptide: Alpha-MSH-Derived Anti-Inflammatory Signalling in Preclinical Research' },
  { slug: 'mots-c-mitochondrial-derived-peptide', title: 'MOTS-C: The Mitochondrial-Derived Peptide Regulating Metabolic Homeostasis and Exercise Adaptation' },
  { slug: 'nad-nicotinamide-adenine-dinucleotide-research', title: 'NAD+: Cellular Energy Currency, Sirtuin Activation, and the Biochemistry of Ageing' },
  { slug: 'pt-141-bremelanotide-melanocortin-research', title: 'PT-141 (Bremelanotide): Melanocortin Receptor Pharmacology and Central Arousal Pathway Research' },
  { slug: 'glow-blend-skin-peptide-research', title: 'GLOW Blend: A Multi-Peptide Complex for Skin Biology and Photoprotection Research' },
  { slug: 'klow-blend-cognitive-research', title: 'KLOW Blend: BPC-157, TB-500, GHK-Cu & KPV — A Multi-Peptide Recovery and Repair Research Complex' },
  { slug: 'mass-spectrometry-peptide-identity-verification', title: 'Mass Spectrometry for Peptide Identity Verification: ESI-MS, MALDI-TOF, and How to Read a Mass Spec Report' },
  { slug: 'how-to-read-hplc-certificate-of-analysis', title: 'How to Read an HPLC Certificate of Analysis (CoA): UK Guide for Research Peptides' },
  { slug: 'bpc-157-vs-tb-500-comparison', title: 'BPC-157 vs TB-500: Which Peptide for Tissue Repair Research? Complete UK Comparison 2025' },
  { slug: 'complete-uk-peptide-guide-2025', title: 'Complete UK Research Peptide Guide 2025: BPC-157, TB-500, Semaglutide & GLP-1 Agonists for Laboratory Use' },
  { slug: 'research-peptides-uk', title: 'Research Peptides UK: The 2026 Sourcing Guide for British Laboratories' },
  { slug: 'bpc-157-vs-tb-500', title: 'BPC-157 vs TB-500: Mechanisms, Pathways and Research Comparison' },
  { slug: 'retatrutide-research-guide', title: 'Retatrutide Research Peptide: An Analytical Profile for UK Laboratories' },
  { slug: 'peptide-safety-legality-uk', title: 'The Safety and Legality of Buying Research Peptides in the UK' },
  { slug: 'what-are-peptides', title: 'What Are Peptides? A Comprehensive Guide for UK Researchers' },
];
