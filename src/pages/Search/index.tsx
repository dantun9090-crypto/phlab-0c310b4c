import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Search, FlaskConical, BookOpen, X, ChevronRight, ShoppingCart } from 'lucide-react';
import { subscribeToProducts } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';
import { articles } from '@/pages/Resources/data/articles';
import { nameToSlug } from '@/lib/seedProducts';
import { getProductImage } from '@/lib/productImages';
import { dispatchAddToCart } from '@/components/Layout';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { useSEO } from '@/hooks/useSEO';

// ── Highlight matching substring ──────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{
              background: 'rgba(59,130,246,0.3)',
              color: '#93c5fd',
              borderRadius: '3px',
              padding: '0 2px',
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: 'linear-gradient(155deg,#07121f,#040c18)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="h-36 w-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="p-4 space-y-2.5">
        <div className="h-4 rounded-lg w-3/4" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-3 rounded-lg w-1/2" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-3 rounded-lg w-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-3 rounded-lg w-2/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-8 rounded-xl mt-3" style={{ background: 'rgba(255,255,255,0.05)' }} />
      </div>
    </div>
  );
}

// ── Article result card ───────────────────────────────────────────────────────
function ArticleCard({ article, query }: { article: typeof articles[0]; query: string }) {
  return (
    <Link
      to={`/resources/${article.slug}`}
      className="group flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(155deg,#060d1e,#040918)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.border = '1px solid rgba(59,130,246,0.22)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.7),0 0 30px rgba(59,130,246,0.07)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.border = '1px solid rgba(255,255,255,0.06)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.5)';
      }}
    >
      {/* Category badge */}
      <div
        className="px-5 pt-4 pb-0 flex items-center gap-2"
      >
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded-lg"
          style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          <BookOpen className="w-2.5 h-2.5" />
          {article.category}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 px-5 pt-3 pb-5 gap-2">
        <h3
          className="font-bold text-[15px] leading-snug group-hover:text-blue-300 transition-colors"
          style={{ color: '#ddeeff' }}
        >
          <Highlight text={article.title} query={query} />
        </h3>
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#2a4a6e' }}>
          <Highlight text={article.subtitle} query={query} />
        </p>
        <div className="flex items-center gap-1 mt-auto pt-2 text-xs font-semibold" style={{ color: '#1e3a7a' }}>
          Read article
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

// ── Product result card ───────────────────────────────────────────────────────
function ProductCard({ product, query }: { product: Product; query: string }) {
  const slug = product.slug || nameToSlug(product.name ?? '');
  const imgUrl = getProductImage(product.name, product.imageUrl, product.images);
  const vars = product.variants ?? [];
  const firstVar = vars[0];
  const minPrice = vars.length
    ? Math.min(...vars.map(v => Number(v.price ?? 0)))
    : Number(product.price ?? 0);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!firstVar) return;
    const priceNum = Number(firstVar.price ?? product.price ?? 0);
    dispatchAddToCart({
      id: product.id!,
      name: product.name,
      dosage: firstVar.name,
      price: `£${priceNum.toFixed(2)}`,
      priceNum,
      quantity: 1,
      variantId: firstVar.id,
      variantName: firstVar.name,
      image: imgUrl,
    });
  };

  return (
    <Link
      to={`/products/${slug}`}
      className="group flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(155deg,#07121f,#040c18)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.border = '1px solid rgba(22,163,74,0.2)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.7),0 0 30px rgba(22,163,74,0.07)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.border = '1px solid rgba(255,255,255,0.06)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.5)';
      }}
    >
      {/* Image */}
      <div className="relative h-36 w-full" style={{ background: 'linear-gradient(145deg,#061a10,#04110a)', borderRadius: '1rem 1rem 0 0', overflow: 'hidden' }}>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            width="240"
            height="144"
            className="w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FlaskConical className="w-10 h-10 opacity-20" style={{ color: '#16a34a' }} />
          </div>
        )}
        {/* Popular badge */}
        {product.popular && (
          <span
            className="absolute top-2.5 left-2.5 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: 'linear-gradient(135deg,#b45309,#d97706)', color: '#fff', boxShadow: '0 2px 10px rgba(180,83,9,0.5)' }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
            Popular
          </span>
        )}
        <span
          className="absolute top-2.5 right-2.5 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(22,163,74,0.8)', color: '#fff' }}
        >
          HPLC ≥99%
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-2">
        {product.category && (
          <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#1d5c3a' }}>
            {product.category}
          </span>
        )}
        <h3 className="font-bold text-[15px] leading-snug group-hover:text-emerald-300 transition-colors" style={{ color: '#ddeeff' }}>
          <Highlight text={product.name ?? ''} query={query} />
        </h3>
        {product.description && (
          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#2a4a5e' }}>
            <Highlight text={product.description} query={query} />
          </p>
        )}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-base font-bold" style={{ color: '#4ade80' }}>
            from £{minPrice.toFixed(2)}
          </span>
          {firstVar && (
            <button
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: '1px solid rgba(74,222,128,0.2)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(22,163,74,0.5)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────
type FilterType = 'all' | 'products' | 'articles';

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
      style={
        active
          ? { background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.4)' }
          : { background: 'rgba(255,255,255,0.04)', color: '#3a5a82', border: '1px solid rgba(255,255,255,0.08)' }
      }
    >
      {label}
      <span
        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
        style={
          active
            ? { background: 'rgba(59,130,246,0.3)', color: '#bfdbfe' }
            : { background: 'rgba(255,255,255,0.06)', color: '#2a4a6a' }
        }
      >
        {count}
      </span>
    </button>
  );
}

