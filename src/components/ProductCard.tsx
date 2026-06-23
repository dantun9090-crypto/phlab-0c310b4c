import { useState } from 'react';
import { CheckCircle2, ShoppingCart, Edit2, FlaskConical, ShieldCheck, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProductImage } from '@/lib/productImages';
import type { Product } from '@/lib/firebase';
import { nameToSlug } from '@/lib/seedProducts';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cfImgProps } from '@/lib/cf-image';
import { CoaModal } from './CoaModal';


interface ProductCardProps {
  product: Product;
  index?: number;
  selectedVariantId: string;
  isAdded: boolean;
  isAdmin?: boolean;
  highlight?: string;
  isBestSeller?: boolean;
  bestSellerRank?: number;
  onVariantSelect: (productId: string, variantId: string) => void;
  onAddToCart: (product: Product) => void;
  onEdit?: (product: Product) => void;
}

/** Wraps matching substrings in a highlighted <mark> */
function HighlightText({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ background: 'rgba(16,185,129,0.25)', color: '#4ade80', borderRadius: '3px', padding: '0 2px' }}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  'tissue-repair': '#10b981',
  'metabolic-signaling': '#3b82f6',
  'cellular-aging': '#f59e0b',
  'neurological': '#a855f7',
  'melanin': '#ec4899',
  'blends': '#06b6d4',
  'accessories': '#64748b',
};

