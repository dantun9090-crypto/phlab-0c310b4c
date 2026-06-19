import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ArrowRight } from 'lucide-react';
import type { RecentlyViewedItem } from '@/hooks/useRecentlyViewed';
import { getProductImage } from '@/lib/productImages';

interface Props {
  items: RecentlyViewedItem[];
  currentProductId?: string;
  variant?: 'full' | 'compact'; // full = product page, compact = cart sidebar
}

export default function RecentlyViewedProducts({ items, currentProductId, variant = 'full' }: Props) {
  const filtered = items.filter(i => i.id !== currentProductId);
  if (filtered.length === 0) return null;

  if (variant === 'compact') {
    return (
      <div className="mt-6 pt-5 border-t border-white/[0.07]">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3.5 h-3.5 text-[#9cb8d9]" />
          <span className="text-[11px] font-bold text-[#9cb8d9] uppercase tracking-widest">Recently Viewed</span>
        </div>
        <div className="flex flex-col gap-2">
          {filtered.slice(0, 4).map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={`/products/${item.slug}`}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] hover:border-white/[0.12] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#0b1a30]">
                  <img
                    src={getProductImage(item.name, item.imageUrl)}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    width="40"
                    height="40"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#d0e4f8] text-xs font-semibold leading-tight truncate group-hover:text-white transition-colors">{item.name}</p>
                  <p className="text-emerald-400 text-xs font-bold mt-0.5">£{item.price.toFixed(2)}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#3a5a82] group-hover:text-blue-400 transition-colors flex-shrink-0" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // Full variant — product page
  return (
    <section id="recently-viewed" className="mt-16 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Clock className="w-4 h-4 text-blue-400" />
        </div>
        <h2 className="text-lg font-bold text-[#eef4ff]">Recently Viewed</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {filtered.slice(0, 6).map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <Link
              to={`/products/${item.slug}`}
              className="group block rounded-2xl border border-white/[0.07] hover:border-blue-500/30 bg-[#0b1a30]/70 hover:bg-[#0d1f38] transition-all duration-300 overflow-hidden"
            >
              <div className="aspect-square bg-[#060f1e] overflow-hidden">
                <img
                  src={getProductImage(item.name, item.imageUrl)}
                  alt={`${item.name} vial`}
                  loading="lazy"
                  decoding="async"
                  width="300"
                  height="300"
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-3">
                <p className="text-[#d0e4f8] text-sm font-semibold leading-tight line-clamp-2 group-hover:text-white transition-colors mb-1.5">{item.name}</p>
                <div className="flex items-center justify-between">
                  <span className="text-blue-400 font-bold text-sm">£{item.price.toFixed(2)}</span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-400/10 px-2 py-0.5 rounded-full">≥99% HPLC</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
