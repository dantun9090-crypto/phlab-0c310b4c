import {
  Search, FlaskConical, ShieldCheck, Truck, SlidersHorizontal,
  X, ChevronDown, Package, WifiOff, RefreshCw, Microscope,
  CheckCircle2, LayoutGrid, List, Filter,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { dispatchAddToCart, CartItem } from '@/components/Layout';
import { auth, db, getAllProducts, doc, getDoc, getDocs, collection, query, onAuthStateChanged } from '@/lib/firebase';
import {
  markPrerenderPending,
  markPrerenderReady,
  flipPrerenderReadyWhenRendered,
} from '@/lib/prerender-ready';
import { ProductEditor } from '@/components/ProductEditor';
import { ProductCard } from '@/components/ProductCard';
import MarketingAdvertSlot from '@/components/MarketingAdvertSlot';
import type { Product } from '@/lib/firebase';
import { nameToSlug } from '@/lib/seedProducts';

// Route-critical visuals are eager. Do not wrap route/page content in
// Suspense with an empty fallback; stale chunks after publish can leave staging stuck
// on the boot loader with no visible route body.

// ─── Categories ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',                 label: 'All Products',        count: null },
  { id: 'tissue-repair',       label: 'Tissue Repair',       count: null },
  { id: 'metabolic-signaling', label: 'Metabolic / GLP-1',   count: null },
  { id: 'cellular-aging',      label: 'Longevity',           count: null },
  { id: 'neurological',        label: 'Nootropic',           count: null },
  { id: 'melanin',             label: 'Melanocortin',        count: null },
  { id: 'blends',              label: 'Blends',              count: null },
  { id: 'accessories',         label: 'Accessories',         count: null },
];

const SORT_OPTIONS = [
  { id: 'default',    label: 'Featured'      },
  { id: 'price-asc',  label: 'Price: Low → High' },
  { id: 'price-desc', label: 'Price: High → Low' },
  { id: 'name-asc',   label: 'Name: A → Z'   },
];

const CATEGORY_INTROS: Record<string, { h1: string; intro: string }> = {
  all: {
    h1: 'Research Peptides UK | Full Catalogue',
    intro: 'HPLC-tested, research-grade lyophilised peptides. Every batch analytically verified to ≥99% purity by reverse-phase HPLC and confirmed by mass spectrometry. Certificate of Analysis included. For laboratory research use only.',
  },
  'tissue-repair': {
    h1: 'Tissue Repair Research Peptides UK',
    intro: 'Compounds studied in preclinical models of musculoskeletal and connective tissue repair. BPC-157 and TB-500 among the most investigated peptides for tendon, ligament, and gastric pathways.',
  },
  'metabolic-signaling': {
    h1: 'Metabolic & GLP-1 Research Peptides UK',
    intro: 'GLP-1, GIP, and glucagon receptor agonists for metabolic signalling research. Semaglutide, Tirzepatide, and Retatrutide supplied for laboratory research use only.',
  },
  'cellular-aging': {
    h1: 'Longevity Research Peptides UK',
    intro: 'Telomere and mitochondrial research compounds including Epithalon and MOTS-c. Investigated in senescence and epigenetic longevity models.',
  },
  neurological: {
    h1: 'Nootropic Research Compounds UK',
    intro: 'Semax, Selank, and related compounds investigated for BDNF modulation and cognitive pathway research in preclinical neurological models.',
  },
  melanin: {
    h1: 'Melanocortin Research Peptides UK',
    intro: 'MC1R and MC4R agonists including Melanotan II and PT-141. Studied in photoprotection and melanin synthesis research models.',
  },
  blends: {
    h1: 'Research Peptide Blends UK',
    intro: 'Pre-formulated compound combinations for multi-pathway laboratory research protocols. Each blend is HPLC-verified and supplied with batch documentation.',
  },
  accessories: {
    h1: 'Laboratory Accessories & Bacteriostatic Water UK',
    intro: 'Bacteriostatic water, syringes, and reconstitution accessories for peptide research protocols. Supplied for laboratory use only.',
  },
};

