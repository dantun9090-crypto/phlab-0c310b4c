import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { FlaskConical, ChevronRight, ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { subscribeToProducts } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';
import { ProductCard } from '@/components/ProductCard';
import { dispatchAddToCart } from '@/components/Layout';
import { useSEO } from '@/hooks/useSEO';
import { AnimatedBackground } from '@/components/AnimatedBackground';

// Route-level page components must remain eagerly imported; no empty Suspense
// fallbacks around routed content after publish.

// ─── Category config ──────────────────────────────────────────────────────────
interface CategoryConfig {
  label: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  color: string;
  icon: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'tissue-repair': {
    label: 'Tissue Repair',
    description: 'Compounds studied in preclinical models of musculoskeletal and connective tissue repair. BPC-157 and TB-500 are among the most investigated peptides for tendon, ligament, and gastric tissue pathways.',
    seoTitle: 'Tissue Repair Peptides UK | PH Labs',
    seoDescription: 'HPLC-verified tissue repair research peptides — BPC-157, TB-500 and more. ≥99% purity, CoA included, free UK shipping over £50. Laboratory research use only.',
    seoKeywords: 'tissue repair peptides UK, BPC-157 buy UK, TB-500 research peptide, musculoskeletal research compounds',
    color: '#10b981',
    icon: '🔬',
  },
  'metabolic-signaling': {
    label: 'Metabolic / GLP-1',
    description: 'GLP-1, GIP, and glucagon receptor agonists for metabolic signalling research. Semaglutide, Tirzepatide, and Retatrutide supplied for laboratory research use only.',
    seoTitle: 'GLP-1 Research Peptides UK | PH Labs',
    seoDescription: 'HPLC-verified GLP-1 and metabolic research peptides — Semaglutide, Tirzepatide, Retatrutide. ≥99% purity, CoA included. UK delivery. Lab use only.',
    seoKeywords: 'GLP-1 peptides UK, Semaglutide research UK, Tirzepatide buy UK, metabolic peptides research',
    color: '#3b82f6',
    icon: '⚗️',
  },
  'cellular-aging': {
    label: 'Longevity',
    description: 'Telomere and mitochondrial research compounds including Epithalon and MOTS-c. Investigated in senescence and epigenetic longevity models.',
    seoTitle: 'Longevity Research Peptides UK | PH Labs',
    seoDescription: 'UK supplier of longevity and anti-ageing research peptides — Epithalon, MOTS-c and more. HPLC-tested, ≥99% purity, CoA included. Laboratory research use only.',
    seoKeywords: 'longevity peptides UK, Epithalon buy UK, MOTS-c research peptide, anti-ageing compounds UK',
    color: '#f59e0b',
    icon: '⏳',
  },
  neurological: {
    label: 'Nootropic',
    description: 'Semax, Selank, and related compounds investigated for BDNF modulation and cognitive pathway research in preclinical neurological models.',
    seoTitle: 'Nootropic Research Peptides UK | PH Labs',
    seoDescription: 'Buy nootropic and neuropeptide research compounds in the UK — Semax, Selank and more. HPLC-verified, ≥99% purity, CoA included. Laboratory research use only.',
    seoKeywords: 'nootropic peptides UK, Semax buy UK, Selank research peptide, cognitive research compounds UK',
    color: '#a855f7',
    icon: '🧠',
  },
  melanin: {
    label: 'Melanocortin',
    description: 'MC1R and MC4R agonists including Melanotan II and PT-141. Studied in photoprotection and melanin synthesis research models.',
    seoTitle: 'Melanocortin Peptides UK | PH Labs',
    seoDescription: 'HPLC-tested melanocortin research peptides UK — Melanotan II, PT-141 and more. ≥99% purity, CoA included, UK dispatch. For laboratory research use only.',
    seoKeywords: 'melanocortin peptides UK, Melanotan II UK, PT-141 research, MC1R agonist research peptide',
    color: '#ec4899',
    icon: '🌟',
  },
  blends: {
    label: 'Blends',
    description: 'Pre-formulated compound combinations for multi-pathway laboratory research protocols. Each blend is HPLC-verified and supplied with batch documentation.',
    seoTitle: 'Research Peptide Blends UK | PH Labs',
    seoDescription: 'Research peptide blends for multi-pathway laboratory protocols. HPLC-verified, batch documented, CoA included. UK delivery. For laboratory research use only.',
    seoKeywords: 'peptide blends UK, research compound combinations, multi-pathway peptide protocols UK',
    color: '#06b6d4',
    icon: '🧪',
  },
  accessories: {
    label: 'Accessories',
    description: 'Bacteriostatic water, syringes, and reconstitution accessories for peptide research protocols. Supplied for laboratory use only.',
    seoTitle: 'Peptide Research Accessories UK | PH Labs',
    seoDescription: 'Laboratory accessories for peptide research — bacteriostatic water, syringes, reconstitution kits. UK delivery. For laboratory research use only.',
    seoKeywords: 'bacteriostatic water UK, peptide accessories, research reconstitution kit UK',
    color: '#64748b',
    icon: '🔧',
  },
};

// Fallback for unknown categories from DB
function buildFallbackConfig(slug: string): CategoryConfig {
  const label = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    label,
    description: `HPLC-verified ${label.toLowerCase()} research peptides supplied for laboratory use only.`,
    seoTitle: `${label} Research Peptides UK | PH Labs`,
    seoDescription: `Buy HPLC-verified ${label.toLowerCase()} research peptides in the UK. ≥99% purity, CoA included. For laboratory research use only.`,
    seoKeywords: `${label.toLowerCase()} peptides UK, research compounds UK`,
    color: '#3b82f6',
    icon: '🔬',
  };
}

