import { ReactNode, useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, X, Plus, Minus, Trash2, User as UserIcon,
  Mail, MapPin, Package, CheckCircle2, ChevronLeft,
  Shield, AlertTriangle, ChevronUp, ChevronDown,
  FlaskConical, BookOpen,
  ArrowRight, Microscope, TestTube, Dna, Settings as SettingsIcon,
  Lock, Landmark, BadgeCheck, Search, Truck, Menu
} from 'lucide-react';
// Type-only import: erased at build time, so the Firebase SDK stays out of
// the initial bundle. All runtime access goes through dynamic import()
// inside effects (the SDK chunk loads once, on demand, after first paint).
import type { FirebaseUser, Product } from '@/lib/firebase';
import { excludeVipProducts } from '@/lib/vip-visibility';


// Articles bundle (~196KB) is loaded lazily — only when the search panel opens —
// to keep it off the critical path of every page render.
type ArticleLite = { title: string; subtitle?: string; slug: string };
// Lazy: cookie banner only paints once, after hydration — off the LCP critical path.
const CookieConsent = lazy(() => import('@/components/CookieConsent').then(m => ({ default: m.CookieConsent })));
// Lazy: pulls framer-motion (~40 KB gz). Only rendered inside the cart drawer,
// which is closed at first paint — keep it off the LCP critical path.
const RecentlyViewedProducts = lazy(() =>
  import('@/components/RecentlyViewedProducts').catch(async (err) => {
    // Stale hashed chunk after redeploy — hard reload so the fresh HTML loads.
    const { isStaleChunkError, hardReload } = await import('@/lib/recovery');
    if (isStaleChunkError(err)) {
      void hardReload({ clean: true });
    }
    // Render nothing rather than crash the cart drawer / product page.
    return { default: () => null };
  }),
);
import { getRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { migrateStoredCart } from '@/lib/cart-migration';
import { initAnalytics, trackPageView, trackAddToCart, trackBeginCheckout, renderGoogleMerchantBadge } from '@/lib/analytics';
import { merchantItemId } from '@/lib/merchant-item-id';
import { logCartEvent, safeCartWrite, safeCartRead } from '@/lib/cart-telemetry';
import TransactionalLink from '@/components/TransactionalLink';
import LegacyHostNotice from '@/components/LegacyHostNotice';
import { isLegacyHost, transactionalHref, buildTransactionalHrefWithCart } from '@/lib/legacy-host';


import { Logo } from './Logo';
import { UnderConstruction } from './UnderConstruction';
import ResearchGate, { isResearchConfirmed } from './ResearchGate';
import { Navigation } from './Navigation';
import LiveSalesPopup from './LiveSalesPopup';
import { WhatsAppIcon, FacebookIcon, InstagramIcon, TwitterXIcon, YoutubeIcon } from './SocialIcons';
import { useMarketingRevalidate } from '@/hooks/useMarketingRevalidate';
import { initVisitorTracking, trackVisitorPageView } from '@/lib/visitor-tracking';
import { DisclaimerBanner } from './DisclaimerBanner';
import TopStripe from './TopStripe';
import { SHIPPING_CONFIG } from '@/lib/shipping/next-day';

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
  // Batch verification feature (/verify) — absent means ON
  verifyBatchEnabled?: boolean;
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
  
}

const FREE_SHIPPING_THRESHOLD = 50;

