/**
 * Homepage testimonials — approved customer reviews only.
 *
 * Renders nothing when there are no approved reviews, so the section never
 * shows an empty state. Client-side fetch (Firestore) after mount to keep
 * SSR/prerender output stable.
 */
import { useEffect, useState } from 'react';
import { Star, Quote } from 'lucide-react';
import { listApprovedReviews, averageRating, type Review } from '@/lib/reviews';

export default function Testimonials() {
  const [rows, setRows] = useState<Review[]>([]);

  useEffect(() => {
    let alive = true;
    listApprovedReviews(9)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { /* silent — optional section */ });
    return () => { alive = false; };
  }, []);

  if (!rows.length) return null;

  const avg = averageRating(rows);

  return (
    <section aria-labelledby="testimonials-heading" className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center">
          <h2 id="testimonials-heading" className="text-2xl sm:text-3xl font-bold text-white">
            What researchers say
          </h2>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-400">
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`w-4 h-4 ${n <= Math.round(avg) ? 'text-amber-400 fill-current' : 'text-slate-600'}`}
                />
              ))}
            </span>
            <span>
              {avg.toFixed(1)} / 5 from {rows.length} verified review{rows.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <ul className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col"
            >
              <Quote className="w-5 h-5 text-emerald-400/70" aria-hidden="true" />
              <div className="mt-3 flex items-center gap-0.5" aria-label={`${r.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-3.5 h-3.5 ${n <= r.rating ? 'text-amber-400 fill-current' : 'text-slate-700'}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
              {r.title && <p className="mt-2 text-sm font-semibold text-white">{r.title}</p>}
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed flex-1">{r.body}</p>
              <p className="mt-3 text-xs text-slate-500">
                {r.name}
                {r.productName ? ` — ${r.productName}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
