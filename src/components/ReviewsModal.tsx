import React, { useEffect, useRef } from 'react';
import { X, Star } from 'lucide-react';
import type { MockReview } from '../data/mockReviews';

interface ReviewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviews: MockReview[];
  averageRating: number;
  totalCount: number;
  productName?: string;
}

export const ReviewsModal: React.FC<ReviewsModalProps> = ({
  isOpen,
  onClose,
  reviews,
  averageRating,
  totalCount,
  productName,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => closeButtonRef.current?.focus(), 50);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Customer reviews${productName ? ` for ${productName}` : ''}`}
    >
      <div className="w-full sm:w-auto sm:max-w-2xl sm:mx-4 bg-[#0b1220] sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] sm:max-h-[80vh] flex flex-col border border-white/10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Customer Reviews</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={i < Math.round(averageRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-white">
                {averageRating.toFixed(1)} out of 5
              </span>
              <span className="text-xs text-gray-500">
                ({totalCount} reviews)
              </span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close reviews"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="pb-4 border-b border-white/5 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-gray-200">
                  {review.name}
                </span>
                <span className="text-xs text-gray-500">
                  {review.date}
                </span>
              </div>
              <div className="flex items-center gap-0.5 mb-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    className={i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}
                  />
                ))}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {review.review}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
