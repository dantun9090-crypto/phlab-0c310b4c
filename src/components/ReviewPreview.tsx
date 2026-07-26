import React from 'react';
import { Star } from 'lucide-react';
import type { MockReview } from '../data/mockReviews';

interface ReviewPreviewProps {
  reviews: MockReview[];
  onClick?: () => void;
}

export const ReviewPreview: React.FC<ReviewPreviewProps> = ({ reviews, onClick }) => {
  if (!reviews || reviews.length === 0) return null;

  return (
    <div
      className={`mt-1 space-y-1 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-label={onClick ? 'Click to read all customer reviews' : undefined}
    >
      {reviews.map((review) => (
        <div key={review.id} className="flex items-start gap-1.5">
          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
            {Array.from({ length: review.rating }).map((_, i) => (
              <Star
                key={i}
                size={10}
                className="text-yellow-400 fill-yellow-400"
                strokeWidth={0}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 line-clamp-2 leading-snug">
            <span className="font-medium text-gray-300">{review.name.split(' ')[0]}</span>
            {' — '}
            {review.review}
          </p>
        </div>
      ))}
    </div>
  );
};