export function ProductCard({
  product,
  index = 0,
  selectedVariantId,
  isAdded,
  isAdmin,
  highlight,
  isBestSeller,
  bestSellerRank,
  onVariantSelect,
  onAddToCart,
  onEdit,
}: ProductCardProps) {
  const { id, name, category, variants = [], stock, imageUrl, images } = product;
  const vars = variants.length > 0 ? variants : [{ id: 'default', dosage: '', price: product.price ?? 0 }];
  const selectedVariant = vars.find(v => v.id === selectedVariantId) || vars[0];
  const price = selectedVariant.price ?? 0;
  const isOutOfStock = (stock ?? 0) < 1;
  const slug = nameToSlug(name);
  const imgUrl = getProductImage(name, imageUrl, images);
  const categoryColor = CATEGORY_COLORS[category || ''] || '#3b82f6';
  const revealRef = useScrollReveal(index * 60);
  // First 3 cards are likely above-fold — reveal immediately to avoid LCP/CLS penalty
  const isAboveFold = (index ?? 0) < 3;

  const getProductAlt = (n: string, cat?: string) => {
    const c = cat?.replace(/-/g, ' ') || 'research peptide';
    // MHRA-safe: vial sizes / variant labels only (product attributes).
    // Never include per-use dosages, frequencies, or administration instructions.
    const sizes = vars
      .map((v: any) => v.name || v.dosage)
      .filter(Boolean)
      .slice(0, 4)
      .join(' / ');
    const sizePart = sizes ? ` ${sizes} vial` : ' vial';
    return `${n} —${sizePart} of lyophilised ${c} for laboratory research use only, ≥99% HPLC-verified with batch Certificate of Analysis — PH Labs UK research reagent (not for human consumption)`;
  };

  return (
    <div
      ref={isAboveFold ? undefined : revealRef}
      data-product-card={slug || product.id || 'product'}
      className={`group relative rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ${isAboveFold ? '' : 'scroll-reveal'}`}
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,185,129,0.2)';
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)';
      }}
    >
      {/* Image area */}
      <Link to={`/products/${slug}`} className="relative block overflow-hidden" style={{ aspectRatio: '4/3', background: '#030a14' }}>
        {imgUrl ? (
          <img
            {...cfImgProps(imgUrl, { widths: [400, 600, 800, 1200, 1600], sizes: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px', quality: 92 })}
            alt={getProductAlt(name, product.category)}
            loading={isAboveFold ? "eager" : "lazy"}
            fetchPriority={isAboveFold ? "high" : "auto"}
            width="288"
            height="216"
            decoding="async"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
            className="transition-transform duration-700 group-hover:scale-105"
          />

        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FlaskConical style={{ width: 48, height: 48, color: 'rgba(16,185,129,0.2)' }} />
          </div>
        )}

        {/* Top left — Category badge */}
        {category && (
          <div className="absolute top-3 left-3">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{
              background: `${categoryColor}15`,
              border: `1px solid ${categoryColor}30`,
              color: categoryColor,
            }}>
              {category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          </div>
        )}

        {/* Top right — HPLC badge */}
        <div className="absolute top-3 right-3">
          <span className="px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1" style={{
            background: 'rgba(4,12,24,0.85)',
            border: '1px solid rgba(16,185,129,0.3)',
            color: '#4ade80',
          }}>
            <ShieldCheck style={{ width: 10, height: 10 }} />
            ≥99%
          </span>
        </div>

        {/* Best seller badge */}
        {isBestSeller && bestSellerRank && (
          <div className="absolute bottom-3 left-3">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1" style={{
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(245,158,11,0.4)',
              color: '#fbbf24',
            }}>
              #{bestSellerRank} Best Seller
            </span>
          </div>
        )}

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.72)' }}>
            <span className="px-4 py-2 rounded-xl font-bold text-sm" style={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
              Out of Stock
            </span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <Link to={`/products/${slug}`}>
          <h3 className="font-bold text-base leading-snug mb-1 transition-colors group-hover:text-emerald-400" style={{ color: '#e4f0ff' }}>
            <HighlightText text={name} query={highlight} />
          </h3>
        </Link>

        <p className="text-xs leading-relaxed" style={{ color: '#7a98b8' }}>
          HPLC-verified research compound · Certificate of Analysis included
        </p>

        {/* Variant picker — always show if there are any variants */}
        {vars.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {vars.map(v => {
              const isSelected = v.id === selectedVariantId;
              return (
                <button
                  key={v.id}
                  onClick={e => {
                    e.preventDefault();
                    onVariantSelect(id, v.id);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200"
                  style={isSelected ? {
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.35)',
                    color: '#4ade80',
                  } : {
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#9cb8d9',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
                      (e.target as HTMLElement).style.color = '#8db4d8';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                      (e.target as HTMLElement).style.color = '#9cb8d9';
                    }
                  }}
                >
                  {(v as any).name || (v as any).dosage
                    ? `${(v as any).name || (v as any).dosage} — £${Number((v as any).price).toFixed(2)}`
                    : `£${Number((v as any).price).toFixed(2)}`}
                </button>
              );
            })}
          </div>
        )}

        {/* Price + CTA row */}
        <div className="flex items-center justify-between gap-3 mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ color: '#f0f8ff', fontSize: '1.2rem', fontWeight: 800, lineHeight: 1 }}>
              £{Number(price).toFixed(2)}
            </div>
            {vars.length > 1 && ((selectedVariant as any).name || (selectedVariant as any).dosage) && (
              <div className="text-xs mt-0.5" style={{ color: '#3a5a82' }}>
                {(selectedVariant as any).name || (selectedVariant as any).dosage}
              </div>
            )}
          </div>

          {/* Add to Cart button */}
          <button
            onClick={e => {
              e.preventDefault();
              if (!isOutOfStock && !isAdded) onAddToCart(product);
            }}
            disabled={isOutOfStock || isAdded}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-200"
            style={isAdded ? {
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.3)',
              color: '#4ade80',
              cursor: 'default',
            } : isOutOfStock ? {
              background: 'transparent',
              color: '#3a5a82',
              border: '1px solid rgba(255,255,255,0.05)',
              cursor: 'not-allowed',
            } : {
              background: 'linear-gradient(135deg, #0ea572, #10b981, #059669)',
              color: '#fff',
              border: '1px solid rgba(74,222,128,0.2)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              if (!isOutOfStock && !isAdded) {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(74,222,128,0.38)';
              }
            }}
            onMouseLeave={e => {
              if (!isOutOfStock && !isAdded) {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(74,222,128,0.2)';
              }
            }}
          >
            {isAdded ? (
              <><CheckCircle2 className="w-4 h-4" /> Added</>
            ) : isOutOfStock ? (
              'Unavailable'
            ) : (
              <><ShoppingCart className="w-4 h-4" /> Add</>
            )}
          </button>
        </div>

        {/* Admin quick edit */}
        {isAdmin && onEdit && (
          <button
            onClick={() => onEdit(product)}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
            style={{
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.25)',
              color: '#60a5fa',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.15)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.1)'}
          >
            <Edit2 style={{ width: 12, height: 12 }} />
            Edit Product
          </button>
        )}
      </div>
    </div>
  );
}
