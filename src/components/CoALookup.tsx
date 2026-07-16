import { useEffect, useMemo, useState } from 'react';
import { FileCheck, Search, ExternalLink, AlertCircle } from 'lucide-react';
import type { Product } from '@/lib/firebase';
import PuritySignature from './PuritySignature';

/**
 * "Verify your batch" widget — homepage between products and footer.
 * Uses the existing per-product CoA model (no new Firestore schema):
 * user searches by product name / slug printed on the vial label,
 * we show purity + a link to the current CoA PDF.
 */
type Match = {
  slug: string;
  name: string;
  purity?: string;
  coaUrl?: string | null;
};

function pickCoaUrl(p: Product): string | null {
  const anyP = p as unknown as Record<string, unknown>;
  const candidates = [
    'coaUrl', 'coaPdfUrl', 'coaPdf', 'labReportUrl', 'certificateUrl',
  ];
  for (const k of candidates) {
    const v = anyP[k];
    if (typeof v === 'string' && v.length > 4) return v;
  }
  return null;
}

export default function CoALookup() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      import('@/lib/firebase')
        .then(({ getAllProducts }) => getAllProducts())
        .then(list => { if (!cancelled) setProducts(list); })
        .catch(() => { if (!cancelled) setProducts([]); });
    };
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (ric) ric(load, { timeout: 3000 });
    else setTimeout(load, 800);
    return () => { cancelled = true; };
  }, []);

  const match: Match | null = useMemo(() => {
    if (!submitted || !q.trim() || !products) return null;
    const needle = q.trim().toLowerCase();
    const hit = products.find(p => {
      const slug = (p.slug || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return slug === needle
        || name === needle
        || slug.includes(needle)
        || name.includes(needle);
    });
    if (!hit) return null;
    return {
      slug: hit.slug,
      name: hit.name,
      purity: hit.purity,
      coaUrl: pickCoaUrl(hit),
    };
  }, [submitted, q, products]);

  const notFound = submitted && q.trim() && products && !match;

  return (
    <section
      aria-labelledby="coa-lookup-title"
      className="relative mx-auto my-16 px-4 sm:px-6 max-w-3xl"
    >
      <div
        className="rounded-2xl p-6 sm:p-8"
        style={{
          background:
            'linear-gradient(135deg, rgba(6,20,40,0.92) 0%, rgba(3,10,20,0.98) 100%)',
          border: '1px solid rgba(16,185,129,0.18)',
          boxShadow: '0 20px 60px -20px rgba(16,185,129,0.15)',
        }}
      >
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.18))',
              border: '1px solid rgba(16,185,129,0.28)',
            }}
          >
            <FileCheck className="w-5 h-5" style={{ color: '#4ade80' }} />
          </div>
          <div className="min-w-0">
            <h2
              id="coa-lookup-title"
              className="font-display text-xl sm:text-2xl font-bold"
              style={{ color: '#f0f8ff', letterSpacing: '-0.01em' }}
            >
              Verify your batch
            </h2>
            <p className="text-sm mt-1" style={{ color: '#9cb8d9' }}>
              Enter the compound name printed on your vial to see the current HPLC
              purity and open its Certificate of Analysis.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <label className="sr-only" htmlFor="coa-lookup-input">Compound name or slug</label>
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: '#5a80a6' }}
            />
            <input
              id="coa-lookup-input"
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setSubmitted(false); }}
              placeholder="e.g. BPC-157, Retatrutide, tb-500"
              autoComplete="off"
              className="w-full pl-10 pr-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: '#e4f0ff',
                minHeight: 48,
              }}
            />
          </div>
          <button
            type="submit"
            className="px-5 py-3 rounded-xl font-bold text-sm text-white"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 60%, #06b6d4 100%)',
              minHeight: 48,
            }}
          >
            Look up
          </button>
        </form>

        {match && (
          <div
            className="mt-5 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.22)',
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#4ade80' }}>
                Match found
              </div>
              <div className="mt-1 font-semibold text-base" style={{ color: '#e4f0ff' }}>
                {match.name}
              </div>
              <div className="mt-2">
                <PuritySignature
                  purity={match.purity || '≥99%'}
                  width={120}
                  height={32}
                  showLabel={true}
                />
              </div>
            </div>
            {match.coaUrl ? (
              <a
                href={match.coaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm"
                style={{
                  background: 'rgba(16,185,129,0.14)',
                  border: '1px solid rgba(16,185,129,0.35)',
                  color: '#4ade80',
                }}
              >
                Open CoA PDF <ExternalLink className="w-4 h-4" />
              </a>
            ) : (
              <a
                href={`/products/${match.slug}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#a8c8e8',
                }}
              >
                View product page <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        )}

        {notFound && (
          <div
            className="mt-5 rounded-xl p-4 flex items-start gap-3"
            style={{
              background: 'rgba(251,146,60,0.06)',
              border: '1px solid rgba(251,146,60,0.25)',
            }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#fb923c' }} />
            <div className="text-sm" style={{ color: '#f3d5b5' }}>
              We couldn&rsquo;t find that batch. Double-check the compound name on
              your vial, or{' '}
              <a href="/contact" className="underline" style={{ color: '#fdba74' }}>
                contact support
              </a>{' '}
              and quote the lot number — we&rsquo;ll email the matching CoA.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
