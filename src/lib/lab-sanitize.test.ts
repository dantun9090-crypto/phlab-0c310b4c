import { describe, it, expect } from 'vitest';
import { sanitizeLab } from './lab-sanitize';
import { validateContent } from './peptide-compliance';

describe('sanitizeLab', () => {
  const cases = [
    'BPC-157 treats wound healing in inflammatory bowel disease models.',
    'Tirzepatide weight loss efficacy: increases satiety by 85%.',
    'GHK-Cu accelerates healing and anti-aging in aged skin.',
    'How to inject this peptide for human use — safe to administer.',
    'Clinical trial showed therapy reduced TNF-α by 65%.',
    'Lipolysis and adipocyte lipid metabolism modulation in obesity.',
  ];

  for (const text of cases) {
    it(`sanitizes: ${text.slice(0, 40)}...`, () => {
      const out = sanitizeLab(text);
      const result = validateContent(out);
      if (!result.valid) {
        // eslint-disable-next-line no-console
        console.error('Remaining violations:', result.violations, '→', out);
      }
      expect(result.valid).toBe(true);
    });
  }

  it('returns empty for null/empty', () => {
    expect(sanitizeLab(null)).toBe('');
    expect(sanitizeLab(undefined)).toBe('');
    expect(sanitizeLab('')).toBe('');
  });
});