// ── Main Search Page ──────────────────────────────────────────────────────────
export default function SearchPage() {
  useSEO('search', {
    title: 'Search Research Peptides | Pro Health Peptides UK',
    metaDescription: 'Search our full catalogue of HPLC-verified research peptides. Find BPC-157, Semaglutide, TB-500, Epithalon and more. UK delivery.',
    canonical: 'https://www.prohealthpeptides.co.uk/search',
  });

  const location = useLocation();
  const navigate = useNavigate();

  const queryFromUrl = new URLSearchParams(location.search).get('q') || '';
  const [inputValue, setInputValue] = useState(queryFromUrl);
  const [query, setQuery] = useState(queryFromUrl);
  const [filter, setFilter] = useState<FilterType>('all');

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Subscribe to products
  useEffect(() => {
    const unsub = subscribeToProducts((prods) => {
      setAllProducts(prods);
      setLoadingProducts(false);
    });
    return () => unsub();
  }, []);

  // Sync query from URL
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q') || '';
    setQuery(q);
    setInputValue(q);
  }, [location.search]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = inputValue.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
      setQuery(q);
    }
  }, [inputValue, navigate]);

  // Filter results
  const q = query.toLowerCase();
  const matchedProducts = q
    ? allProducts.filter(
        p =>
          p.name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      )
    : [];
  const matchedArticles = q
    ? articles.filter(
        a =>
          a.title.toLowerCase().includes(q) ||
          a.subtitle?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q)
      )
    : [];

  const visibleProducts = filter === 'articles' ? [] : matchedProducts;
  const visibleArticles = filter === 'products' ? [] : matchedArticles;
  const totalResults = matchedProducts.length + matchedArticles.length;

  // SEO
  useEffect(() => {
    document.title = query
      ? `Search: "${query}" — Pro Health Peptides`
      : 'Search — Pro Health Peptides';
    // Ensure page is indexed
    let metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.name = 'robots';
      document.head.appendChild(metaRobots);
    }
    metaRobots.content = 'index,follow';
    return () => {
      // Restore default on unmount
      if (metaRobots) metaRobots.content = 'index,follow';
    };
  }, [query]);

  return (
    <section id="search" className="min-h-screen" style={{ background: '#010608' }}>
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: '#030812', paddingTop: '4rem', paddingBottom: '2.5rem' }}>
        <AnimatedBackground variant="blue" />
        <div className="relative z-10 container mx-auto px-4 max-w-3xl text-center">
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#1e3a7a' }}>
            Search
          </p>
          <h1 className="text-3xl sm:text-4xl font-black mb-6" style={{ color: '#f0f6ff', letterSpacing: '-0.02em' }}>
            {query ? (
              <>Results for <span style={{ color: '#60a5fa' }}>"{query}"</span></>
            ) : (
              'Search Peptides & Research'
            )}
          </h1>

          {/* Search form */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-xl mx-auto">
            <div
              className="flex items-center flex-1 gap-3 px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: '#3a5a82' }} />
              <input
                type="search"
                autoFocus
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Search peptides, articles, guides..."
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: '#f0f6ff' }}
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={() => { setInputValue(''); navigate('/search'); }}
                  aria-label="Clear"
                  className="text-[#5a80a6] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-5 py-3 rounded-2xl text-sm font-semibold transition-all shrink-0"
              style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff', boxShadow: '0 4px 20px rgba(37,99,235,0.35)' }}
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Results area */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {query && (
          <>
            {/* Filter chips + result count */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <FilterChip
                label="All"
                count={totalResults}
                active={filter === 'all'}
                onClick={() => setFilter('all')}
              />
              <FilterChip
                label="Peptides"
                count={matchedProducts.length}
                active={filter === 'products'}
                onClick={() => setFilter('products')}
              />
              <FilterChip
                label="Articles"
                count={matchedArticles.length}
                active={filter === 'articles'}
                onClick={() => setFilter('articles')}
              />
              {!loadingProducts && totalResults > 0 && (
                <span className="ml-auto text-xs" style={{ color: '#1e3a5a' }}>
                  {totalResults} result{totalResults !== 1 ? 's' : ''} found
                </span>
              )}
            </div>

            {/* Loading skeleton */}
            {loadingProducts && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FlaskConical className="w-4 h-4" style={{ color: '#16a34a' }} />
                  <span className="text-sm font-semibold" style={{ color: '#1d5c3a' }}>Peptides</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              </div>
            )}

            {/* Products section */}
            {!loadingProducts && filter !== 'articles' && (
              <div className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                  <FlaskConical className="w-4 h-4" style={{ color: '#16a34a' }} />
                  <span className="text-sm font-semibold" style={{ color: '#1d5c3a' }}>
                    Peptides
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(22,163,74,0.12)', color: '#4ade80' }}
                  >
                    {visibleProducts.length}
                  </span>
                </div>
                {visibleProducts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {visibleProducts.map(p => (
                      <ProductCard key={p.id} product={p} query={query} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm py-6 text-center rounded-xl" style={{ color: '#1e3a5a', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    No peptides matched "{query}"
                  </p>
                )}
              </div>
            )}

            {/* Articles section */}
            {filter !== 'products' && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4" style={{ color: '#3b82f6' }} />
                  <span className="text-sm font-semibold" style={{ color: '#1e3a7a' }}>
                    Research Articles
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd' }}
                  >
                    {visibleArticles.length}
                  </span>
                </div>
                {visibleArticles.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleArticles.map(a => (
                      <ArticleCard key={a.slug} article={a} query={query} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm py-6 text-center rounded-xl" style={{ color: '#1e3a5a', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    No articles matched "{query}"
                  </p>
                )}
              </div>
            )}

            {/* Zero results */}
            {!loadingProducts && totalResults === 0 && (
              <div className="text-center py-16">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Search className="w-7 h-7" style={{ color: '#1e3a5a' }} />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: '#9cb8d9' }}>
                  No results for "{query}"
                </h2>
                <p className="text-sm mb-6" style={{ color: '#1e3a5a' }}>
                  Try a different keyword — e.g. "BPC-157", "NAD+", "tissue repair"
                </p>
                <Link
                  to="/products"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff' }}
                >
                  <FlaskConical className="w-4 h-4" />
                  Browse all peptides
                </Link>
              </div>
            )}
          </>
        )}

        {/* Empty state — no query yet */}
        {!query && (
          <div className="text-center py-16">
            <Search className="w-10 h-10 mx-auto mb-4 opacity-20" style={{ color: '#9cb8d9' }} />
            <p className="text-base" style={{ color: '#1e3a5a' }}>
              Enter a search term above to find peptides and research articles.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
