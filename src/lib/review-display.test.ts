import { describe, expect, it } from 'vitest';
import { publicReviewProductLabel, publicReviewText } from './review-display';

describe('public review display', () => {
  it('hides VIP-only product names in the product label', () => {
    expect(publicReviewProductLabel('Tirzepatide Research Peptide')).toBe('Research peptide');
    expect(publicReviewProductLabel('Retatrutide')).toBe('Research peptide');
  });

  it('keeps public product names unchanged', () => {
    expect(publicReviewProductLabel('BPC-157 Research Peptide')).toBe('BPC-157 Research Peptide');
  });

  it('replaces VIP-only product names in review text', () => {
    expect(publicReviewText('Retatrutide arrived fast, TIRZEPATIDE too')).toBe('this peptide arrived fast, this peptide too');
  });
});
