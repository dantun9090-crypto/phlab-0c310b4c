// UK research-peptide regulatory guard.
// Use validateProductDescription / validateContent on any admin-controlled
// text (product description, article body, banner copy) before persisting.
// This is a defensive secondary check — the canonical compliance copy is
// still the "For Research Use Only" banner rendered in Layout.tsx.

export const FORBIDDEN_CLAIMS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\btreats?\b/i, reason: 'Medical claim: "treat"' },
  { pattern: /\bcures?\b/i, reason: 'Medical claim: "cure"' },
  { pattern: /\bheals?\b/i, reason: 'Medical claim: "heal"' },
  { pattern: /\bprevents?\b/i, reason: 'Medical claim: "prevent"' },
  { pattern: /\bdiagnoses?\b/i, reason: 'Medical claim: "diagnose"' },
  { pattern: /\bmitigates?\b/i, reason: 'Medical claim: "mitigate"' },
  { pattern: /\btherapy\b/i, reason: 'Implies therapeutic use' },
  { pattern: /\bmedicine\b/i, reason: 'Implies medicinal product' },
  { pattern: /\bdrug\b/i, reason: 'Implies medicinal product' },
  { pattern: /\bprescription\b/i, reason: 'Implies prescription product' },
  { pattern: /\bhuman consumption\b/i, reason: 'Forbidden — not for human use' },
  { pattern: /\binjectable\b/i, reason: 'Implies route of administration' },
  { pattern: /\bhow to (use|inject|take|dose|dosage|administer)\b/i, reason: 'Usage instructions' },
  { pattern: /\bweight loss\b/i, reason: 'Health claim' },
  { pattern: /\banti[- ]?aging\b/i, reason: 'Health claim' },
  { pattern: /\bmuscle growth\b/i, reason: 'Health claim' },
  { pattern: /\bdiabetes\b/i, reason: 'Disease reference' },
  { pattern: /\bcancer\b/i, reason: 'Disease reference' },
  { pattern: /\bclinical\b/i, reason: 'Implies clinical use' },
  // Extended for MHRA / FDA / Google & Bing Ads peptide policy
  { pattern: /\bwound[- ]?healing\b/i, reason: 'Therapeutic claim: wound healing' },
  { pattern: /\bhealing\b/i, reason: 'Therapeutic claim: healing' },
  { pattern: /\banti[- ]?inflammatory\b/i, reason: 'Therapeutic claim: anti-inflammatory' },
  { pattern: /\binflammatory bowel\b/i, reason: 'Disease reference: IBD' },
  { pattern: /\blipolysis\b/i, reason: 'Weight-loss adjacent claim' },
  { pattern: /\badipocyte\b/i, reason: 'Weight-loss adjacent claim' },
  { pattern: /\bfat (loss|burning|reduction)\b/i, reason: 'Weight-loss claim' },
  { pattern: /\befficacy\b/i, reason: 'Drug-style efficacy claim' },
  { pattern: /\bphotoaging\b/i, reason: 'Cosmetic/health claim' },
  { pattern: /\baged skin\b/i, reason: 'Cosmetic claim' },
  { pattern: /\bbarrier protection\b/i, reason: 'Therapeutic claim' },
  { pattern: /\b(collagen|protein) synthesis stimulation\b/i, reason: 'Functional/therapeutic claim' },
  { pattern: /\b(increases?|reduces?|enhances?|boosts?|improves?)\b[^.]{0,40}\b\d{1,3}\s?%/i, reason: 'Quantified efficacy claim' },
  { pattern: /\btherapeutic\b/i, reason: 'Implies therapeutic use' },
  { pattern: /\bsupplement\b/i, reason: 'Implies dietary supplement' },
  { pattern: /\bcosmetic\b(?!\s+(use|product|claim|claims|category))/i, reason: 'Implies cosmetic product' },
  { pattern: /\bfor (human|personal|self|home) use\b/i, reason: 'Implies human use' },
  { pattern: /\bsafe (for|to)\b/i, reason: 'Safety claim' },
];

export interface ComplianceResult {
  valid: boolean;
  violations: { match: string; reason: string }[];
}

export function validateContent(text: string | null | undefined): ComplianceResult {
  const value = (text ?? '').toString();
  if (!value.trim()) return { valid: true, violations: [] };
  const violations: { match: string; reason: string }[] = [];
  for (const { pattern, reason } of FORBIDDEN_CLAIMS) {
    const m = value.match(pattern);
    if (m) violations.push({ match: m[0], reason });
  }
  return { valid: violations.length === 0, violations };
}

export const validateProductDescription = validateContent;
