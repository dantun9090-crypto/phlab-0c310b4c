import { ReactNode, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, X, Plus, Minus, Trash2, User as UserIcon,
  Mail, MapPin, Package, CheckCircle2, ChevronLeft,
  Shield, AlertTriangle, ChevronUp, ChevronDown,
  FlaskConical, BookOpen,
  ArrowRight, Microscope, TestTube, Dna, Settings as SettingsIcon,
  Lock, Landmark, BadgeCheck, Search, Truck, Menu
} from 'lucide-react';
import { auth, db, doc, getDoc, onAuthStateChanged, FirebaseUser, getAllProducts } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';

// Articles bundle (~196KB) is loaded lazily — only when the search panel opens —
// to keep it off the critical path of every page render.
type ArticleLite = { title: string; subtitle?: string; slug: string };
import { CookieConsent } from '@/components/CookieConsent';
import RecentlyViewedProducts from '@/components/RecentlyViewedProducts';
import { getRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { migrateStoredCart } from '@/lib/cart-migration';

import { Logo } from './Logo';
import { UnderConstruction } from './UnderConstruction';
import ResearchGate from './ResearchGate';
import { Navigation } from './Navigation';
import { WhatsAppIcon, FacebookIcon, InstagramIcon, TwitterXIcon, YoutubeIcon } from './SocialIcons';

interface SiteSettings {
  whatsappNumber?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  youtubeUrl?: string;
  linkedinUrl?: string;
  footerTagline?: string;
  footerLegal?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyRegNumber?: string;
  companyAddress?: string;
  // MHRA banner
  mhraDisclaimerEnabled?: boolean;
  // Maintenance
  maintenanceMode?: boolean;
  maintenanceEndDate?: string;
  // Payment methods
  trueLayerEnabled?: boolean;
  bankTransferEnabled?: boolean;
  bankTransferName?: string;
  bankTransferSortCode?: string;
  bankTransferAccountNumber?: string;
  bankTransferIBAN?: string;
  bankTransferInstructions?: string;
  // Site Features - Age Gate permanently removed
  cookieConsentEnabled?: boolean;
}

interface LayoutProps {
  children: ReactNode;
}

export interface CartItem {
  id: string;
  name: string;
  variantId?: string;
  variantName?: string;
  dosage: string;
  price: string;
  priceNum: number;
  quantity: number;
  image?: string;
  stock?: number;
  stripePrice?: string;
}

const FREE_SHIPPING_THRESHOLD = 50;

// Navigation is handled by Navigation.tsx component

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Auth pages handle their own full-screen layout — no nav padding needed
  const isAuthPage = ['/login', '/register'].includes(location.pathname);
  // Admin also gets clean layout — no overlapping fixed bars
  const isAdminPage = location.pathname.startsWith('/admin');
  const isCleanPage = isAuthPage || isAdminPage;
  
  // Check if any cart items have no variant selected
  const hasItemsWithoutVariant = useMemo(() => {
    return cart.some(item => !item.dosage || item.dosage === '');
  }, [cart]);
  // Age Gate REMOVED — no longer blocking content
  
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVip, setIsVip] = useState(false);
  // settingsLoaded removed - no longer needed without Age Gate
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({
    trueLayerEnabled: false,
    bankTransferEnabled: true,
    whatsappNumber: '447514190390',
    cookieConsentEnabled: true,
  });
  
  // Load settings synchronously from localStorage first (before render)
  useEffect(() => {
    try {
      const cached = localStorage.getItem('php_site_settings');
      if (cached) {
        const data = JSON.parse(cached);
        setSiteSettings(prev => ({
          ...prev,
          ...data,
          trueLayerEnabled: data.trueLayerEnabled !== undefined ? Boolean(data.trueLayerEnabled) : false,
          bankTransferEnabled: data.bankTransferEnabled !== undefined ? Boolean(data.bankTransferEnabled) : true,
        }));
      }
    } catch {
      // ignore
    }
    // setSettingsLoaded removed - no longer needed without Age Gate
  }, []);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchProducts, setSearchProducts] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<{ type: 'product' | 'article'; label: string; href: string }[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('php_recent_searches') || '[]'); } catch { return []; }
  });

  // Load cart from localStorage — deferred to avoid blocking paint.
  // Runs `migrateStoredCart` first so legacy carts that stored the variantId
  // concatenated into `id` (e.g. `"retatrutide-5mg"`) get rewritten into the
  // canonical `{ id, variantId }` shape before anything reads them.
  useEffect(() => {
    const loadCart = () => {
      try {
        const migrated = migrateStoredCart<CartItem>();
        if (migrated && migrated.length > 0) {
          setCart(migrated);
          return;
        }
        const saved = localStorage.getItem('php_cart');
        if (saved) setCart(JSON.parse(saved));
      } catch { /* ignore */ }
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(loadCart, { timeout: 1000 });
    } else {
      setTimeout(loadCart, 50);
    }
  }, []);

  // Load site settings — defer all reads to idle time to avoid blocking LCP
  useEffect(() => {
    const load = () => {
      // Fetch fresh from Firestore (localStorage already loaded synchronously above)
      getDoc(doc(db, 'settings', 'siteSettings')).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          const trueLayerOn = data.trueLayerEnabled !== undefined ? Boolean(data.trueLayerEnabled) : false;
          const bankOn = data.bankTransferEnabled !== undefined ? Boolean(data.bankTransferEnabled) : true;
          setSiteSettings(prev => ({ ...prev, ...data, trueLayerEnabled: trueLayerOn, bankTransferEnabled: bankOn }));
          try { localStorage.setItem('php_site_settings', JSON.stringify(data)); } catch { /* ignore */ }
        }
      }).catch(() => {});
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(load, { timeout: 5000 });
    } else {
      setTimeout(load, 1000);
    }
  }, []);

  // Save cart to localStorage — deferred to idle so it never blocks renders
  useEffect(() => {
    const save = () => {
      try { localStorage.setItem('php_cart', JSON.stringify(cart)); } catch { /* ignore */ }
    };
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(save, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    } else {
      const t = setTimeout(save, 100);
      return () => clearTimeout(t);
    }
  }, [cart]);

  // Auth state listener
  useEffect(() => {
    // Complete Google sign-in redirect flow (mobile). Safe to call always —
    // it's a no-op when there's no pending redirect.
    import('@/lib/firebase').then(m => {
      m.completeGoogleRedirect?.().catch(() => { /* ignore */ });
    }).catch(() => { /* ignore */ });

    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        // Defer Firestore profile read — not needed for above-fold rendering
        const loadProfile = () => {
          getDoc(doc(db, 'customers', user.uid)).then(snap => {
            if (snap.exists()) {
              setIsAdmin(snap.data()?.isAdmin === true);
              setIsVip(snap.data()?.isVip === true);
            }
          }).catch(() => { /* ignore */ });
        };
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(loadProfile, { timeout: 2000 });
        } else {
          setTimeout(loadProfile, 300);
        }
      } else {
        setIsAdmin(false);
        setIsVip(false);
      }
    });
    return () => unsub();
  }, []);


  // Listen for add-to-cart events
  useEffect(() => {
    const handleAdd = (e: any) => {
      const item = e.detail as CartItem;
      addToCart(item);
    };
    window.addEventListener('php:add-to-cart', handleAdd);
    return () => window.removeEventListener('php:add-to-cart', handleAdd);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsCartOpen(false);
    setIsSearchOpen(false);
    setSearchQuery('');
  }, [location.pathname]);

  // Focus search input when opened
  useEffect(() => {
    if (isSearchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      setSuggestions([]);
      setActiveSuggestion(-1);
    }
  }, [isSearchOpen]);

  // Lazily load products for autocomplete (one-time cached read; avoids a sitewide live stream)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getAllProducts().then((prods) => {
        if (!cancelled) setSearchProducts(prods);
      }).catch(() => {
        if (!cancelled) setSearchProducts([]);
      });
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(load, { timeout: 5000 });
    } else {
      setTimeout(load, 1500);
    }
    return () => { cancelled = true; };
  }, []);

  // Lazy-load the articles bundle the first time the search panel opens.
  const [searchArticles, setSearchArticles] = useState<ArticleLite[]>([]);
  useEffect(() => {
    if (!isSearchOpen || searchArticles.length > 0) return;
    let cancelled = false;
    import('@/pages/Resources/data/articles').then(m => {
      if (!cancelled) setSearchArticles(m.articles as ArticleLite[]);
    });
    return () => { cancelled = true; };
  }, [isSearchOpen, searchArticles.length]);

  // Save a search term to recent history
  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const next = [trimmed, ...prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
      try { localStorage.setItem('php_recent_searches', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Compute autocomplete suggestions from query
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) { setSuggestions([]); setActiveSuggestion(-1); return; }
    const prodSuggs = searchProducts
      .filter(p => p.name?.toLowerCase().includes(q))
      .slice(0, 4)
      .map(p => ({ type: 'product' as const, label: p.name, href: `/products/${p.slug || p.name?.toLowerCase().replace(/\s+/g, '-')}` }));
    const artSuggs = searchArticles
      .filter(a => a.title.toLowerCase().includes(q) || a.subtitle?.toLowerCase().includes(q))
      .slice(0, 3)
      .map(a => ({ type: 'article' as const, label: a.title, href: `/resources/${a.slug}` }));
    setSuggestions([...prodSuggs, ...artSuggs].slice(0, 6));
    setActiveSuggestion(-1);
  }, [searchQuery, searchProducts, searchArticles]);

  const totalItems = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const getTotalItems = useCallback(() => totalItems, [totalItems]);
  
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.priceNum * item.quantity, 0), [cart]);
  const getSubtotal = useCallback(() => subtotal, [subtotal]);

  const shippingCost = useMemo(() => subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 4.99, [subtotal]);
  const getTotalPrice = useCallback(() => Math.max(0, subtotal + shippingCost).toFixed(2), [subtotal, shippingCost]);

  const addToCart = (item: CartItem) => {
    setCart(prev => {
      const key = item.variantId ? `${item.id}-${item.variantId}` : String(item.id);
      const existing = prev.find(i => {
        const iKey = i.variantId ? `${i.id}-${i.variantId}` : String(i.id);
        return iKey === key;
      });
      if (existing) {
        return prev.map(i => {
          const iKey = i.variantId ? `${i.id}-${i.variantId}` : String(i.id);
          return iKey === key ? { ...i, quantity: i.quantity + 1 } : i;
        });
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (cartKey: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          const key = item.variantId ? `${item.id}-${item.variantId}` : String(item.id);
          if (key !== cartKey) return item;
          const newQty = item.quantity + delta;
          if (item.stock !== undefined && newQty > item.stock) return item;
          return { ...item, quantity: newQty };
        })
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (cartKey: string) => {
    setCart(prev => prev.filter(item => {
      const key = item.variantId ? `${item.id}-${item.variantId}` : String(item.id);
      return key !== cartKey;
    }));
  };

  const closeCart = () => {
    setIsCartOpen(false);
  };


  // Age Gate handlers REMOVED


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Research confirmation gate + sticky research banner */}
      {!isCleanPage && <ResearchGate />}

      {/* Maintenance Mode — admins bypass */}
      {siteSettings.maintenanceMode && !isAdmin && (
        <UnderConstruction targetDate={siteSettings.maintenanceEndDate || undefined} />
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PERSISTENT SHIPPING TOP BAR — hidden on auth/admin pages
      ═══════════════════════════════════════════════════════════════ */}
      {!isCleanPage && <div
        className="fixed left-0 right-0 z-[51] flex items-center justify-center gap-4 px-4 text-center"
        style={{
          top: 'var(--rg-banner-h, 0px)',
          height: '32px',
          background: '#030a14',
          borderBottom: '1px solid rgba(16,185,129,0.12)',
        }}
      >
        <div className="flex items-center gap-3 text-[11px] font-medium" style={{ color: '#9cb8d9' }}>
          <span className="flex items-center gap-1.5">
            <Truck className="w-3 h-3" style={{ color: '#10b981', flexShrink: 0 }} />
            <span style={{ color: '#4ade80', fontWeight: 600 }}>Free UK Shipping</span>
            <span>on orders over</span>
            <span style={{ color: '#e4f0ff', fontWeight: 700 }}>£50</span>
          </span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }} className="hidden sm:block">·</span>
          <span className="hidden sm:flex items-center gap-1.5">
            <FlaskConical className="w-3 h-3" style={{ color: '#3b82f6', flexShrink: 0 }} />
            <span>≥99% HPLC Purity</span>
          </span>
          <span className="text-white/20 hidden md:block">·</span>
          <span className="hidden md:flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-blue-400 shrink-0" />
            <span>Secure UK checkout</span>
          </span>
        </div>
        {/* Cart progress — shows when cart has items */}
        {subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD && (
          <div className="relative hidden sm:flex items-center gap-2 ml-2">
            <div className="w-20 h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold whitespace-nowrap">
              £{(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)} to free shipping
            </span>
          </div>
        )}
      </div>}

      {/* ═══════════════════════════════════════════════════════════════
          PREMIUM NAVBAR — hidden on auth pages
      ═══════════════════════════════════════════════════════════════ */}
      {!isAuthPage && <header
        className="fixed left-0 right-0 z-50 border-b border-white/[0.06]"
        style={{ background: '#030a14', top: 'calc(var(--rg-banner-h, 34px) + 32px)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <div className="w-full pl-4 pr-4 sm:pl-4 sm:pr-6">
          <div className="flex items-center justify-between h-[64px]">

            {/* ── Logo (far left) ── */}
            <Link to="/" className="flex items-center self-center gap-2.5 sm:gap-3 min-w-0 mr-auto group">
              <div className="relative shrink-0 flex items-center">
                <Logo size="lg" />
              </div>
              <div className="flex flex-col leading-[1.05] min-w-0">
                <span className="font-extrabold text-white text-[18px] sm:text-[22px] tracking-tight group-hover:text-emerald-300 transition-colors duration-200 truncate">PH Labs</span>
                <span className="text-[10px] sm:text-[11px] text-emerald-400/90 font-semibold tracking-[0.22em] uppercase mt-0.5">Research Grade</span>
              </div>
            </Link>

            {/* ── Desktop + Mobile Nav (Navigation component) ── */}
            <Navigation
              user={firebaseUser}
              isMobileMenuOpen={isMobileMenuOpen}
              onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
            {/* ── Right actions ── */}
            <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">


              {/* Browse CTA */}
              <a
                href="/products"
                className="group hidden lg:inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:via-emerald-400 hover:to-emerald-500 text-white text-[13px] font-bold rounded-xl transition-all duration-300 border border-emerald-400/30 hover:border-emerald-400/50 relative overflow-hidden"
              >
                <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
                <FlaskConical className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">Browse Peptides</span>
              </a>

              {/* Account */}
              {firebaseUser ? (
                <Link
                  to="/account"
                  className="group hidden md:flex items-center gap-1.5 px-3 py-2 text-[#7a9ec8] hover:text-white hover:bg-white/[0.06] rounded-xl text-[13px] font-medium transition-all duration-300 border border-transparent hover:border-white/[0.08]"
                >
                  <UserIcon className="w-4 h-4 text-blue-400/60 group-hover:text-emerald-400 transition-colors" />
                  <span>Account</span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="group hidden md:flex items-center gap-1.5 px-3 py-2 text-[#7a9ec8] hover:text-white hover:bg-white/[0.06] rounded-xl text-[13px] font-medium transition-all duration-300 border border-transparent hover:border-white/[0.08]"
                >
                  <UserIcon className="w-4 h-4 text-blue-400/60 group-hover:text-emerald-400 transition-colors" />
                  <span>Login</span>
                </Link>
              )}

              <div className="w-px h-5 bg-white/[0.1] hidden md:block mx-0.5" />

              {/* Search */}
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                aria-label="Search"
                className="group relative min-w-[44px] min-h-[44px] flex items-center justify-center text-[#7a9ec8] hover:text-white transition-all duration-300 rounded-xl hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08]"
              >
                <Search className="w-[17px] h-[17px] group-hover:text-emerald-400 transition-colors" />
              </button>

              {/* Cart */}
              <button
                onClick={() => setIsCartOpen(true)}
                aria-label="Open shopping cart"
                className="group relative min-w-[44px] min-h-[44px] flex items-center justify-center text-[#7a9ec8] hover:text-white transition-all duration-300 rounded-xl hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08]"
              >
                <ShoppingCart className="w-[18px] h-[18px] group-hover:text-emerald-400 transition-colors" />
                {getTotalItems() > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1 shadow-[0_0_12px_rgba(16,185,129,0.6)] animate-pulse">
                    {getTotalItems()}
                  </span>
                )}
              </button>

              {/* Hamburger — mobile only, always last on the right */}
              <button
                className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all duration-200 text-white hover:bg-white/10"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>

            </div>
          </div>
        </div>

        {/* ── Search Bar Dropdown ── */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isSearchOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
          }`}
          style={{ background: 'rgba(4,16,31,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="px-4 py-3 max-w-2xl mx-auto relative">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const suggestion = activeSuggestion >= 0 ? suggestions[activeSuggestion] : null;
                if (suggestion) {
                  saveRecentSearch(suggestion.label);
                  navigate(suggestion.href);
                } else {
                  const raw = searchQuery.trim();
                  if (raw) {
                    saveRecentSearch(raw);
                    navigate(`/search?q=${encodeURIComponent(raw)}`);
                  } else {
                    navigate('/search');
                  }
                }
                setIsSearchOpen(false);
                setSearchQuery('');
              }}
              className="flex items-center gap-3"
            >
              <Search className="w-4 h-4 text-[#9cb8d9] shrink-0" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (!suggestions.length) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, -1)); }
                  else if (e.key === 'Escape') { setIsSearchOpen(false); setSearchQuery(''); }
                }}
                placeholder="Search peptides, articles, guides..."
                className="flex-1 bg-transparent text-[#f0f6ff] placeholder-[#5a80a6] text-sm outline-none"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setSuggestions([]); searchInputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="text-[#8aa8c8] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
              >
                Search
              </button>
            </form>

            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute left-4 right-4 top-full mt-1 rounded-xl overflow-hidden z-50"
                style={{ background: '#07121f', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s.href}
                    type="button"
                    onMouseEnter={() => setActiveSuggestion(i)}
                    onClick={() => {
                      saveRecentSearch(s.label);
                      navigate(s.href);
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-sm"
                    style={{
                      background: activeSuggestion === i ? 'rgba(255,255,255,0.06)' : 'transparent',
                      borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    {s.type === 'product'
                      ? <FlaskConical className="w-3.5 h-3.5 shrink-0" style={{ color: '#16a34a' }} />
                      : <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: '#3b82f6' }} />
                    }
                    <span style={{ color: '#c8dff0' }}>{s.label}</span>
                    <span className="ml-auto text-[10px] font-medium shrink-0" style={{ color: s.type === 'product' ? '#166534' : '#1e3a8a' }}>
                      {s.type === 'product' ? 'Peptide' : 'Article'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Recent searches — shown when no query and there's history */}
            {!searchQuery && recentSearches.length > 0 && (
              <div
                className="absolute left-4 right-4 top-full mt-1 rounded-xl overflow-hidden z-50"
                style={{ background: '#07121f', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }}
              >
                <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#2a4a6a' }}>Recent searches</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRecentSearches([]);
                      try { localStorage.removeItem('php_recent_searches'); } catch { /* ignore */ }
                    }}
                    className="text-[10px] transition-colors hover:text-white"
                    style={{ color: '#2a4a6a' }}
                  >
                    Clear all
                  </button>
                </div>
                {recentSearches.map((term, i) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      navigate(`/search?q=${encodeURIComponent(term)}`);
                      setIsSearchOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors text-sm hover:bg-white/[0.05]"
                    style={{ borderBottom: i < recentSearches.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                  >
                    <Search className="w-3 h-3 shrink-0" style={{ color: '#2a4a6a' }} />
                    <span style={{ color: '#8caad4' }}>{term}</span>
                    <ArrowRight className="w-3 h-3 ml-auto shrink-0" style={{ color: '#1e3a5a' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </header>}

      {/* Main content */}
      <main
        className="flex-1"
        style={isAuthPage
          ? { paddingTop: 0 }
          : { paddingTop: 'calc(var(--rg-banner-h, 34px) + 32px + 64px + env(safe-area-inset-top))' }
        }
      >
        {children}
      </main>

      {/* Cart / Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[10001] flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) closeCart(); }}>
          <div className="absolute inset-0 bg-black/75 pointer-events-none" />

          <div className="relative w-full max-w-lg bg-gray-900 shadow-2xl border-l border-white/10 flex flex-col" style={{ height: '100dvh', maxHeight: '100dvh' }} onClick={e => e.stopPropagation()}>
            {/* Scroll Up/Down buttons — desktop only */}
            <div className="hidden md:flex flex-col gap-1.5 absolute right-3 top-1/2 -translate-y-1/2 z-10">
              <button
                onClick={() => scrollRef.current?.scrollBy({ top: -300, behavior: 'smooth' })}
                className="w-11 h-11 rounded-full bg-gray-700/80 hover:bg-blue-600 border border-white/10 hover:border-blue-500 flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-lg"
                aria-label="Scroll up"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollRef.current?.scrollBy({ top: 300, behavior: 'smooth' })}
                className="w-11 h-11 rounded-full bg-gray-700/80 hover:bg-blue-600 border border-white/10 hover:border-blue-500 flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-lg"
                aria-label="Scroll down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10 flex-shrink-0" style={{ paddingTop: 'max(20px, calc(20px + env(safe-area-inset-top)))' }}>
              <h2 className="text-lg font-semibold text-white">Cart ({getTotalItems()})</h2>
              <button onClick={closeCart} aria-label="Close cart" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain min-h-0 scroll-smooth"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent' }}
            >

              {
                cart.length === 0 ? (
                  <div className="p-6 flex flex-col items-center justify-center text-center h-64">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                      <ShoppingCart className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-gray-400 mb-4">Your cart is empty</p>
                    <Link
                      to="/products"
                      onClick={closeCart}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Browse Products
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[60vh] p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    
                    {/* Validation Warning */}
                    {hasItemsWithoutVariant && (
                      <div className="p-3 rounded-lg border mb-3" style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.2)' }}>
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-amber-400 font-semibold text-xs mb-0.5">Variant Required</p>
                            <p className="text-amber-400/80 text-[10px] leading-relaxed">
                              Please select a variant for all items before checkout.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cart step indicator */}
                    <div className="flex items-center gap-2 pb-2">
                      {[{ n: 1, label: 'Cart' }, { n: 2, label: 'Details' }, { n: 3, label: 'Payment' }].map(({ n, label }, i) => (
                        <div key={n} className="flex items-center gap-1 flex-1">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${n === 1 ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/30'}`}>{n}</div>
                            <span className={`text-[10px] font-medium whitespace-nowrap ${n === 1 ? 'text-white' : 'text-white/30'}`}>{label}</span>
                          </div>
                          {i < 2 && <div className="flex-1 h-px bg-white/[0.08] mx-1" />}
                        </div>
                      ))}
                    </div>
                    {cart.map(item => {
                      const cartKey = item.variantId ? `${item.id}-${item.variantId}` : String(item.id);
                      const isLowStock = item.stock !== undefined && item.stock > 0 && item.stock <= 5;
                      const isOutOfStock = item.stock !== undefined && item.stock === 0;
                      return (
                        <div key={cartKey} className="flex gap-3 bg-gray-800/50 rounded-xl p-3 border border-white/10">
                          {/* Product Image */}
                          <div className="w-16 h-16 bg-gray-900 rounded-lg overflow-hidden flex-shrink-0">
                            {item.image ? (
                              <img src={item.image} alt={item.name} width="64" height="64" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-6 h-6 text-gray-600" />
                              </div>
                            )}
                          </div>
                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-white text-sm truncate">{item.name}</h3>
                            {(item.variantName || item.dosage) ? (
                              <p className="text-xs text-gray-400">{item.variantName || item.dosage}</p>
                            ) : (
                              <p className="text-xs text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                No variant selected
                              </p>
                            )}
                            <p className="text-blue-400 font-semibold text-sm mt-0.5">£{(item.priceNum * item.quantity).toFixed(2)}</p>
                            {isLowStock && <p className="text-xs text-amber-400 mt-0.5">Only {item.stock} left!</p>}
                            {isOutOfStock && <p className="text-xs text-red-400 mt-0.5">Out of stock</p>}
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex items-center bg-gray-900 rounded-lg border border-white/10">
                                <button onClick={() => updateQuantity(cartKey, -1)} aria-label="Decrease quantity" className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-800 rounded-l-lg text-gray-400 hover:text-white transition-colors">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-7 text-center text-xs font-medium text-white">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(cartKey, 1)}
                                  disabled={isOutOfStock || (item.stock !== undefined && item.quantity >= item.stock)}
                                  aria-label="Increase quantity"
                                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-800 rounded-r-lg text-gray-400 hover:text-white transition-colors disabled:opacity-30"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              <button onClick={() => removeFromCart(cartKey)} aria-label="Remove item from cart" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors rounded-lg -mr-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Recently Viewed in cart */}
                    <RecentlyViewedProducts
                      items={getRecentlyViewed()}
                      variant="compact"
                    />
                  </div>
                )
              }
            </div>

            {/* Drawer Footer */}
              <div className="border-t border-white/10 p-4 space-y-3 bg-gray-900 flex-shrink-0">
                {cart.length > 0 ? (
                  <>
                    {/* Free shipping progress bar */}
                    {getSubtotal() < FREE_SHIPPING_THRESHOLD ? (
                      <div className="bg-[#0a1929] border border-white/[0.08] rounded-xl p-3">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs text-gray-400 flex items-center gap-1.5">
                            <Truck className="w-3 h-3 text-emerald-400" />
                            Add <span className="text-white font-semibold ml-1">£{(FREE_SHIPPING_THRESHOLD - getSubtotal()).toFixed(2)}</span>&nbsp;more for free shipping
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (getSubtotal() / FREE_SHIPPING_THRESHOLD) * 100)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <p className="text-xs text-emerald-400 font-medium">Free UK shipping unlocked on this order!</p>
                      </div>
                    )}
                    {/* Order total */}
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span className="text-gray-400">Total ({getTotalItems()} items)</span>
                      <span className="text-white text-lg">£{getTotalPrice()}</span>
                    </div>
                    <button
                      onClick={() => { if (!hasItemsWithoutVariant) { closeCart(); navigate('/checkout'); } }}
                      disabled={hasItemsWithoutVariant}
                      aria-label="Proceed to checkout"
                      className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                        hasItemsWithoutVariant
                          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white '
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      {hasItemsWithoutVariant ? 'Select variant for all items' : 'Continue to Checkout'}
                    </button>
                    {/* Cart trust badges */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { icon: Lock, label: 'SSL Secure', color: 'text-blue-400' },
                        { icon: BadgeCheck, label: '≥99% HPLC', color: 'text-emerald-400' },
                        { icon: Truck, label: 'UK Based', color: 'text-cyan-400' },
                      ].map(({ icon: Icon, label, color }) => (
                        <div key={label} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                          <Icon className={`w-3.5 h-3.5 ${color}`} />
                          <span className={`text-[10px] font-semibold ${color} uppercase tracking-wide`}>{label}</span>
                        </div>
                      ))}
                    </div>
                    {/* Return to Catalogue */}
                    <Link
                      to="/products"
                      onClick={closeCart}
                      className="w-full py-2.5 rounded-xl border border-white/[0.08] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-[#9cb8d9] hover:text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Return to Catalogue
                    </Link>
                  </>
                ) : null}
              </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PREMIUM FOOTER
      ═══════════════════════════════════════════════════════════════ */}
      {!isAuthPage && <footer className="relative bg-[#03080f] mt-auto overflow-hidden">
        {/* Background glow */}



        {/* Top divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-blue-600/30 to-transparent" />

        {/* ── Newsletter / CTA banner ── */}
        <div className="border-b border-white/[0.05]">
          <div className="container mx-auto px-6 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 rounded-2xl border border-blue-500/15 bg-gradient-to-r from-blue-900/20 via-[#060f1e]/60 to-indigo-900/20 px-7 py-6">
              <div>
                <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-blue-400/70 mb-1">Research Updates</div>
                <div className="text-lg font-bold text-white">Stay at the frontier of peptide science</div>
                <p className="text-[#5a80a6] text-sm mt-1">New arrivals, HPLC reports, and research breakthroughs.</p>
              </div>
              <a
                href="/contact"
                className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-[0_4px_20px_rgba(37,99,235,0.4)] hover:shadow-[0_4px_28px_rgba(37,99,235,0.6)] transition-all duration-200 hover:-translate-y-px border border-blue-400/20"
              >
                <Mail className="w-4 h-4" /> Contact Us
              </a>
            </div>
          </div>
        </div>

        {/* ── Main footer grid ── */}
        <div className="container mx-auto px-6 pt-16 pb-10">
          <div className="grid grid-cols-2 lg:grid-cols-[1.8fr_1fr_1fr_1fr_1fr] gap-8 mb-14">

            {/* Brand column */}
            <div className="col-span-2 lg:col-span-1">
              <a href="/" className="inline-flex items-center gap-3 mb-5 group">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500/15 rounded-xl" />
                  <Logo size="md" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-bold text-white text-[15px] tracking-tight group-hover:text-blue-300 transition-colors">PH Labs</span>
                  <span className="text-[10px] text-blue-300/90 font-medium tracking-widest uppercase">Research Grade</span>
                </div>
              </a>
              <p className="text-[#5a80a6] text-sm leading-relaxed mb-4 max-w-[260px]">
                {siteSettings.footerTagline || 'HPLC-tested, research-grade lyophilised peptides. For laboratory research use only.'}
              </p>

              {/* Quality badges */}
              <div className="flex flex-col gap-2 mb-6">
                {[
                  { icon: FlaskConical, label: '≥99% HPLC Purity', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                  { icon: TestTube, label: 'Third-Party Lab Tested', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
                  { icon: Shield, label: 'UK Registered Company', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
                ].map(b => (
                  <div key={b.label} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${b.bg} border ${b.border} w-fit`}>
                    <b.icon className={`w-3.5 h-3.5 ${b.color}`} />
                    <span className={`text-[11px] font-semibold ${b.color}`}>{b.label}</span>
                  </div>
                ))}
              </div>

              {/* Social icons */}
              <div className="flex items-center gap-2 flex-wrap">
                {siteSettings.whatsappNumber && (
                  <a href={`https://wa.me/${siteSettings.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                    aria-label="Contact us on WhatsApp"
                    className="w-9 h-9 rounded-xl bg-green-600/15 hover:bg-green-600/30 border border-green-600/20 hover:border-green-500/40 flex items-center justify-center text-green-500 hover:text-green-400 transition-all duration-200 hover:-translate-y-px">
                    <WhatsAppIcon className="w-4 h-4" />
                  </a>
                )}
                {siteSettings.facebookUrl && (
                  <a href={siteSettings.facebookUrl} target="_blank" rel="noopener noreferrer"
                    aria-label="Follow us on Facebook"
                    className="w-9 h-9 rounded-xl bg-blue-600/15 hover:bg-blue-600/30 border border-blue-600/20 hover:border-blue-500/40 flex items-center justify-center text-blue-400 hover:text-blue-300 transition-all duration-200 hover:-translate-y-px">
                    <FacebookIcon className="w-3.5 h-3.5" />
                  </a>
                )}
                {siteSettings.instagramUrl && (
                  <a href={siteSettings.instagramUrl} target="_blank" rel="noopener noreferrer"
                    aria-label="Follow us on Instagram"
                    className="w-9 h-9 rounded-xl bg-pink-600/15 hover:bg-pink-600/30 border border-pink-600/20 hover:border-pink-500/40 flex items-center justify-center text-pink-400 hover:text-pink-300 transition-all duration-200 hover:-translate-y-px">
                    <InstagramIcon className="w-4 h-4" />
                  </a>
                )}
                {siteSettings.twitterUrl && (
                  <a href={siteSettings.twitterUrl} target="_blank" rel="noopener noreferrer"
                    aria-label="Follow us on X (Twitter)"
                    className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 hover:border-white/20 flex items-center justify-center text-[#8caad4] hover:text-white transition-all duration-200 hover:-translate-y-px">
                    <TwitterXIcon className="w-3.5 h-3.5" />
                  </a>
                )}
                {siteSettings.youtubeUrl && (
                  <a href={siteSettings.youtubeUrl} target="_blank" rel="noopener noreferrer"
                    aria-label="Subscribe on YouTube"
                    className="w-9 h-9 rounded-xl bg-red-600/15 hover:bg-red-600/30 border border-red-600/20 hover:border-red-500/40 flex items-center justify-center text-red-400 hover:text-red-300 transition-all duration-200 hover:-translate-y-px">
                    <YoutubeIcon className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Products column */}
            <div>
              <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-400/70 mb-5 flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5" /> Products
              </h3>
              <ul className="space-y-2.5">
                <li>
                  <a href="/products" className="group flex items-center gap-2 text-[#5a80a6] hover:text-[#8caad4] transition-colors text-sm">
                    <span className="w-1 h-1 rounded-full bg-blue-600/40 group-hover:bg-blue-400 transition-colors flex-shrink-0" />
                    All Peptides
                  </a>
                </li>
                {(() => {
                  const activeProds = searchProducts.filter(p => p.isActive !== false && p.stock > 0);
                  const cats = Array.from(
                    new Map(
                      activeProds
                        .filter(p => p.category)
                        .map(p => {
                          const slug = p.category!.toLowerCase().replace(/\s+/g, '-');
                          const label = p.category!.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                          return [slug, label] as [string, string];
                        })
                    ).entries()
                  );
                  return cats.map(([slug, label]) => (
                    <li key={slug}>
                      <a href={`/products?category=${slug}`} className="group flex items-center gap-2 text-[#5a80a6] hover:text-[#8caad4] transition-colors text-sm">
                        <span className="w-1 h-1 rounded-full bg-blue-600/40 group-hover:bg-blue-400 transition-colors flex-shrink-0" />
                        {label}
                      </a>
                    </li>
                  ));
                })()}
                {isVip && (
                  <li>
                    <a href="/vip" className="group flex items-center gap-2 text-[#5a80a6] hover:text-[#8caad4] transition-colors text-sm">
                      <span className="w-1 h-1 rounded-full bg-blue-600/40 group-hover:bg-blue-400 transition-colors flex-shrink-0" />
                      VIP Store
                    </a>
                  </li>
                )}
              </ul>
            </div>

            {/* Company column */}
            <div>
              <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-400/70 mb-5 flex items-center gap-2">
                <Microscope className="w-3.5 h-3.5" /> Company
              </h3>
              <ul className="space-y-2.5">
                {[
                  { label: 'About Us', href: '/about' },
                  { label: 'Quality Control', href: '/quality-control' },
                  { label: 'Research Library', href: '/resources' },
                  { label: 'HPLC Lab Reports', href: '/lab-reports' },
                  { label: 'FAQ', href: '/#faq' },
                  { label: 'Contact Us', href: '/contact' },
                  { label: 'Storage Guide', href: '/storage-guide' },
                  
                ].map(l => (
                  <li key={l.label}>
                    <a href={l.href} className="group flex items-center gap-2 text-[#5a80a6] hover:text-[#8caad4] transition-colors text-sm">
                      <span className="w-1 h-1 rounded-full bg-blue-600/40 group-hover:bg-blue-400 transition-colors flex-shrink-0" />
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal column */}
            <div>
              <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-400/70 mb-5 flex items-center gap-2">
                <Dna className="w-3.5 h-3.5" /> Legal
              </h3>
              <ul className="space-y-2.5">
                {[
                  { label: 'Terms & Conditions', href: '/terms-and-conditions' },
                  { label: 'Privacy Policy', href: '/privacy-policy' },
                  { label: 'Refund Policy', href: '/refund-policy' },
                  { label: 'Shipping Policy', href: '/shipping-policy' },
                  { label: 'Cookie Policy', href: '/cookies' },
                ].map(l => (
                  <li key={l.label}>
                    <Link to={l.href} className="group flex items-center gap-2 text-[#5a80a6] hover:text-[#8caad4] transition-colors text-sm">
                      <span className="w-1 h-1 rounded-full bg-blue-600/40 group-hover:bg-blue-400 transition-colors flex-shrink-0" />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact column */}
            <div>
              <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-400/70 mb-5 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> Contact
              </h3>
              <div className="space-y-3 mb-6">
                <p className="font-semibold text-sm" style={{ color: '#7a9ec2' }}>PH Labs Ltd</p>
                <p className="text-xs" style={{ color: '#5a80a6' }}>Registered in England &amp; Wales</p>
                <a href="mailto:info@phlabs.co.uk"
                  className="group flex items-center gap-2 text-[#5a80a6] hover:text-[#8caad4] transition-colors text-sm break-all">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0 text-blue-500/60 group-hover:text-blue-400 transition-colors" />
                  info@phlabs.co.uk
                </a>
                {siteSettings.contactPhone && (
                  <a href={`tel:${siteSettings.contactPhone}`}
                    className="group flex items-center gap-2 text-[#5a80a6] hover:text-[#8caad4] transition-colors text-sm">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-blue-500/60 group-hover:text-blue-400 transition-colors" />
                    {siteSettings.contactPhone}
                  </a>
                )}
                {siteSettings.whatsappNumber && (
                  <a href={`https://wa.me/${siteSettings.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                    className="group flex items-center gap-2 text-[#8aa8c8] hover:text-green-400 transition-colors text-sm">
                    <WhatsAppIcon className="w-3.5 h-3.5 flex-shrink-0 text-green-600/50 group-hover:text-green-400 transition-colors" />
                    WhatsApp
                  </a>
                )}
              </div>
              {/* Payment info */}
              <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.1)' }}>
                <div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#9cb8d9' }}>Secure Payment</div>
                <p className="text-[11px] leading-relaxed" style={{ color: '#8aa8c8' }}>
                  Secure Open Banking / Pay by Bank — FCA-regulated, bank-grade security. No card details stored.
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { icon: Lock, label: 'SSL Secure' },
                    { icon: Shield, label: 'FCA-Regulated' },
                    { icon: Landmark, label: 'Open Banking' },
                  ].map(({ icon: BIcon, label }) => (
                    <div key={label} className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}>
                      <BIcon className="w-2.5 h-2.5 text-blue-500/60" />
                      <span className="text-[10px] font-semibold" style={{ color: '#9cb8d9' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Payment & Security section ── */}
          <div className="border-t border-white/[0.05] pt-8 mb-8">
            {/* Payment & Security card */}
            <div className="rounded-2xl border border-green-500/15 bg-green-500/[0.04] p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-green-400/80">Payment &amp; Security</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Open Banking */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Landmark className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[#c8daf0] text-xs font-semibold mb-0.5">Secure Open Banking / Pay by Bank</p>
                    <p className="text-[#8aa8c8] text-[11px] leading-relaxed">
                      Payments processed directly via your bank — no card details stored. FCA-regulated, bank-grade security.
                    </p>
                  </div>
                </div>
                {/* SSL */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-[#c8daf0] text-xs font-semibold mb-0.5">256-bit SSL Encryption</p>
                    <p className="text-[#8aa8c8] text-[11px] leading-relaxed">
                      All data transmitted over this site is protected by industry-standard TLS/SSL encryption.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                { icon: Lock, label: '256-bit SSL Encrypted', color: 'text-green-400', bg: 'bg-green-500/[0.07]', border: 'border-green-500/15' },
                { icon: Landmark, label: 'Open Banking / Pay by Bank', color: 'text-blue-400', bg: 'bg-blue-500/[0.07]', border: 'border-blue-500/15' },
                { icon: BadgeCheck, label: 'FCA-Regulated Payments', color: 'text-sky-400', bg: 'bg-sky-500/[0.07]', border: 'border-sky-500/15' },
                { icon: FlaskConical, label: 'HPLC Lab Tested', color: 'text-indigo-400', bg: 'bg-indigo-500/[0.07]', border: 'border-indigo-500/15' },
                { icon: MapPin, label: 'UK Based & Registered', color: 'text-blue-400', bg: 'bg-blue-500/[0.07]', border: 'border-blue-500/15' },
              ].map(b => (
                <div key={b.label} className={`flex items-center gap-2 px-3.5 py-2 rounded-xl ${b.bg} border ${b.border}`}>
                  <b.icon className={`w-3.5 h-3.5 ${b.color} shrink-0`} />
                  <span className={`${b.color} text-[10px] font-semibold tracking-wide`}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── MHRA Disclaimer ── */}
          {siteSettings.mhraDisclaimerEnabled !== false && (
            <div className="border border-amber-500/25 bg-amber-500/[0.06] rounded-2xl px-6 py-5 mb-6">
              <p className="text-[11px] text-amber-300/85 font-semibold text-center leading-relaxed uppercase tracking-[0.06em]">
                ⚠ All products sold by PH Labs are strictly for laboratory research use only. Not for human or veterinary consumption. Not intended to diagnose, treat, cure or prevent any disease. Products have not been evaluated or approved by the MHRA or FDA. Must be 18+ to purchase.
              </p>
            </div>
          )}

          {/* Purity badge strip */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
            {[
              '≥99% HPLC Purity',
              'Third-Party Lab Tested',
              'UK Registered Company',
              'CoA With Every Order',
            ].map(badge => (
              <span key={badge} className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#2a4060' }}>
                {badge}
              </span>
            ))}
          </div>

          {/* ── Bottom bar ── */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-[#1e3a60] text-xs">
              © 2026 PH Labs Ltd. All rights reserved. Registered in England &amp; Wales.
              {siteSettings.companyRegNumber && <> Company No. {siteSettings.companyRegNumber}.</>}
              {siteSettings.companyAddress && <> {siteSettings.companyAddress}.</>}
            </p>
            <p className="text-[#1a3050] text-xs text-center md:text-right">
              For laboratory research use only. Not for human or veterinary consumption.
            </p>
          </div>
        </div>
      </footer>}

      {/* GDPR Cookie Consent Banner */}
      {siteSettings.cookieConsentEnabled && <CookieConsent />}

      {/* Admin Quick-Access Button — only visible to admins */}
      {isAdmin && (
        <div className="fixed z-[9999]" style={{ bottom: '5.5rem', right: '1.5rem' }}>
          {/* Tooltip label */}
          <div className="group relative flex items-center justify-end">
            <Link
              to="/admin"
              aria-label="Admin panel"
              className="flex items-center gap-3"
              style={{ textDecoration: 'none' }}
            >
              {/* Tooltip — visible on hover of the link */}
              <span
                className="opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 bg-[#0b1a30] border border-white/10 text-white text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap pointer-events-none select-none"
                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
              >
                Admin Panel
              </span>
              {/* Circle button */}
              <div
                className="w-14 h-14 rounded-full bg-[#0d1f3c] border-2 border-blue-500/50 flex items-center justify-center group-hover:bg-[#1a3a6c] group-hover:border-blue-400 group-hover:scale-110 active:scale-95 transition-all duration-300 shrink-0"
                style={{ boxShadow: '0 4px 20px rgba(37,99,235,0.35)' }}
              >
                <SettingsIcon
                  className="text-blue-400 group-hover:text-blue-200 transition-all duration-300 group-hover:rotate-45"
                  style={{ width: 22, height: 22 }}
                />
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* WhatsApp Floating Button */}
      {siteSettings.whatsappNumber && !location.pathname.startsWith('/checkout') && (
        <a
          href={`https://wa.me/${siteSettings.whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          className="fixed bottom-24 right-6 z-50 group flex items-center gap-3"
          style={{ filter: 'drop-shadow(0 4px 20px rgba(37,211,102,0.4))' }}
        >
          {/* Tooltip */}
          <span
            className="hidden sm:block opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 bg-[#0b1a30] border border-white/10 text-white text-xs font-semibold px-3 py-2 rounded-xl whitespace-nowrap pointer-events-none"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
          >
            Chat with us
          </span>
          {/* Button */}
          <div className="relative w-11 h-11 shrink-0">
            {/* Pulse rings */}
            <span className="absolute inset-0 rounded-full bg-[#25D366]/40 animate-ping" style={{ animationDuration: '2s' }} />
            <span className="absolute inset-1 rounded-full bg-[#25D366]/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.4s' }} />
            {/* Main circle */}
            <span className="absolute inset-0 w-11 h-11 rounded-full bg-[#25D366] group-hover:bg-[#1ebe5c] flex items-center justify-center transition-all duration-300 group-hover:scale-110 active:scale-95 shadow-[0_4px_24px_rgba(37,211,102,0.5)]">
              <WhatsAppIcon className="w-5 h-5 text-white" />
            </span>
          </div>
        </a>
      )}

      {/* ── Sticky MHRA Disclaimer Bar — hidden on auth/admin pages ── */}
      {!isCleanPage && <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        <div
          className="px-4 py-2.5 text-center"
          style={{
            background: 'linear-gradient(to top, rgba(4,8,18,0.98) 0%, rgba(4,8,18,0.92) 100%)',
            borderTop: '1px solid rgba(245,158,11,0.2)',
          }}
        >
          <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(245,158,11,0.7)' }}>
            <span className="font-bold">Research use only.</span>{' '}
            All products are strictly for laboratory research. Not for human or veterinary consumption. Not intended to diagnose, treat, cure or prevent any disease. Not evaluated by MHRA or FDA. 18+ only.
          </p>
        </div>
      </div>}

    </div>
  );
}

// Export helper for product pages to add items via event
export const cartEventName = 'php:add-to-cart';
export function dispatchAddToCart(item: CartItem) {
  window.dispatchEvent(new CustomEvent(cartEventName, { detail: item }));
}