// Navigation is handled by Navigation.tsx component

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  // /contact is the Google Ads landing page — keep its chrome free of
  // peptide-named elements (policy bot follows the bridge-page CTA here).
  // Ads-safe pages: destinations used by Google Ads (bridge CTA + sitelinks).
  // On these routes the chrome stays policy-neutral (no Peptides nav, no
  // disclaimers, no HPLC badges) — same content for users and bots.
  const isContactPage = ['/contact', '/shipping-policy', '/privacy-policy'].includes(location.pathname);

  // Research-gate content hold (CLS): on the homepage, unconfirmed visitors
  // get ONLY the gate overlay from the first frame — no page content renders
  // behind it, so the async hero/banner/product-grid renders can't shift the
  // layout while the modal is open (measured as CLS 0.211 on mobile
  // Lighthouse; previously 0.123). Confirmed users, search/social bots and
  // the ads crawler see the full page immediately (bot UA auto-confirms,
  // so SEO/prerender output is unchanged). Post-confirm renders are excluded
  // from CLS by the hadRecentInput rule.
  const isHomePage = location.pathname === '/';
  const [researchConfirmed, setResearchConfirmed] = useState<boolean>(() => isResearchConfirmed());
  useEffect(() => {
    const onCleared = () => setResearchConfirmed(isResearchConfirmed());
    window.addEventListener('php:research-gate-cleared', onCleared);
    return () => window.removeEventListener('php:research-gate-cleared', onCleared);
  }, []);
  const holdForResearchGate = isHomePage && !researchConfirmed;
  // Peptide Supermarket badge: self-hosted from /public/images (the remote
  // SVG on peptidesupermarket.co.uk sends Cross-Origin-Resource-Policy, so
  // browsers block it as <img> — it rendered as a blank broken image).
  // If the file is missing the badge hides instead of showing a broken icon.
  const [psBadgeOk, setPsBadgeOk] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [addToast, setAddToast] = useState<string | null>(null);
  const addToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global marketing revalidation subscription. Lives in Layout so EVERY
  // storefront route (current and future) automatically clears its banner /
  // advert localStorage caches and receives a `marketing:revalidate` window
  // event the moment an admin saves in BannerTab / AdvertsTab. Per-page
  // refetch logic (Home / Products / ProductDetail) also calls the hook
  // directly for explicit refetch; this guarantees future pages that mount
  // MarketingAdvertSlot or read settings/promoBanner are covered too.
  useMarketingRevalidate(() => { /* cache clear + event dispatch handled in hook */ });

  // First-party visitor analytics — feeds the Admin → Visitors tab so we can
  // see how many people visited and how long they stayed without depending
  // on GA4. Skips /admin routes internally.
  useEffect(() => { initVisitorTracking(); }, []);
  useEffect(() => {
    trackVisitorPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);




  // Body scroll lock + scroll-to-top while cart/mobile-menu overlay is open,
  // so the fixed drawer is always anchored to the top of the viewport on
  // mobile/tablet/desktop (otherwise users land mid-page and have to scroll
  // up manually to see the drawer contents).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const open = isCartOpen || isMobileMenuOpen;
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isCartOpen, isMobileMenuOpen]);

  // While the mobile nav drawer is open, mark the body so global CSS
  // can hide the shipping bar, research-gate tape, and cookie banner —
  // giving the drawer full ownership of the mobile viewport.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const cls = 'mobile-drawer-open';
    if (isMobileMenuOpen) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => { document.body.classList.remove(cls); };
  }, [isMobileMenuOpen]);


  // Google Analytics 4 — load once on mount, then fire page_view on every SPA route change
  useEffect(() => {
    let id: string | undefined;
    try {
      const cached = localStorage.getItem('php_site_settings');
      if (cached) id = (JSON.parse(cached) as { googleAnalyticsId?: string }).googleAnalyticsId?.trim() || undefined;
    } catch { /* ignore */ }
    initAnalytics(id);
    // Recover purchase conversions for buyers who never returned to the
    // checkout success page after the bank app-switch.
    void import('@/lib/purchase-recovery').then((m) => m.recoverPendingPurchase());
    // Google Customer Reviews floating badge (sitewide trust signal).
    // Skips admin/auth pages where the badge would obscure UI.
    // Deferred until first user interaction OR 10s — whichever comes first.
    // Keeps the third-party widget script off LCP/TBT path on home.
    const path = window.location.pathname;
    const skip = path.startsWith('/admin') || path === '/login' || path === '/register';
    if (!skip) {
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        cleanup();
        renderGoogleMerchantBadge({ position: 'BOTTOM_RIGHT', region: 'GB' });
      };
      const events: Array<keyof WindowEventMap> = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
      const cleanup = () => {
        events.forEach(ev => window.removeEventListener(ev, fire));
        clearTimeout(t);
      };
      events.forEach(ev => window.addEventListener(ev, fire, { once: true, passive: true } as AddEventListenerOptions));
      const t = setTimeout(fire, 10000);
      return cleanup;
    }
  }, []);
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);



  // Auth pages handle their own full-screen layout — no nav padding needed
  const isAuthPage = ['/login', '/register'].includes(location.pathname);
  // Admin also gets clean layout — no overlapping fixed bars
  const isAdminPage = location.pathname.startsWith('/admin');
  const isLandingPage = location.pathname.startsWith('/landing');
  const isCleanPage = isAuthPage || isAdminPage;
  const researchBannerOffset = isLandingPage ? '0px' : 'var(--rg-banner-h, 0px)';
  const disclaimerVisible = !isCleanPage && !isLandingPage;
  const layoutVars = {
    // --phl-disclaimer-h is controlled by DisclaimerBanner component
  } as CSSProperties;
  
  // Check if any cart items have no variant selected
  // An item has a selected variant if ANY of variantId / variantName / dosage
  // is populated. Legacy cached carts on Safari/iPhone (where localStorage
  // survives across deploys) may only carry `variantId` + `variantName`
  // without a `dosage` string — those must NOT trip the "Variant Required"
  // gate, otherwise the customer sees the correct variant on the row but
  // cannot check out.
  const hasItemsWithoutVariant = useMemo(() => {
    return cart.some(item => {
      const hasVariantId = typeof item.variantId === 'string' && item.variantId.trim() !== '';
      const hasVariantName = typeof item.variantName === 'string' && item.variantName.trim() !== '';
      const hasDosage = typeof item.dosage === 'string' && item.dosage.trim() !== '';
      return !hasVariantId && !hasVariantName && !hasDosage;
    });
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
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('php_recent_searches') || '[]');
      if (Array.isArray(saved)) setRecentSearches(saved);
    } catch { /* ignore */ }
  }, []);

  // Track whether the initial cart hydration from localStorage has completed.
  // Until it has, we must NOT persist the empty initial React state — otherwise
  // we'd clobber the stored cart on first paint.
  const cartHydratedRef = useRef(false);

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
        const saved = safeCartRead<CartItem[] | null>('php_cart', null, 'layout:hydrate');
        if (saved && Array.isArray(saved)) setCart(saved);
      } catch (e) {
        const err = e as { name?: string; message?: string };
        logCartEvent({
          type: 'storage_read_failure',
          key: 'php_cart',
          code: err?.name || 'hydrate_error',
          message: err?.message || 'cart hydration failed',
          source: 'layout:hydrate',
        });
      }
      finally { cartHydratedRef.current = true; }
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
      import('@/lib/firebase').then(({ getDoc, doc, db }) =>
      getDoc(doc(db, 'settings', 'siteSettings')).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          const trueLayerOn = data.trueLayerEnabled !== undefined ? Boolean(data.trueLayerEnabled) : false;
          const bankOn = data.bankTransferEnabled !== undefined ? Boolean(data.bankTransferEnabled) : true;
          setSiteSettings(prev => ({ ...prev, ...data, trueLayerEnabled: trueLayerOn, bankTransferEnabled: bankOn }));
          try { localStorage.setItem('php_site_settings', JSON.stringify(data)); } catch { /* ignore */ }
        }
      }).catch(() => {}));
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(load, { timeout: 5000 });
    } else {
      setTimeout(load, 1000);
    }
  }, []);

  // Save cart to localStorage synchronously. Previously deferred via
  // requestIdleCallback, but the cleanup cancelled the pending save on
  // unmount — clicking "Continue to Checkout" right after Add to Cart
  // raced the idle callback, the write was cancelled, and the checkout
  // route then read `null` from localStorage and showed "Your cart is
  // empty" while the header badge still showed the in-memory count.
  useEffect(() => {
    try {
      // Don't clobber a persisted non-empty cart with the empty initial
      // state — on a fresh mount React renders cart=[] before the load
      // effect runs, and this save effect would otherwise wipe the
      // localStorage written synchronously by dispatchAddToCart.
      // After hydration completes, always persist (including empty cart,
      // so removing all items doesn't bring them back on next mount).
      if (cart.length === 0 && !cartHydratedRef.current) {
        const existing = localStorage.getItem('php_cart');
        if (existing && existing !== '[]' && existing !== 'null') return;
      }
      // Detect an unexpected clear: hydrated, in-memory empty, but persisted non-empty.
      if (cart.length === 0 && cartHydratedRef.current) {
        try {
          const existing = localStorage.getItem('php_cart');
          if (existing && existing !== '[]' && existing !== 'null') {
            const parsed = JSON.parse(existing);
            if (Array.isArray(parsed) && parsed.length > 0) {
              logCartEvent({
                type: 'cart_cleared_unexpectedly',
                memoryCount: 0,
                storedCount: parsed.length,
                source: 'layout:save',
                message: 'In-memory cart became empty while localStorage still had items',
              });
            }
          }
        } catch { /* ignore */ }
      }
      safeCartWrite('php_cart', JSON.stringify(cart), 'layout:save');
    } catch (e) {
      const err = e as { name?: string; message?: string };
      logCartEvent({
        type: 'unknown_error',
        code: err?.name || 'save_effect',
        message: err?.message || 'cart save effect crashed',
        source: 'layout:save',
      });
    }
  }, [cart]);

  // Auth state listener
  useEffect(() => {
    // Complete Google sign-in redirect flow (mobile). Safe to call always —
    // it's a no-op when there's no pending redirect.
    import('@/lib/firebase').then(m => {
      m.completeGoogleRedirect?.().catch(() => { /* ignore */ });
    }).catch(() => { /* ignore */ });

    let unsub: (() => void) | undefined;
    let cancelled = false;
    import('@/lib/firebase').then(({ onAuthStateChanged, auth, getDoc, doc, db }) => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (user) => {
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
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; unsub?.(); };
  }, []);

  // Idle auto-logout — sign user out after 30 minutes of inactivity.
  // Previously 60 seconds, which logged users out mid-read and broke
  // checkout flows. Admin has its own stricter 15-min handler.
  useEffect(() => {
    if (!firebaseUser) return;
    if (location.pathname.startsWith('/admin')) return; // admin owns its own idle flow

    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const doLogout = () => {
      import('@/lib/firebase').then(m => m.logoutUser?.()).catch(() => { /* ignore */ });
    };

    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(doLogout, IDLE_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'visibilitychange'] as const;
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions));
    reset();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [firebaseUser, location.pathname]);




  // Legacy mirror: bulletproof cart handoff. ANY click that would navigate
  // to /checkout (menu links, promo CTAs, future buttons — not just the
  // drawer CTA above) is rewritten to carry the cart in the URL, because
  // localStorage doesn't cross origins. The canonical /checkout imports it.
  useEffect(() => {
    if (!isLegacyHost()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      let isCheckout = false;
      try {
        const u = new URL(anchor.getAttribute('href') || '', window.location.origin);
        isCheckout = u.pathname === '/checkout' || u.pathname.startsWith('/checkout/');
      } catch { return; }
      if (!isCheckout) return;
      e.preventDefault();
      window.location.href = buildTransactionalHrefWithCart('/checkout', cart);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [cart]);

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
      import('@/lib/firebase').then(({ getAllProducts }) => getAllProducts()).then((prods) => {
        if (!cancelled) setSearchProducts(excludeVipProducts(prods));
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

  const shippingCost = useMemo(() => subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_CONFIG.standardPrice, [subtotal]);
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
    // Show a small toast instead of auto-opening the drawer so the page
    // doesn't jump and the researcher can keep adding more blends in one go.
    setAddToast(`Added ${item.name}${item.dosage ? ` · ${item.dosage}` : ''} — keep adding or open cart`);
    if (addToastTimer.current) clearTimeout(addToastTimer.current);
    addToastTimer.current = setTimeout(() => setAddToast(null), 2800);
    try {
      trackAddToCart({
        item_id: merchantItemId(item.id),
        item_name: item.name,
        item_variant: item.dosage || item.variantId,
        price: item.priceNum || Number(item.price) || 0,
        quantity: 1,
        currency: 'GBP',
      });
    } catch { /* analytics never breaks UX */ }
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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col" style={layoutVars}>
      {/* Research confirmation gate + sticky research banner */}
      {!isCleanPage && !isLandingPage && !isContactPage && <ResearchGate forceOpen={holdForResearchGate} />}

      {/* Maintenance Mode — admins bypass */}
      {siteSettings.maintenanceMode && !isAdmin && (
        <UnderConstruction targetDate={siteSettings.maintenanceEndDate || undefined} />
      )}

      {/* ═══════════════════════════════════════════════════════════════
          UNIFIED TOP STRIPE — replaces the legacy shipping bar +
          yellow research tape + promo. Rotating messages, dismissible,
          hidden on auth/admin pages. Height 36px.
      ═══════════════════════════════════════════════════════════════ */}
      {!isCleanPage && <TopStripe />}

      {/* ═══════════════════════════════════════════════════════════════
          PREMIUM NAVBAR — hidden on auth pages
      ═══════════════════════════════════════════════════════════════ */}
      {!isAuthPage && <header
        className={`site-header fixed left-0 right-0 border-b border-white/[0.06] ${isMobileMenuOpen ? 'z-[10020]' : 'z-[100]'}`}
        style={{ background: '#030a14', top: `calc(${researchBannerOffset} + 36px)`, paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <div className="w-full pl-4 pr-4 sm:pl-4 sm:pr-6">
          <div className="navbar flex items-center justify-between h-[64px]">

            {/* ── Logo (far left) ── */}
            <Link to="/" className="flex flex-col self-center min-w-0 mr-auto group">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="site-logo-wrap relative shrink-0 flex items-center" style={{ height: '48px', width: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Logo size="lg" />
                </div>
                <div className="flex flex-col leading-[1.05] min-w-0">
                  <span className="font-extrabold text-white text-[18px] sm:text-[22px] tracking-tight group-hover:text-emerald-300 transition-colors duration-200 truncate">PH Labs</span>
                  <span className="text-[10px] sm:text-[11px] text-emerald-400/90 font-semibold tracking-[0.22em] uppercase mt-0.5">Research Grade</span>
                </div>
              </div>
              {/* Disclaimer moved to DisclaimerBanner component below header */}
            </Link>

            {/* ── Desktop + Mobile Nav (Navigation component) ── */}
            <Navigation
              user={firebaseUser}
              isAdmin={isAdmin}
              isMobileMenuOpen={isMobileMenuOpen}
              onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            />
            {/* ── Right actions ── */}
            <div className="flex items-center gap-1.5 sm:gap-1.5 shrink-0 pl-2">


              {/* Browse CTA */}
              {!isContactPage && (
              <a
                href="/products"
                className="group hidden lg:inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:via-emerald-400 hover:to-emerald-500 text-white text-[13px] font-bold rounded-xl transition-all duration-300 border border-emerald-400/30 hover:border-emerald-400/50 relative overflow-hidden"
              >
                <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
                <FlaskConical className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">Browse Peptides</span>
              </a>
              )}

              {/* Account */}
              {firebaseUser ? (
                <TransactionalLink
                  to="/account"
                  className="group hidden md:flex items-center gap-1.5 px-3 py-2 text-[#7a9ec8] hover:text-white hover:bg-white/[0.06] rounded-xl text-[13px] font-medium transition-all duration-300 border border-transparent hover:border-white/[0.08]"
                >
                  <UserIcon className="w-4 h-4 text-blue-400/60 group-hover:text-emerald-400 transition-colors" />
                  <span>Account</span>
                </TransactionalLink>
              ) : (
                <TransactionalLink
                  to="/login"
                  className="group hidden md:flex items-center gap-1.5 px-3 py-2 text-[#7a9ec8] hover:text-white hover:bg-white/[0.06] rounded-xl text-[13px] font-medium transition-all duration-300 border border-transparent hover:border-white/[0.08]"
                >
                  <UserIcon className="w-4 h-4 text-blue-400/60 group-hover:text-emerald-400 transition-colors" />
                  <span>Login</span>
                </TransactionalLink>
              )}


              {/* Day / Night theme toggle disabled per request */}

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
              <label htmlFor="site-search" className="sr-only">Search</label>
              <input
                ref={searchInputRef}
                id="site-search"
                name="q"
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
                aria-label="Search peptides, articles, guides"
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

      {/* Professional disclaimer banner — full-width amber strip below header */}
      {disclaimerVisible && !isContactPage && <DisclaimerBanner />}

      {/* Main content (withheld on home until the research gate is confirmed) */}
      {!holdForResearchGate && (
      <main
        className="flex-1"
        style={isAuthPage
          ? { paddingTop: 0 }
          : { paddingTop: 'calc(var(--rg-banner-h, 0px) + 36px + 64px + var(--phl-disclaimer-h, 0px) + env(safe-area-inset-top))' }
        }
      >
        {children}
      </main>
      )}

      <LiveSalesPopup />

      {/* Cart / Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[10001] flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) closeCart(); }}>
          <div className="absolute inset-0 bg-black/75 pointer-events-none" />

          <div data-cart-scope className="relative w-full max-w-lg bg-gray-900 shadow-2xl border-l border-white/10 flex flex-col" style={{ height: '100dvh', maxHeight: '100dvh' }} onClick={e => e.stopPropagation()}>
            {/* Scroll Up/Down buttons — desktop only */}
            <div className="hidden md:flex flex-col gap-1.5 absolute right-3 top-1/2 -translate-y-1/2 z-10">
              <button
                onClick={() => scrollRef.current?.scrollBy({ top: -300, behavior: 'smooth' })}
                className="w-11 h-11 rounded-full bg-gray-700/80 hover:bg-blue-600 border border-white/10 hover:border-blue-500 flex items-center justify-center text-gray-200 hover:text-white transition-all shadow-lg"
                aria-label="Scroll up"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollRef.current?.scrollBy({ top: 300, behavior: 'smooth' })}
                className="w-11 h-11 rounded-full bg-gray-700/80 hover:bg-blue-600 border border-white/10 hover:border-blue-500 flex items-center justify-center text-gray-200 hover:text-white transition-all shadow-lg"
                aria-label="Scroll down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>