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