const SORT_OPTIONS = [
  { id: 'default',     label: 'Featured'           },
  { id: 'price-asc',  label: 'Price: Low → High'  },
  { id: 'price-desc', label: 'Price: High → Low'  },
  { id: 'name-asc',   label: 'Name: A → Z'        },
];

function getLowestPrice(p: Product) {
  if (p.variants?.length) return Math.min(...p.variants.map(v => v.price ?? 0));
  return p.price ?? 0;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', height: 340 }}>
      <div className="h-48 bg-white/5" />
      <div className="p-5 space-y-3">
        <div className="h-3 bg-white/5 rounded w-1/3" />
        <div className="h-5 bg-white/8 rounded w-3/4" />
        <div className="h-3 bg-white/5 rounded w-1/2" />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  const config = slug ? (CATEGORY_CONFIG[slug] ?? buildFallbackConfig(slug)) : null;

  // SEO
  useSEO(`category-${slug}`, {
    title: config?.seoTitle ?? 'Research Peptides UK | PH Labs',
    metaDescription: config?.seoDescription ?? '',
    metaKeywords: config?.seoKeywords ?? '',
    canonical: `https://phlabs.co.uk/products/category/${slug}`,
    ogImage: 'https://cdn.wegic.ai/assets/onepage/agent/images/1779306071783_0.jpg',
  });

  // Subscribe to products filtered by category
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToProducts((all) => {
      const filtered = all.filter(
        p => p.isActive !== false && p.stock > 0 && p.category === slug
      );
      setProducts(filtered);
      setLoading(false);
    });
    return () => unsub();
  }, [slug]);

  // Redirect if no slug
  if (!slug) return <Navigate to="/products" replace />;

  const handleVariantSelect = (productId: string, variantId: string) => {
    setSelectedVariants(prev => ({ ...prev, [productId]: variantId }));
  };

  const handleAddToCart = (product: Product) => {
    const variantId = selectedVariants[product.id] ?? product.variants?.[0]?.id ?? '';
    const variant = product.variants?.find(v => v.id === variantId);
    const priceNum = variant?.price ?? product.price ?? 0;
    const cartItem = {
      id: product.id,
      name: product.name,
      price: `£${priceNum.toFixed(2)}`,
      priceNum,
      dosage: product.dosage ?? variant?.name ?? '',
      quantity: 1,
      image: product.imageUrl ?? product.images?.[0] ?? '',
      variantId: variantId || undefined,
      variantName: variant?.name,
      stock: variant?.stock ?? product.stock,
      stripePrice: product.stripePrice,
    };
    dispatchAddToCart(cartItem);
    setAddedIds(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => setAddedIds(prev => ({ ...prev, [product.id]: false })), 1500);
  };

  // Sort
  const sorted = [...products].sort((a, b) => {
    if (sort === 'price-asc')  return getLowestPrice(a) - getLowestPrice(b);
    if (sort === 'price-desc') return getLowestPrice(b) - getLowestPrice(a);
    if (sort === 'name-asc')   return a.name.localeCompare(b.name);
    return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
  });

  const accent = config?.color ?? '#3b82f6';

  return (
    <div className="relative min-h-screen" style={{ background: '#030914' }}>
      <AnimatedBackground />

      {/* ── Hero / Header ───────────────────────────────────────────── */}
      <section id="hero" className="relative pt-28 pb-14 px-4 overflow-hidden">
        {/* Accent glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full pointer-events-none"
          style={{ background: `${accent}18` }}
        />

        <div className="relative z-10 max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs mb-8" style={{ color: '#3a5a82' }}>
            <Link to="/" className="hover:text-blue-400 transition-colors">Home</Link>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <Link to="/products" className="hover:text-blue-400 transition-colors">Products</Link>
            <ChevronRight className="w-3 h-3 opacity-50" />
            <span style={{ color: accent }}>{config?.label}</span>
          </nav>

          {/* Title block */}
          <div className="flex items-start gap-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
              style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
            >
              {config?.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical className="w-3.5 h-3.5" style={{ color: accent }} />
                <span className="text-xs font-bold tracking-widest uppercase" style={{ color: accent }}>
                  Research Category
                </span>
              </div>
              <h1
                className="font-extrabold leading-tight"
                style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)', color: '#f0f8ff', letterSpacing: '-0.025em' }}
              >
                {config?.label} Peptides
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: '#4a6e8a' }}>
                {config?.description}
              </p>
              <p className="mt-2 text-xs" style={{ color: '#1e3a2a' }}>
                For laboratory research use only · MHRA compliant · Not for human use
              </p>
            </div>
          </div>

          {/* Stats bar */}
          {!loading && (
            <div className="flex items-center gap-6 mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold" style={{ color: accent }}>{sorted.length}</span>
                <span className="text-xs" style={{ color: '#3a5a82' }}>compounds available</span>
              </div>
              <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.07)' }} />
              <span className="text-xs" style={{ color: '#3a5a82' }}>HPLC ≥99% purity</span>
              <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.07)' }} />
              <span className="text-xs" style={{ color: '#3a5a82' }}>CoA included</span>
              <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.07)' }} />
              <span className="text-xs" style={{ color: '#3a5a82' }}>UK dispatch 1–3 days</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Products Grid ────────────────────────────────────────────── */}
      <section id="products" className="relative pb-24 px-4">
        <div className="max-w-6xl mx-auto">

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-8">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 text-sm transition-colors"
              style={{ color: '#3a5a82' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#8db4d8'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#3a5a82'}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All categories
            </Link>

            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => setSortOpen(v => !v)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#8db4d8',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 opacity-60" />
                {SORT_OPTIONS.find(o => o.id === sort)?.label}
              </button>
              {sortOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 py-1.5 rounded-xl z-50"
                  style={{ minWidth: 180, background: '#030f1e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 40px rgba(0,0,0,0.7)' }}
                >
                  {SORT_OPTIONS.map(o => (
                    <button
                      key={o.id}
                      onClick={() => { setSort(o.id); setSortOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm transition-colors"
                      style={{ color: sort === o.id ? accent : '#8db4d8', background: sort === o.id ? `${accent}10` : 'transparent' }}
                      onMouseEnter={e => { if (sort !== o.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={e => { if (sort !== o.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-24">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <FlaskConical className="w-7 h-7 opacity-20" />
              </div>
              <p className="text-lg font-semibold mb-2" style={{ color: '#c8dff5' }}>No products in this category yet</p>
              <p className="text-sm mb-6" style={{ color: '#3a5a82' }}>Check back soon or browse the full catalogue</p>
              <Link
                to="/products"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: `${accent}18`, border: `1px solid ${accent}30`, color: accent }}
              >
                <ArrowLeft className="w-4 h-4" /> View All Products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {sorted.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={i}
                  isAdmin={false}
                  selectedVariantId={selectedVariants[product.id] ?? product.variants?.[0]?.id ?? ''}
                  isAdded={!!addedIds[product.id]}
                  onVariantSelect={handleVariantSelect}
                  onAddToCart={handleAddToCart}
                  onEdit={() => {}}
                />
              ))}
            </div>
          )}

          {/* Schema.org BreadcrumbList */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://phlabs.co.uk/' },
                  { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://phlabs.co.uk/products' },
                  { '@type': 'ListItem', position: 3, name: config?.label, item: `https://phlabs.co.uk/products/category/${slug}` },
                ],
              }),
            }}
          />

          {/* Schema.org ItemList */}
          {!loading && sorted.length > 0 && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'ItemList',
                  name: `${config?.label} Research Peptides`,
                  numberOfItems: sorted.length,
                  itemListElement: sorted.map((p, i) => ({
                    '@type': 'ListItem',
                    position: i + 1,
                    name: p.name,
                    url: `https://phlabs.co.uk/products/${p.slug ?? p.name.toLowerCase().replace(/\s+/g, '-')}`,
                  })),
                }),
              }}
            />
          )}
        </div>
      </section>

      {/* ── Other Categories ─────────────────────────────────────────── */}
      <section id="other-categories" className="pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="pt-10" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-5" style={{ color: '#1e3a2a' }}>
              Browse other categories
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_CONFIG)
                .filter(([s]) => s !== slug)
                .map(([s, c]) => (
                  <Link
                    key={s}
                    to={`/products/category/${s}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#5a80a6' }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = `${c.color}40`;
                      (e.currentTarget as HTMLElement).style.color = c.color;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                      (e.currentTarget as HTMLElement).style.color = '#5a80a6';
                    }}
                  >
                    {c.icon} {c.label}
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