function getLowestPrice(product: Product): number {
  if (product.variants?.length) {
    return Math.min(...product.variants.map(v => v.price ?? 0));
  }
  return product.price ?? 0;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
// minHeight matches real ProductCard: image (4/3 ratio ~200px at grid col width) + content ~220px ≈ 420px
function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.05)', minHeight: '420px' }}>
      {/* Image placeholder — 4:3 aspect ratio matching real card */}
      <div style={{ aspectRatio: '4/3', background: '#0d1f3a' }} />
      <div className="p-5 space-y-3">
        <div className="h-3 rounded-full w-1/3" style={{ background: '#0d1f3a' }} />
        <div className="h-5 rounded-full w-2/3" style={{ background: '#0d1f3a' }} />
        <div className="h-3 rounded-full w-full" style={{ background: '#0d1f3a' }} />
        <div className="h-3 rounded-full w-4/5" style={{ background: '#0d1f3a' }} />
        <div className="flex gap-2 pt-2">
          <div className="h-9 rounded-xl flex-1" style={{ background: '#0d1f3a' }} />
          <div className="h-9 rounded-xl w-24" style={{ background: '#0d1f3a' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Products() {
  const location = useLocation();

  // — URL param sync
  const urlCategory = new URLSearchParams(location.search).get('category') ?? 'all';

  // — State
  const [allProducts, setAllProducts]         = useState<Product[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [firestoreError, setFirestoreError]   = useState(false);
  const [slowLoad, setSlowLoad]               = useState(false);
  const [activeCategory, setActiveCategory]   = useState(urlCategory);
  const [searchQuery, setSearchQuery]         = useState('');
  const [sortBy, setSortBy]                   = useState('default');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [addedIds, setAddedIds]               = useState<Set<string>>(new Set());
  const [_cartCounts, _setCartCounts]         = useState<Record<string, number>>({});
  const [isAdmin, setIsAdmin]                 = useState(false);
  const [editingProduct, setEditingProduct]   = useState<Product | null>(null);
  const [adverts, setAdverts]                 = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [sortOpen, setSortOpen]               = useState(false);
  const [viewMode, setViewMode]               = useState<'grid' | 'list'>('grid');
  const sortRef = useRef<HTMLDivElement>(null);

  // sync URL category param
  useEffect(() => {
    setActiveCategory(urlCategory);
  }, [urlCategory]);

  // close sort dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Public adverts — admin saves products_top / products_sidebar placements here.
  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'adverts')))
      .then((snap: any) => {
        if (cancelled) return;
        setAdverts(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => { if (!cancelled) setAdverts([]); });
    return () => { cancelled = true; };
  }, []);

  // SEO
  useEffect(() => {
    const info = CATEGORY_INTROS[activeCategory] ?? CATEGORY_INTROS.all;
    document.title = `${info.h1} | PH Labs`;
    // Ensure meta description exists and is set (create if missing)
    let desc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!desc) {
      desc = document.createElement('meta');
      desc.setAttribute('name', 'description');
      document.head.appendChild(desc);
    }
    desc.setAttribute('content', info.intro.slice(0, 158));
  }, [activeCategory]);



  // Cart sync
  useEffect(() => {
    const loadCart = () => {
      const raw = localStorage.getItem('php_cart');
      const cart: CartItem[] = raw ? JSON.parse(raw) : [];
      const counts: Record<string, number> = {};
      cart.forEach(item => {
        const key = item.variantId ? `${item.id}-${item.variantId}` : item.id;
        counts[key] = (counts[key] || 0) + item.quantity;
      });
      _setCartCounts(counts);
    };
    loadCart();
    window.addEventListener('cartUpdated', loadCart);
    return () => window.removeEventListener('cartUpdated', loadCart);
  }, []);

  // Products load — cached one-time read for shoppers to avoid permanent backend streams
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFirestoreError(false);
    setSlowLoad(false);
    const slowTimer = setTimeout(() => setSlowLoad(true), 4000);
    markPrerenderPending();

    getAllProducts()
      .then((products) => {
        if (cancelled) return;
        clearTimeout(slowTimer);
        setSlowLoad(false);
        const visible = products
          .filter(p => p.isActive !== false && p.visibility !== 'hidden')
          .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
        setAllProducts(visible);
        setLoading(false);
        // Flip prerenderReady only once real ProductCard markup is in the DOM.
        // Matches the [data-product-card] attribute set by <ProductCard /> —
        // excludes nav links and the SSR-only crawler catalogue block.
        flipPrerenderReadyWhenRendered('[data-product-card]', visible.length);
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(slowTimer);
        setSlowLoad(false);
        setFirestoreError(true);
        setLoading(false);
        markPrerenderReady();
      });
    return () => { cancelled = true; clearTimeout(slowTimer); };
  }, []);

  // Admin check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user: any) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'customers', user.uid));
          setIsAdmin(snap.exists() && snap.data()?.role === 'admin');
        } catch { setIsAdmin(false); }
      } else {
        setIsAdmin(false);
      }
    });
    return unsub;
  }, []);

  // — Filtering & sorting
  const filteredProducts = (() => {
    let list = allProducts;
    if (activeCategory !== 'all') {
      list = list.filter(p => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }
    switch (sortBy) {
      case 'price-asc':  return [...list].sort((a, b) => getLowestPrice(a) - getLowestPrice(b));
      case 'price-desc': return [...list].sort((a, b) => getLowestPrice(b) - getLowestPrice(a));
      case 'name-asc':   return [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      default:           return list;
    }
  })();

  // Structured data: CollectionPage + ItemList of visible products
  useEffect(() => {
    const info = CATEGORY_INTROS[activeCategory] ?? CATEGORY_INTROS.all;
    const baseUrl = 'https://phlabs.co.uk';
    const pageUrl = activeCategory === 'all'
      ? `${baseUrl}/products`
      : `${baseUrl}/products?category=${activeCategory}`;

    const items = filteredProducts.slice(0, 30).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${baseUrl}/product/${nameToSlug(p.name ?? '')}`,
      name: p.name,
      image: p.imageUrl,
    }));

    document.getElementById('products-schema')?.remove();
    if (items.length === 0) return;

    const schema = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: info.h1,
        description: info.intro,
        url: pageUrl,
        inLanguage: 'en-GB',
        isPartOf: { '@type': 'WebSite', name: 'PH Labs', url: baseUrl },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: info.h1,
        numberOfItems: items.length,
        itemListElement: items,
      },
    ];

    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'products-schema';
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
    return () => { document.getElementById('products-schema')?.remove(); };
  }, [activeCategory, filteredProducts]);



  // Category counts
  const categoryCounts = Object.fromEntries(
    CATEGORIES.map(cat => [
      cat.id,
      cat.id === 'all'
        ? allProducts.length
        : allProducts.filter(p => p.category === cat.id).length,
    ])
  );

  // — Add to cart
  const handleAddToCart = (product: Product) => {
    const variantId = selectedVariants[product.id] || product.variants?.[0]?.id;
    const variant   = product.variants?.find(v => v.id === variantId);
    const rawPrice  = variant ? variant.price : (product.price ?? 0);
    const priceNum  = Number(rawPrice) || 0;
    const cartKey   = variantId ? `${product.id}-${variantId}` : product.id;
    const slug      = nameToSlug(product.name ?? '');
    const variantName = (variant as any)?.name || (variant as any)?.dosage || '';

    dispatchAddToCart({
      id:          product.id,
      name:        product.name ?? '',
      dosage:      variantName,
      price:       `£${priceNum.toFixed(2)}`,
      priceNum,
      quantity:    1,
      image:       product.imageUrl,
      variantId,
      variantName,
      slug,
    } as CartItem);

    setAddedIds(prev => { const n = new Set(prev); n.add(cartKey); return n; });
    setTimeout(() => setAddedIds(prev => { const n = new Set(prev); n.delete(cartKey); return n; }), 1800);
  };

  const heroInfo = CATEGORY_INTROS[activeCategory] ?? CATEGORY_INTROS.all;
  const sortLabel = SORT_OPTIONS.find(o => o.id === sortBy)?.label ?? 'Featured';

  return (
    <div className="min-h-screen" style={{ background: '#060f1e' }}>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section id="hero" className="relative overflow-hidden" style={{ background: '#030812', paddingTop: 'calc(var(--nav-h, 80px) + 2rem)', paddingBottom: '4rem' }}>
        <AnimatedBackground variant="blue" />

        {/* Decorative rings */}
        <div className="absolute pointer-events-none hidden lg:block" style={{ top: '-30%', right: '-8%', width: 640, height: 640, borderRadius: '50%', border: '1px solid rgba(37,99,235,0.07)' }} />
        <div className="absolute pointer-events-none hidden lg:block" style={{ top: '-12%', right: '-2%', width: 440, height: 440, borderRadius: '50%', border: '1px solid rgba(96,165,250,0.05)' }} />

        <div className="hero-top-shimmer pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #060f1e)' }} />

        <div className="container mx-auto px-6 relative z-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 mb-6 text-xs" style={{ color: '#3a5a82' }} aria-label="Breadcrumb">
            <Link to="/" className="hover:text-blue-400 transition-colors">Home</Link>
            <span>/</span>
            <span style={{ color: '#9cb8d9' }}>Catalogue</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-2xl">
              {/* Label */}
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <FlaskConical className="w-3.5 h-3.5 text-blue-400" />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#60a5fa' }}>Compound Catalogue</span>
              </div>

              <h1 className="font-black leading-tight mb-3" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)', color: '#eef4ff', letterSpacing: '-0.025em' }}>
                {heroInfo.h1}
              </h1>
              <p className="leading-relaxed text-base" style={{ color: '#9cb8d9', maxWidth: 560 }}>
                {heroInfo.intro}
              </p>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap gap-3 lg:flex-col lg:items-end lg:gap-2 shrink-0">
              {[
                { icon: ShieldCheck, text: '≥99% HPLC Verified', color: '#10b981' },
                { icon: Microscope,  text: 'CoA Every Order',     color: '#3b82f6' },
                { icon: Truck,       text: 'UK Same-Day Dispatch', color: '#a78bfa' },
              ].map(({ icon: Icon, text, color }) => (
                <div key={text} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                  <span className="text-xs font-semibold" style={{ color: '#9ab8d8' }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── RESEARCH DISCLAIMER ──────────────────────────────────────────────── */}
      <section id="disclaimer" className="py-4" style={{ background: '#04101f', borderBottom: '1px solid rgba(16,185,129,0.08)' }}>
        <div className="container mx-auto px-6">
          <p className="text-xs text-center leading-relaxed" style={{ color: '#2a6645', maxWidth: 760, margin: '0 auto' }}>
            <strong style={{ color: '#10b981' }}>Research Use Only.</strong>{' '}
            All products are strictly for laboratory research. Not for human or veterinary consumption. Not intended to diagnose, treat, cure or prevent any disease. Not evaluated by MHRA or FDA. 18+ only.
          </p>
        </div>
      </section>

      {/* ── MAIN LAYOUT ─────────────────────────────────────────────────────── */}
      <section id="catalogue" className="py-10" aria-labelledby="catalogue-heading">
        <div className="container mx-auto px-4 sm:px-6">
          <h2 id="catalogue-heading" className="sr-only">Research Peptide Catalogue</h2>
          <div className="flex gap-6 lg:gap-8">

            {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
            {/* Mobile overlay */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-40 lg:hidden"
                style={{ background: 'rgba(0,4,14,0.75)' }}
                onClick={() => setSidebarOpen(false)}
              />
            )}

            <aside
              className={`
                fixed lg:static inset-y-0 left-0 z-50 lg:z-auto
                w-72 lg:w-56 xl:w-60 shrink-0
                lg:translate-x-0 transition-transform duration-300
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
              `}
              style={{
                background: 'transparent',
                overflowY: 'auto',
                paddingTop: 'var(--nav-h, 80px)',
              }}
            >
              {/* Sidebar inner */}
              <div className="lg:sticky lg:top-24 space-y-4 pr-1 pb-8" style={{ paddingTop: sidebarOpen ? '4.5rem' : 0 }}>

                {/* Mobile close */}
                <div className="flex items-center justify-between lg:hidden px-4 pb-2">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#3a5a82' }}>Filters</span>
                  <button onClick={() => setSidebarOpen(false)} aria-label="Close filters" className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', color: '#9cb8d9' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search */}
                <div className="rounded-xl overflow-hidden" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="p-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-2" style={{ color: '#3a5a82' }}>Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#3a5a82' }} />
                      <input
                        type="text"
                        placeholder="e.g. BPC-157…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full text-sm pl-9 pr-3 py-2 rounded-lg outline-none transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          color: '#d0e8f5',
                          fontSize: '0.8125rem',
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(96,165,250,0.4)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                      />
                      {searchQuery && (
                        <button type="button" aria-label="Clear search query" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#3a5a82' }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Categories */}
                <div className="rounded-xl overflow-hidden" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="p-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-2.5" style={{ color: '#3a5a82' }}>Category</label>
                    <div className="space-y-0.5">
                      {CATEGORIES.map(cat => {
                        const active = activeCategory === cat.id;
                        const count  = categoryCounts[cat.id] ?? 0;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => { setActiveCategory(cat.id); setSidebarOpen(false); }}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150"
                            style={active ? {
                              background: 'rgba(16,185,129,0.12)',
                              color: '#34d399',
                              fontWeight: 700,
                              border: '1px solid rgba(16,185,129,0.25)',
                            } : {
                              color: '#9cb8d9',
                              fontWeight: 500,
                              border: '1px solid transparent',
                            }}
                            onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = '#9ab8d8'; } }}
                            onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#9cb8d9'; } }}
                          >
                            <span>{cat.label}</span>
                            {count > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={active ? { background: 'rgba(16,185,129,0.15)', color: '#34d399' } : { background: 'rgba(255,255,255,0.05)', color: '#3a5a82' }}>
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Quality badge */}
                <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(5,150,105,0.04))', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4" style={{ color: '#10b981' }} />
                    <span className="text-xs font-bold" style={{ color: '#10b981' }}>Quality Guaranteed</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#2a6645' }}>
                    ≥99% HPLC purity. Mass spectrometry identity confirmed. Certificate of Analysis with every order.
                  </p>
                  <Link to="/lab-reports" className="inline-flex items-center gap-1 mt-3 text-xs font-semibold transition-colors" style={{ color: '#10b981' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#10b981')}>
                    View Lab Reports →
                  </Link>
                </div>

                <MarketingAdvertSlot adverts={adverts} placement="products_sidebar" variant="compact" />

              </div>
            </aside>

            {/* ── CONTENT ──────────────────────────────────────────────────── */}
            <div className="flex-1 min-w-0">

              <MarketingAdvertSlot adverts={adverts} placement="products_top" className="mb-6" />

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3 mb-6">
                {/* Mobile filter toggle */}
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)', color: '#9cb8d9' }}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeCategory !== 'all' && <span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />}
                </button>

                {/* Results count */}
                <div className="text-sm" style={{ color: '#3a5a82' }}>
                  {loading
                    ? <span className="animate-pulse">Loading…</span>
                    : <><span style={{ color: '#9cb8d9', fontWeight: 600 }}>{filteredProducts.length}</span> compound{filteredProducts.length !== 1 ? 's' : ''}</>
                  }
                </div>

                {/* Active filters */}
                {activeCategory !== 'all' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' }}>
                    {CATEGORIES.find(c => c.id === activeCategory)?.label}
                    <button onClick={() => setActiveCategory('all')} aria-label="Clear category filter" style={{ color: '#10b981' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {searchQuery && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                    "{searchQuery}"
                    <button onClick={() => setSearchQuery('')} aria-label="Clear search query" style={{ color: '#60a5fa' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* View mode toggle */}
                <div className="hidden sm:flex items-center rounded-xl overflow-hidden" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {(['grid', 'list'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className="p-2.5 transition-all"
                      aria-label={`${mode} view`}
                      style={viewMode === mode ? { background: 'rgba(16,185,129,0.12)', color: '#34d399' } : { color: '#3a5a82' }}
                    >
                      {mode === 'grid' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <div ref={sortRef} className="relative">
                  <button
                    onClick={() => setSortOpen(v => !v)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)', color: '#9cb8d9', minWidth: 160 }}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    {sortLabel}
                    <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {sortOpen && (
                    <div className="absolute right-0 top-full mt-2 z-30 rounded-xl py-1.5 min-w-[180px]" style={{ background: '#0d1f3a', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
                      {SORT_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => { setSortBy(opt.id); setSortOpen(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm transition-all"
                          style={sortBy === opt.id ? { color: '#34d399', fontWeight: 700 } : { color: '#9cb8d9' }}
                          onMouseEnter={e => { if (sortBy !== opt.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          {sortBy === opt.id && <CheckCircle2 className="inline w-3 h-3 mr-2" style={{ color: '#10b981' }} />}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── ERROR STATE ─────────────────────────────────────────── */}
              {firestoreError && (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl" style={{ background: '#0b1a30', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <WifiOff className="w-10 h-10 mb-4" style={{ color: '#ef4444' }} />
                  <p className="font-bold text-lg mb-1" style={{ color: '#eef4ff' }}>Connection Error</p>
                  <p className="text-sm mb-6" style={{ color: '#9cb8d9' }}>Unable to load products. Check your connection.</p>
                  <button onClick={() => window.location.reload()} className="btn-primary flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Retry
                  </button>
                </div>
              )}

              {/* ── SLOW LOAD BANNER ────────────────────────────────────── */}
              {slowLoad && !firestoreError && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', color: '#fbbf24' }}>
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  Loading is taking longer than usual…
                </div>
              )}

              {/* ── LOADING SKELETONS ────────────────────────────────────── */}
              {loading && !firestoreError && (
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5' : 'space-y-4'} style={{ minHeight: '900px' }}>
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}

              {/* ── EMPTY STATE ─────────────────────────────────────────── */}
              {!loading && !firestoreError && filteredProducts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Package className="w-10 h-10 mb-4" style={{ color: '#3a5a82' }} />
                  <p className="font-bold text-lg mb-1" style={{ color: '#eef4ff' }}>No compounds found</p>
                  <p className="text-sm mb-6" style={{ color: '#9cb8d9' }}>Try a different category or clear your search.</p>
                  <button
                    onClick={() => { setActiveCategory('all'); setSearchQuery(''); }}
                    className="btn-primary"
                  >
                    View All Products
                  </button>
                </div>
              )}

              {/* ── PRODUCT GRID ─────────────────────────────────────────── */}
              {!loading && !firestoreError && filteredProducts.length > 0 && (
                <div className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5'
                    : 'space-y-4'
                }>
                  {filteredProducts.map((product, i) => {
                    const vars = product.variants ?? [];
                    const selectedVariantId = selectedVariants[product.id] || (vars[0]?.id ?? '');
                    const cartKey = `${product.id}-${selectedVariantId}`;
                    const isAdded = addedIds.has(cartKey);
                    return (
                      <ProductCard
                        key={product.id}
                        product={product}
                        index={i}
                        selectedVariantId={selectedVariantId}
                        isAdded={isAdded}
                        isAdmin={isAdmin}
                        highlight={searchQuery.trim() || undefined}
                        onVariantSelect={(pid, vid) => setSelectedVariants(prev => ({ ...prev, [pid]: vid }))}
                        onAddToCart={handleAddToCart}
                        onEdit={setEditingProduct}
                      />
                    );
                  })}
                </div>
              )}

            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM TRUST BAND ───────────────────────────────────────────────── */}
      <section id="trust" className="py-12" style={{ background: '#04101f', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: ShieldCheck, title: '≥99% HPLC Verified',    desc: 'Every batch analytically confirmed', color: '#10b981' },
              { icon: Microscope,  title: 'Mass Spec Confirmed',    desc: 'Identity verified per order',        color: '#3b82f6' },
              { icon: Truck,       title: 'UK Same-Day Dispatch',   desc: 'Order before 1pm weekdays',         color: '#a78bfa' },
              { icon: CheckCircle2,title: 'CoA Every Order',       desc: 'Full batch documentation',           color: '#f59e0b' },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: `rgba(${color === '#10b981' ? '16,185,129' : color === '#3b82f6' ? '59,130,246' : color === '#a78bfa' ? '167,139,250' : '245,158,11'},0.1)`, border: `1px solid rgba(${color === '#10b981' ? '16,185,129' : color === '#3b82f6' ? '59,130,246' : color === '#a78bfa' ? '167,139,250' : '245,158,11'},0.2)` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-sm font-bold leading-snug mb-0.5" style={{ color: '#d0e8f5' }}>{title}</p>
                  <p className="text-xs leading-snug" style={{ color: '#3a5a82' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ADMIN PRODUCT EDITOR ────────────────────────────────────────────── */}
      {editingProduct && (
        <ProductEditor
          product={editingProduct}
          isOpen={true}
          onClose={() => setEditingProduct(null)}
          onSave={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}
