import { useMemo } from 'react';
import { MOCK_REVIEWS, type MockReview } from '../data/mockReviews';

/**
 * Deterministically assigns reviews to a product based on productId.
 * CRITICAL for pre-rendered sites: same product ID = same reviews every time.
 */
export function useDeterministicReviews(
  productId: string | number,
  previewCount: number = 2
): {
  previewReviews: MockReview[];
  allReviews: MockReview[];
  averageRating: number;
  totalCount: number;
} {
  return useMemo(() => {
    const hash = String(productId)
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    const shuffled = [...MOCK_REVIEWS];
    let seed = hash;
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const previewReviews = shuffled.slice(0, previewCount);
    const totalRating = MOCK_REVIEWS.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = Math.round((totalRating / MOCK_REVIEWS.length) * 10) / 10;

    return {
      previewReviews,
      allReviews: MOCK_REVIEWS,
      averageRating,
      totalCount: MOCK_REVIEWS.length,
    };
  }, [productId, previewCount]);
}
