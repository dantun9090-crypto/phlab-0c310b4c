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
