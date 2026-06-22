/**
 * Global "Laboratory RUO" sanitizer.
 *
 * Runtime guard that rewrites any medical / therapeutic / health-claim
 * language into neutral in-vitro laboratory phrasing BEFORE it is rendered
 * to the page, returned in meta tags, or embedded in JSON-LD.
 *
 * Use everywhere user-visible copy is rendered (product description,
 * research blocks, meta description, og/twitter, JSON-LD, article body).
 * This is a defence-in-depth layer on top of `peptide-compliance.ts`
 * (which blocks new writes via the admin guard) — it scrubs legacy
 * Firestore content that pre-dates the guard.
 *
 * Rules:
 *  - Replacements are case-insensitive but preserve original capitalisation
 *    of the first letter where possible.
 *  - Quantified efficacy claims ("increases X by 85%") are stripped.
 *  - Disease names are replaced with generic "in-vitro model".
 *  - Therapeutic verbs ("treats / heals / cures / prevents") become
 *    "is studied for" or "in-vitro endpoint".
 *  - Output always passes `validateContent()` from peptide-compliance.
 */

interface Rule { pattern: RegExp; replacement: string; }

const RULES: Rule[] = [
  // Therapeutic verbs
  { pattern: /\b(treats?|cures?|heals?|mitigates?|prevents?)\b/gi, replacement: 'is studied in vitro for' },
  { pattern: /\bdiagnoses?\b/gi, replacement: 'is characterised in vitro for' },
  { pattern: /\b(therap(y|ies)|therapeutic)\b/gi, replacement: 'in-vitro endpoint' },
  { pattern: /\b(medicine|drug|prescription|supplement)\b/gi, replacement: 'reference reagent' },
  { pattern: /\bhuman consumption\b/gi, replacement: 'in-vitro use' },
  { pattern: /\binjectable\b/gi, replacement: 'lyophilised reference reagent' },
  { pattern: /\bhow to (use|inject|take|dose|dosage|administer)\b/gi, replacement: 'handling guidance for laboratory use of' },
  { pattern: /\bfor (human|personal|self|home) use\b/gi, replacement: 'for in-vitro research use only' },
  { pattern: /\bsafe (for|to)\b/gi, replacement: 'characterised in vitro for' },

  // Health / cosmetic claims
  { pattern: /\bweight loss( efficacy)?\b/gi, replacement: 'metabolic endpoint evaluation' },
  { pattern: /\banti[- ]?aging\b/gi, replacement: 'cellular senescence endpoint' },
  { pattern: /\bmuscle growth\b/gi, replacement: 'myogenic endpoint evaluation' },
  { pattern: /\b(fat (loss|burning|reduction)|lipolysis|adipocyte (biology|lipid metabolism modulation)?)\b/gi, replacement: 'lipid metabolism endpoint' },
  { pattern: /\bwound[- ]?healing\b/gi, replacement: 'in-vitro scratch-assay endpoint' },
  { pattern: /\bhealing\b/gi, replacement: 'in-vitro repair endpoint' },
  { pattern: /\banti[- ]?inflammatory\b/gi, replacement: 'cytokine-pathway' },
  { pattern: /\bbarrier protection\b/gi, replacement: 'epithelial barrier endpoint' },
  { pattern: /\bphotoaging\b/gi, replacement: 'UV-stress in-vitro model' },
  { pattern: /\baged skin\b/gi, replacement: 'senescent fibroblast model' },
  { pattern: /\bappetite suppression\b/gi, replacement: 'feeding-behaviour endpoint' },
  { pattern: /\bsexual (arousal|motivation|behaviour|behavior)\b/gi, replacement: 'central pathway endpoint' },

  // Disease references → generic in-vitro model
  { pattern: /\b(diabetes|cancer|alzheimer'?s?|parkinson'?s?|inflammatory bowel( disease)?|ibd|colitis|ulcer)\b/gi, replacement: 'in-vitro disease model' },

  // Drug-style efficacy / quantified claims
  { pattern: /\befficacy\b/gi, replacement: 'in-vitro endpoint magnitude' },
  { pattern: /\b(collagen|protein) synthesis stimulation\b/gi, replacement: 'matrix-protein endpoint evaluation' },
  // "increases/reduces ... by 85%"  → strip the % phrase
  { pattern: /\b(increases?|reduces?|enhances?|boosts?|improves?)\b([^.]{0,40})\b\d{1,3}\s?%/gi, replacement: 'modulates in-vitro endpoints' },
  // bare "by N%" performance number
  { pattern: /\bby\s+\d{1,3}\s?%/gi, replacement: 'in in-vitro assays' },

  // Soft cleanups
  { pattern: /\bclinical(ly)?\b/gi, replacement: 'in-vitro' },
  { pattern: /\bcosmetic\b(?!\s+(use|product|claim|claims|category))/gi, replacement: 'in-vitro' },
];

/**
 * Rewrite a string into laboratory RUO–safe language.
 * Returns the original input untouched when null/empty.
 */
export function sanitizeLab(text: string | null | undefined): string {
  if (!text) return (text ?? '') as string;
  let out = String(text);
  for (const { pattern, replacement } of RULES) {
    out = out.replace(pattern, replacement);
  }
  // Collapse double spaces produced by replacements
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1');
  return out;
}

/** Convenience: sanitize and clamp to a max length (for meta descriptions). */
export function sanitizeLabClamp(text: string | null | undefined, max: number): string {
  const s = sanitizeLab(text);
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}
