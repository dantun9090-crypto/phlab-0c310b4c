import React from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  reviewCount?: number;
  onClick?: () => void;
}

const sizeMap = {
  sm: 14,
  md: 18,
  lg: 24,
};

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  max = 5,
  size = 'sm',
  showValue = true,
  reviewCount,
  onClick,
}) => {
  const starSize = sizeMap[size];
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;

  return (
    <div
      className={`flex items-center gap-1 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-center gap-0.5">
        {Array.from({ length: max }).map((_, i) => {
          const isFilled = i < fullStars || (i === fullStars && hasHalf);
          return (
            <Star
              key={i}
              size={starSize}
              className={isFilled ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}
              strokeWidth={1.5}
            />
          );
        })}
      </div>
      {showValue && (
        <span className="text-sm font-semibold text-gray-200 ml-1">
          {rating.toFixed(1)}
        </span>
      )}
      {reviewCount !== undefined && (
        <span className="text-xs text-gray-500 ml-0.5">
          ({reviewCount} reviews)
        </span>
      )}
    </div>
  );
};
