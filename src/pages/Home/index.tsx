import { ArrowRight, CheckCircle2, ShieldCheck, Zap, Mail, Microscope, CreditCard, Truck, Flame, Star, Dna, Activity, Brain, RefreshCw, Shield, Snowflake, FileCheck, FlaskConical, ChevronDown, Lock, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSSRBanner } from '@/legacy/SSRDataContext';

import { Link } from 'react-router-dom';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import HomeSeoIndex from '@/components/HomeSeoIndex';
import MarketingAdvertSlot from '@/components/MarketingAdvertSlot';
import { getProductImage } from '@/lib/productImages';
import type { Product } from '@/lib/firebase';
// Firebase is dynamically imported below to keep it off the home-route critical chunk.
const loadFirebase = () => import('@/lib/firebase');
import { nameToSlug } from '@/lib/seedProducts';
import { sendPublicMail } from '@/lib/sendPublicMail';
import { cfImgProps } from '@/lib/cf-image';


import { useSEO } from '@/hooks/useSEO';

// Route-critical components must stay eager. Lazy route/page chunks with
// empty loading fallbacks caused staging to render a persistent blank loader
// after publish when returning browsers held stale chunks.

// ── Static data ───────────────────────────────────────────────────────────────

const trustBadges = [
  { icon: ShieldCheck, title: 'HPLC Verified', desc: '≥99% Purity' },
  { icon: Microscope, title: 'Mass Spec Confirmed', desc: 'Identity verified' },
  { icon: Truck, title: 'UK Dispatch', desc: '1–3 day delivery' },
  { icon: CreditCard, title: 'Secure Checkout', desc: '256-bit SSL' },
  { icon: CheckCircle2, title: 'CoA Included', desc: 'Every order' },
];

const benefits = [
  {
    icon: Activity,
    label: 'Tissue & Musculoskeletal Research',
    title: 'BPC-157 & TB-500',
    desc: 'Laboratory studies investigate BPC-157 and TB-500 (Thymosin Beta-4) in models of tendon, ligament, and gastric tissue. Preclinical data explores angiogenesis, cytokine modulation, and cell migration pathways.',
    tag: 'Most Researched',
    color: '#10b981',
    slug: '/products',
  },
  {
    icon: Flame,
    label: 'Incretin & Metabolic Research',
    title: 'GLP-1 Compounds',
    desc: 'Semaglutide, Tirzepatide and Retatrutide are studied in preclinical models for GLP-1/GIP receptor agonism and metabolic pathway effects. Supplied for laboratory research use only.',
    tag: 'Active Research',
    color: '#3b82f6',
    slug: '/products',
  },
  {
    icon: Brain,
    label: 'Neuropeptide & Cognitive Research',
    title: 'Semax & Selank',
    desc: 'Nootropic peptides studied for BDNF upregulation, anxiolytic properties, and cognitive modulation in neurological research models.',
    tag: 'Cognitive Science',
    color: '#a855f7',
    slug: '/products',
  },
  {
    icon: RefreshCw,
    label: 'Longevity & Anti-Ageing Studies',
    title: 'Epithalon & MOTS-c',
    desc: 'Compounds investigated in telomere elongation models, mitochondrial function, and epigenetic longevity pathways.',
    tag: 'Longevity',
    color: '#f59e0b',
    slug: '/products',
  },
  {
    icon: Dna,
    label: 'GH Axis & IGF-1 Research',
    title: 'CJC-1295 & Ipamorelin',
    desc: 'Studied as GHRH analogues and selective GH secretagogues. Preclinical data covers IGF-1 elevation, body composition, and pulsatile growth hormone release.',
    tag: 'Growth Axis',
    color: '#06b6d4',
    slug: '/products',
  },
  {
    icon: Shield,
    label: 'Photoprotection & Melanin Research',
    title: 'Melanotan II & PT-141',
    desc: 'Investigated as MC1R agonists in UV-protective and sexual function research models. Alpha-MSH analogues with measurable melanocortin binding affinity.',
    tag: 'Melanocortin',
    color: '#ec4899',
    slug: '/products',
  },
];

const testimonials = [
  {
    name: 'James R.',
    role: 'Researcher · London',
    content: 'Exceptional purity documentation. The CoA was detailed — full HPLC trace, molecular weight confirmation. Exactly what you expect from a professional supplier.',
    rating: 5,
    date: '12 April 2026',
  },
  {
    name: 'Sarah T.',
    role: 'GB · Verified Buyer',
    content: 'Third order now. Packaging is consistently excellent — cold-pack, sealed vials, documentation in every box. Dispatch is fast. Highly recommend.',
    rating: 5,
    date: '2 April 2026',
  },
  {
    name: 'Mark D.',
    role: 'GB · Verified Buyer',
    content: 'Genuinely impressed by the quality. Packaging was secure, CoA included, and delivery was next day. Best peptide supplier in the UK.',
    rating: 5,
    date: '8 March 2026',
  },
];

const faqs = [
  { q: 'Are these peptides legal to buy in the UK?', a: 'Yes. Research peptides are legal to purchase in the UK for laboratory and research purposes. All products are sold strictly for in-vitro research use only, not for human or veterinary consumption.' },
  { q: 'What testing do you carry out?', a: 'Every batch is tested using HPLC (High-Performance Liquid Chromatography) methodology. Certificates of Analysis are available for all products and provided with each order.' },
  { q: 'How quickly will my order arrive?', a: 'Standard UK delivery is 1–3 business days. Express next-day options are available at checkout. Orders placed before 2pm on weekdays are dispatched the same day.' },
  { q: 'How should peptides be stored?', a: 'Lyophilised (freeze-dried) peptides should be stored at -20°C for long-term stability. Reconstituted peptides should be kept at 2–8°C and used within 30 days. See our full Storage Guide for details.' },
  { q: 'What payment methods do you accept?', a: 'We accept secure UK bank transfer (Open Banking) via our trusted payment partner. All transactions are secured with 256-bit SSL encryption.' },
];



const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  'bpc': { label: 'Tissue Repair', color: '#10b981' },
  'tb-500': { label: 'Tissue Repair', color: '#10b981' },
  'thymosin': { label: 'Tissue Repair', color: '#10b981' },
  'semaglutide': { label: 'Metabolic', color: '#3b82f6' },
  'tirzepatide': { label: 'Metabolic', color: '#3b82f6' },
  'retatrutide': { label: 'Metabolic', color: '#3b82f6' },
  'nad': { label: 'Longevity', color: '#f59e0b' },
  'epithalon': { label: 'Longevity', color: '#f59e0b' },
  'semax': { label: 'Cognitive', color: '#a855f7' },
  'selank': { label: 'Cognitive', color: '#a855f7' },
  'cjc': { label: 'Growth', color: '#06b6d4' },
  'ipamorelin': { label: 'Growth', color: '#06b6d4' },
  'melanotan': { label: 'Melanocortin', color: '#ec4899' },
  'pt-141': { label: 'Melanocortin', color: '#ec4899' },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'retrying' | 'sent' | 'error' | 'already_claimed'>('idle');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [revealedCode, setRevealedCode] = useState<string>('PROTOCOL10');
  const [codeCopied, setCodeCopied] = useState(false);
  // Seed banner from SSR loader data so the LCP image renders on first paint
  // (the preloaded bytes from <link rel="preload"> attach to an <img> immediately
  // instead of waiting for a client-side Firestore round-trip).
  const ssrBanner = useSSRBanner();
  const [banner, setBanner] = useState<any>(ssrBanner ?? null);
  const [bannerResolved, setBannerResolved] = useState<boolean>(!!ssrBanner);
  const [siteSettings, setSiteSettings] = useState<Record<string, string>>({});
  // IMPORTANT: do NOT seed from localStorage in the lazy initializer — SSR
  // returns [] and the client's first render must match, otherwise React
  // throws hydration error #419 (recoverable hydration mismatch) and
  // discards the SSR tree. The cached adverts are hydrated post-mount
  // in the useEffect below (runs synchronously after first commit).
  const [adverts, setAdverts] = useState<any[]>([]);

  // Intersection observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -60px 0px' }
    );
    document.querySelectorAll('.will-fade').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [products]);

  useEffect(() => {
    // Defer cached product load past LCP window — avoids TBT and a permanent live stream
    let cancelled = false;
    const loadProducts = () => {
      loadFirebase().then(({ getAllProducts }) => getAllProducts()).then((prods: Product[]) => {
        if (!cancelled) setProducts(prods);
      }).catch(() => {
        if (!cancelled) setProducts([]);
      });
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(loadProducts, { timeout: 2000 });
    } else {
      setTimeout(loadProducts, 500);
    }

    // Post-mount: instantly hydrate adverts from the 10-min localStorage cache
    // so repeat visits paint the hero banner without waiting on Firestore.
    // Runs AFTER the first commit, so it never causes a hydration mismatch.
    try {
      const raw = localStorage.getItem('php_adverts_cache');
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Array.isArray(data) && Date.now() - ts <= 10 * 60_000 && !cancelled) {
          setAdverts(data);
        }
      }
    } catch { /* ignore */ }

    // LCP-critical: adverts contain the hero banner image. Fire immediately,
    // outside requestIdleCallback, so the network request is not delayed.
    // Adverts are stored with `isActive` (admin writes that field). Older
    // docs used `active`; tolerate both by filtering client-side.
    loadFirebase().then(({ getDocs, query, collection, db }) =>
      getDocs(query(collection(db, 'adverts')))
    ).then((snap: any) => {
      try {
        const allAdverts = snap.docs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .filter((a: any) => a.isActive === true || a.active === true);

        if (!cancelled) setAdverts(allAdverts);
        const heroCount = allAdverts.filter((a: any) => a.placement === 'homepage_hero').length;
        localStorage.setItem('php_adverts_hero_count', heroCount > 0 ? '1' : '0');
        localStorage.setItem('php_adverts_cache', JSON.stringify({ ts: Date.now(), data: allAdverts }));
      } catch { /* ignore */ }
    }).catch(() => {});

    const deferredLoad = () => {
      loadFirebase().then(({ getDoc, doc, db }) => {
        getDoc(doc(db, 'settings', 'promoBanner')).then(snap => {
          if (snap.exists()) setBanner(snap.data());
          setBannerResolved(true);
        }).catch(() => setBannerResolved(true));

        getDoc(doc(db, 'siteSettings', 'featured-products')).then(snap => {
          if (snap.exists() && (snap.data() as any).products) setFeaturedProducts((snap.data() as any).products);
        }).catch(() => {});

        getDoc(doc(db, 'settings', 'site')).then(snap => {
          if (snap.exists()) setSiteSettings(snap.data() as Record<string, string>);
        }).catch(() => {});
      }).catch(() => setBannerResolved(true));
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(deferredLoad, { timeout: 1500 });
    } else {
      setTimeout(deferredLoad, 30);
    }

    return () => { cancelled = true; };
  }, []);

  const enrichedFeatured = (featuredProducts.length > 0 ? featuredProducts : products
    .filter(p => p.isActive !== false && p.stock > 0)
    .slice(0, 6)
    .map(p => {
      const lower = p.name.toLowerCase();
      const catEntry = Object.entries(CATEGORY_MAP).find(([key]) => lower.includes(key));
      const firstVariantPrice = p.variants?.[0]?.price;
      return {
        slug: nameToSlug(p.name),
        name: p.name,
        price: firstVariantPrice ? `£${Number(firstVariantPrice).toFixed(2)}` : `£${Number(p.price ?? 0).toFixed(2)}`,
        category: catEntry?.[1].label ?? 'Research',
        categoryColor: catEntry?.[1].color ?? '#3b82f6',
        badge: 'HPLC ≥99%',
        image: getProductImage(p.name, p.imageUrl, p.images),
      };
    })
  );

  useSEO('home', {
    title: 'HPLC-Verified Research Peptides UK | PH Labs',
    metaDescription: 'UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals.',
    canonical: 'https://phlabs.co.uk/',
  });


  useEffect(() => {
    const injectSchemas = () => {
      // NOTE: Organization, WebSite, and FAQPage schemas are all emitted
      // SSR-side (root + this route's head()). Strip any legacy duplicates
      // left in the DOM from older client-side injections so validators
      // don't flag duplicate @id entries.
      document.getElementById('org-schema')?.remove();
      document.getElementById('site-schema')?.remove();
      document.getElementById('faq-schema')?.remove();
    };


    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(injectSchemas, { timeout: 2000 });
    } else {
      setTimeout(injectSchemas, 100);
    }
  }, [siteSettings]);

  const heroAdverts = adverts.filter((a: any) => a.placement === 'homepage_hero');
  const bannerVisible = bannerResolved && banner?.active !== false && banner?.isActive !== false && banner?.imageUrl;
  const bannerHrefRaw = banner?.ctaUrl || banner?.linkUrl || '';
  // Tolerate admin typos like "https//phlabs..." (missing colon) or bare hosts.
  const bannerHref = (() => {
    const v = String(bannerHrefRaw || '').trim();
    if (!v) return '';
    if (v.startsWith('/')) return v;
    const fixed = v.replace(/^https\/\//i, 'https://').replace(/^http\/\//i, 'http://');
    if (/^https?:\/\//i.test(fixed)) return fixed;
    return `https://${fixed}`;
  })();
  const bannerOverlayHeading = banner?.overlayText || (banner?.textOverlayEnabled ? banner?.textOverlayHeading : '');
  const bannerOverlaySubtext = banner?.overlaySubtext || (banner?.textOverlayEnabled ? banner?.textOverlaySubtext : '');
  const bannerOverlayAlign = banner?.textOverlayAlign === 'left'
    ? 'items-start text-left'
    : banner?.textOverlayAlign === 'right'
      ? 'items-end text-right'
      : 'items-center text-center';
  const bannerOverlayPosition = banner?.textOverlayPosition === 'top'
    ? 'justify-start pt-10'
    : banner?.textOverlayPosition === 'bottom'
      ? 'justify-end pb-10'
      : 'justify-center';

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || email.length > 254 || !emailRe.test(email)) return;

    setEmailStatus('sending');
    setRetryAttempt(0);
    const discountCode = 'PROTOCOL10';
    const fb = await loadFirebase();
    const { Timestamp, getDocs, query, collection, db, where, addDoc } = fb;
    const now = Timestamp.now();

    // Transient Firestore / network error codes worth retrying
    const TRANSIENT = new Set([
      'unavailable', 'deadline-exceeded', 'internal', 'aborted',
      'resource-exhausted', 'cancelled', 'unknown',
    ]);
    const isTransient = (err: any) => {
      const code = String(err?.code || '').toLowerCase();
      const msg = String(err?.message || '').toLowerCase();
      if (TRANSIENT.has(code)) return true;
      return /network|fetch|timeout|offline|failed to/.test(msg);
    };
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Retry wrapper: up to 3 attempts with exponential backoff for transient errors.
    // Updates UI to "retrying" + attempt counter so the user sees we're trying again.
    const withRetry = async <T,>(label: string, fn: () => Promise<T>, maxAttempts = 3): Promise<T> => {
      let lastErr: any;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastErr = err;
          if (attempt >= maxAttempts || !isTransient(err)) throw err;
          const delay = 500 * 2 ** (attempt - 1); // 500ms, 1s, 2s
          console.warn(`[${label}] transient error, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts}):`, err);
          setRetryAttempt(attempt);
          setEmailStatus('retrying');
          await sleep(delay);
          setEmailStatus('sending');
        }
      }
      throw lastErr;
    };

    // ── One-time-per-email guard (non-fatal: if Firestore rules block read, just continue) ──
    try {
      const existingSnap = await withRetry('duplicate-check', () => getDocs(query(
        collection(db, 'emailSubscribers'),
        where('email', '==', email),
        where('source', '==', 'homepage_protocol_library'),
      )));
      if (!(existingSnap as any).empty) {
        setRevealedCode(discountCode);
        setEmailStatus('already_claimed');
        return;
      }
    } catch (dupErr) {
      console.warn('Duplicate check skipped (non-fatal):', dupErr);
    }

    // PROTOCOL10 coupon is pre-seeded by an admin via the Promo Codes tab.
    // We intentionally do NOT create coupons from the client — public write
    // access to `coupons` would let anyone mint 100%-off codes.

    // ── Critical writes: subscriber + email (with retry) ──
    try {
      await withRetry('subscriber-create', () => addDoc(collection(db, 'emailSubscribers'), {
        email,
        source: 'homepage_protocol_library',
        discountCode,
        subscribedAt: now,
        timestamp: new Date().toISOString(),
      }));
      const pdfUrl = 'https://phlabs.co.uk/downloads/protocol-library.pdf';
      try {
        await sendPublicMail({
          template: 'protocol-library',
          email,
          discountCode,
          pdfUrl,
        });
      } catch (mailErr) {
        console.warn('Mail enqueue failed (non-fatal, code still shown):', mailErr);
      }
      setRevealedCode(discountCode);
      setEmailStatus('sent');
      setRetryAttempt(0);
    } catch (err) {
      console.error('Protocol library submit failed:', err);
      setEmailStatus('error');
    }
  };


  const copyDiscountCode = async () => {
    try {
      await navigator.clipboard.writeText(revealedCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1800);
    } catch { /* noop */ }
  };

  return (
    <div className="min-h-screen shadow-none overflow-x-hidden" style={{ background: '#030a14', color: '#e4f0ff' }}>

      {/* ── Research disclaimer strip ── */}
      <div style={{
        background: 'rgba(16,185,129,0.06)',
        borderBottom: '1px solid rgba(16,185,129,0.12)',
        padding: '5px 16px',
        textAlign: 'center',
      }}>
        <p style={{ color: 'rgba(74,222,128,0.8)', fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
          For Laboratory Research Use Only — Not for Human or Veterinary Consumption
        </p>
      </div>

      {/* ════════════════════════════════
          PROMO BANNER (admin-controlled) — moved to top
      ════════════════════════════════ */}
      {bannerVisible && (
        <div className="relative w-full overflow-hidden" style={{ minHeight: banner.heightPx ? `${banner.heightPx}px` : '320px' }}>
          {banner.overlayEnabled && (
            <div className="absolute inset-0 pointer-events-none z-[6]"
              style={{ backgroundColor: banner.overlayColor ?? '#000000', opacity: (banner.overlayOpacity ?? 30) / 100 }} />
          )}
          {(banner.gradientEnabled !== false) && (() => {
            const gc = banner.gradientColor ?? '#040d1a';
            const gi = (banner.gradientIntensity ?? 60) / 100;
            const dir = banner.gradientDirection ?? 'bottom';
            const gradMap: Record<string, string> = {
              bottom: `linear-gradient(to top, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
              top: `linear-gradient(to bottom, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
              left: `linear-gradient(to right, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
              right: `linear-gradient(to left, ${gc} 0%, transparent ${Math.round(gi * 100)}%)`,
              center: `radial-gradient(ellipse at center, transparent 30%, ${gc} ${Math.round(gi * 100)}%)`,
            };
            return <div className="absolute inset-0 pointer-events-none z-[7]" style={{ background: gradMap[dir] }} />;
          })()}
          {bannerHref ? (
            <a href={bannerHref} className="block">
              <img {...cfImgProps(banner.imageUrl, { widths: [640, 960, 1280, 1600, 1920], sizes: '100vw' })} alt={banner.altText || 'PH Labs research peptides promotional banner'} className="w-full" fetchPriority="high" decoding="async" width={1600} height={banner.heightPx || 320}
                style={{ height: banner.heightPx ? `${banner.heightPx}px` : '320px', objectFit: banner.objectFit || 'cover', objectPosition: `${banner.objectPositionX ?? 50}% ${banner.objectPositionY ?? 50}%`, display: 'block' }} />
            </a>
          ) : (
            <img {...cfImgProps(banner.imageUrl, { widths: [640, 960, 1280, 1600, 1920], sizes: '100vw' })} alt={banner.altText || 'PH Labs research peptides promotional banner'} className="w-full" fetchPriority="high" decoding="async" width={1600} height={banner.heightPx || 320}
              style={{ height: banner.heightPx ? `${banner.heightPx}px` : '320px', objectFit: banner.objectFit || 'cover', objectPosition: `${banner.objectPositionX ?? 50}% ${banner.objectPositionY ?? 50}%`, display: 'block' }} />
          )}

          {bannerOverlayHeading && (
            <div className={`absolute inset-0 flex flex-col z-[10] pointer-events-none px-6 ${bannerOverlayAlign} ${bannerOverlayPosition}`}>
              <p className="font-black text-white max-w-2xl" style={{ fontSize: 'clamp(1.5rem,4vw,3rem)', textShadow: '0 2px 24px rgba(0,0,0,0.7)' }}>{bannerOverlayHeading}</p>
              {bannerOverlaySubtext && (
                <p className="mt-3 text-white/80 text-sm font-medium max-w-xl" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>{bannerOverlaySubtext}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════
          ADVERTS — HERO SLOT (moved to top)
      ════════════════════════════════ */}
      {heroAdverts.length > 0 && (
        <MarketingAdvertSlot adverts={heroAdverts} placement="homepage_hero" className="container mx-auto px-6 py-6" eagerFirstImage />
      )}



      {/* ════════════════════════════════
          HERO
      ════════════════════════════════ */}
      <section
        id="hero"
        className="relative overflow-hidden"
        style={{
          background: 'radial-gradient(ellipse 120% 80% at 60% 40%, #061428 0%, #030a14 60%)',
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingTop: 'calc(var(--nav-h, 72px) + var(--rg-banner-h, 34px) + 3rem)',
          paddingBottom: '4rem',
        }}
      >
        <AnimatedBackground variant="blue" />

        {/* Radial glow accent — pointer-events off, composited layer after LCP */}
        <div className="absolute pointer-events-none" style={{
          top: '10%', right: '-5%', width: '55%', height: '70%',
          background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.07) 0%, transparent 65%)',
          contain: 'strict',
        }} />
        <div className="absolute pointer-events-none" style={{
          bottom: '0%', left: '-10%', width: '50%', height: '60%',
          background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.05) 0%, transparent 65%)',
          contain: 'strict',
        }} />

        {/* Bottom fade */}
        <div className="absolute inset-x-0 bottom-0 h-48 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #030a14)' }} />

        <div className="container mx-auto px-4 sm:px-6 relative z-10 min-w-0">
          <div className="grid lg:grid-cols-2 gap-16 items-center min-w-0">

            {/* Left — Copy — no fade animation here so H1 paints immediately (LCP) */}
            <div className="space-y-8 min-w-0">
              {/* Eyebrow */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span style={{ color: '#4ade80', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    UK Laboratory Reagent Supplier · Research Use Only
                  </span>
                </div>
              </div>

              {/* H1 */}
              <div>
                <h1 style={{
                  fontSize: 'clamp(1.75rem, 7.5vw, 4.2rem)',
                  fontWeight: 900,
                  lineHeight: 1.04,
                  letterSpacing: 0,
                  color: '#f0f8ff',
                  maxWidth: '100%',
                  overflowWrap: 'break-word',
                }}>
                  <span style={{ display: 'block' }}>Synthetic Peptides </span>
                  <span style={{ display: 'block', color: '#10b981' }}>For In-Vitro Research</span>
                  <span style={{ display: 'block', color: '#c9d8f0', fontWeight: 400, fontSize: '0.72em', overflowWrap: 'break-word' }}>HPLC-Verified ≥99% Purity · CoA Per Batch</span>
                </h1>
              </div>

              {/* Sub-copy */}
              <p style={{ fontSize: '1.05rem', lineHeight: 1.75, color: '#9cb8d9', maxWidth: '480px' }}>
                PH Labs supplies analytical-grade synthetic peptides and laboratory reagents to qualified UK researchers. HPLC and mass-spectrometry verified, Certificate of Analysis with every batch. <strong style={{ color: '#f0a0a0' }}>Research Use Only — Not For Human Consumption.</strong>
              </p>

              {/* Trust micro-badges */}
              <div className="flex flex-wrap gap-3">
                {['≥99% HPLC Verified', 'CoA Every Batch', 'Free UK Shipping £50+', '1–3 Day Dispatch'].map(b => (
                  <span key={b} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8db4d8' }}>
                    <CheckCircle2 style={{ width: 12, height: 12, color: '#10b981', flexShrink: 0 }} />
                    {b}
                  </span>
                ))}
              </div>


              {/* CTAs */}
              <div className="flex flex-wrap gap-4">
                <Link to="/products"
                  aria-label="Browse the full PH Labs research peptide catalogue"
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-300"
                  style={{
                    background: 'linear-gradient(135deg, #0ea572 0%, #10b981 50%, #059669 100%)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(74,222,128,0.42)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(74,222,128,0.2)'}
                >
                  Browse Catalogue
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/lab-reports"
                  aria-label="View HPLC lab reports and certificates of analysis"
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all duration-300"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#a8c8e8',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#e4f0ff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = '#a8c8e8'; }}
                >
                  <FileCheck className="w-4 h-4" />
                  View Lab Reports
                </Link>
              </div>
            </div>

            {/* Right — Stats card panel */}
            <div className="hidden lg:block animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="relative">
                {/* Main card */}
                <div className="rounded-2xl p-8 space-y-6" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  {/* Header */}
                  <div className="flex items-center justify-between pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <div className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: '#4ade80' }}>Batch QC Dashboard</div>
                      <div className="font-semibold" style={{ color: '#c8dff5', fontSize: '0.95rem' }}>Latest analytical results</div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span style={{ color: '#4ade80', fontSize: '0.65rem', fontWeight: 700 }}>LIVE</span>
                    </div>
                  </div>

                  {/* Purity row */}
                  <div className="space-y-3">
                    {products
                      .filter(p => p.isActive !== false && p.stock > 0)
                      .slice(0, 5)
                      .map(p => {
                        const lower = p.name.toLowerCase();
                        const catEntry = Object.entries(CATEGORY_MAP).find(([key]) => lower.includes(key));
                        const color = catEntry?.[1].color ?? '#3b82f6';
                        const purityRaw = p.purity ?? '99%';
                        const purityNum = parseFloat(purityRaw.replace(/[^0-9.]/g, '')) || 99;
                        return (
                          <div key={p.id} className="flex items-center gap-4">
                            <span style={{ color: '#8db4d8', fontSize: '0.8rem', width: '90px', flexShrink: 0 }} className="truncate">{p.name}</span>
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(purityNum, 100)}%`, background: color, opacity: 0.85 }} />
                            </div>
                            <span style={{ color: '#c8dff5', fontSize: '0.8rem', fontWeight: 700, width: '44px', textAlign: 'right' }}>{purityNum}%</span>
                          </div>
                        );
                      })}
                  </div>

                  {/* Footer stat row */}
                  <div className="grid grid-cols-3 gap-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                      { val: `${products.filter(p => p.isActive !== false && p.stock > 0).length || '14'}+`, label: 'Compounds' },
                      { val: '≥99%', label: 'Min Purity' },
                      { val: '100%', label: 'CoA Rate' },
                    ].map(({ val, label }) => (
                      <div key={label} className="text-center">
                        <div style={{ color: '#10b981', fontSize: '1.2rem', fontWeight: 800, lineHeight: 1 }}>{val}</div>
                        <div style={{ color: '#5a7ea8', fontSize: '0.7rem', marginTop: '4px' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -bottom-4 -left-4 px-4 py-2.5 rounded-xl" style={{
                  background: 'rgba(3,10,20,0.95)',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck style={{ width: 16, height: 16, color: '#10b981' }} />
                    <span style={{ color: '#c8dff5', fontSize: '0.75rem', fontWeight: 600 }}>UK Compliant · MHRA Aware</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          TRUST BAR
      ════════════════════════════════ */}
      <section id="trust-bar" aria-labelledby="trust-bar-heading" style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <h2 id="trust-bar-heading" className="sr-only">Quality and delivery guarantees</h2>
        <div className="container mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {trustBadges.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-center gap-2.5">
                <Icon style={{ width: 16, height: 16, color: '#10b981', flexShrink: 0 }} />
                <div>
                  <span style={{ color: '#c8dff5', fontSize: '0.78rem', fontWeight: 700 }}>{title}</span>
                  <span style={{ color: '#7a98b8', fontSize: '0.72rem' }} className="ml-1.5">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>




      <MarketingAdvertSlot adverts={adverts} placement="homepage_mid" className="container mx-auto px-6 py-6" variant="card" />


      {/* ════════════════════════════════
          FEATURED PRODUCTS
      ════════════════════════════════ */}
      {/* Always render section shell to prevent CLS — skeletons shown while Firebase loads */}
      <section id="featured" className="py-20" style={{ background: 'linear-gradient(180deg, #030a14 0%, #040d1a 50%, #030a14 100%)', minHeight: '520px' }}>
        {enrichedFeatured.length > 0 ? (
        <div className="container mx-auto px-6">
            <div className="will-fade flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-12">
              <div>
                <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#10b981' }}>Research Catalogue</p>
                <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', fontWeight: 800, color: '#f0f8ff', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
                  Featured Compounds
                </h2>
                <p className="mt-2 text-sm" style={{ color: '#7a98b8' }}>Analytically verified · Batch documented · CoA included</p>
              </div>
              <Link to="/products"
                className="inline-flex items-center gap-2 text-sm font-semibold transition-colors"
                style={{ color: '#10b981' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#4ade80'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#10b981'}
              >
                View All Products <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 will-fade">
              {enrichedFeatured.slice(0, 6).map((p: any, i: number) => (
                <Link to={`/products/${p.slug}`} key={i}
                  className="group relative rounded-2xl overflow-hidden flex flex-col transition-all duration-300"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,185,129,0.25)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                >
                  {/* Image area */}
                  <div className="relative overflow-hidden" style={{ aspectRatio: '4/3', background: '#040d1a' }}>
                    {p.image ? (
                      <img {...cfImgProps(p.image, { widths: [400, 600, 800, 1200, 1600], sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw', quality: 92 })} alt={`${p.name} research peptide vial`} loading="lazy" width="400" height="300" decoding="async" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} className="transition-transform duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FlaskConical style={{ width: 48, height: 48, color: 'rgba(16,185,129,0.3)' }} />
                      </div>
                    )}
                    {/* Category badge */}
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: `${p.categoryColor}18`, border: `1px solid ${p.categoryColor}35`, color: p.categoryColor }}>
                        {p.category}
                      </span>
                    </div>
                    {/* HPLC badge */}
                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#4ade80', textShadow: '0 1px 2px rgba(0,0,0,0.65)' }}>
                        <CheckCircle2 style={{ width: 10, height: 10 }} />
                        ≥99%
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col gap-3 flex-1">
                    <div>
                      <h3 className="font-bold text-base leading-snug mb-1" style={{ color: '#e4f0ff' }}>{p.name}</h3>
                      <p className="text-xs" style={{ color: '#7a98b8' }}>HPLC-verified research compound</p>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: '#f0f8ff', fontSize: '1.15rem', fontWeight: 800 }}>{p.price}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold transition-all duration-200 group-hover:gap-2" style={{ color: '#10b981' }}>
                        View Details <ArrowRight style={{ width: 13, height: 13 }} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* Skeleton placeholder while Firebase loads — prevents CLS */
          <div className="container mx-auto px-6">
            <div className="mb-12">
              <div className="h-3 rounded-full w-32 mb-3 animate-pulse" style={{ background: '#0d1f3a' }} />
              <div className="h-8 rounded-full w-64 animate-pulse" style={{ background: '#0d1f3a' }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.05)', minHeight: '380px' }}>
                  <div style={{ aspectRatio: '4/3', background: '#0d1f3a' }} />
                  <div className="p-5 space-y-3">
                    <div className="h-4 rounded-full w-2/3" style={{ background: '#0d1f3a' }} />
                    <div className="h-3 rounded-full w-full" style={{ background: '#0d1f3a' }} />
                    <div className="h-3 rounded-full w-4/5" style={{ background: '#0d1f3a' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ════════════════════════════════
          LAB QUALITY
      ════════════════════════════════ */}
      <section id="lab-quality" className="py-20 cv-auto" style={{ background: 'linear-gradient(180deg, #040d1a 0%, #030a14 100%)' }}>
        <div className="container mx-auto px-6">
          <div className="will-fade max-w-2xl mb-14">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#10b981' }}>Analytical Standards</p>
            <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', fontWeight: 800, color: '#f0f8ff', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              What "≥99% Purity" Actually Means
            </h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: '#7a98b8' }}>
              Every compound is analytically tested before dispatch. We document methodology, instrument parameters, and batch results — not just a number.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 will-fade mb-12">
            {[
              { icon: Microscope, title: 'Reverse-Phase HPLC', desc: 'Chromatographic separation confirms component purity at ≥99% threshold', step: '01' },
              { icon: Zap, title: 'Mass Spectrometry', desc: 'ESI-MS confirms exact molecular weight and rules out structural isomers', step: '02' },
              { icon: FileCheck, title: 'Certificate of Analysis', desc: 'Full CoA documenting HPLC trace, MS data, batch ID, and storage spec', step: '03' },
              { icon: Snowflake, title: 'Cold-Pack Dispatch', desc: 'Thermal packaging maintains peptide stability from warehouse to door', step: '04' },
            ].map(({ icon: Icon, title, desc, step }) => (
              <div key={title} className="relative rounded-2xl p-6 flex flex-col gap-4" style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <Icon style={{ width: 18, height: 18, color: '#10b981' }} />
                  </div>
                  <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.04)', lineHeight: 1, letterSpacing: '-0.04em' }}>{step}</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-2" style={{ color: '#d8ecff' }}>{title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#7a98b8' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CoA banner */}
          <div className="will-fade rounded-2xl p-7 flex flex-col sm:flex-row items-center justify-between gap-5" style={{
            background: 'rgba(16,185,129,0.04)',
            border: '1px solid rgba(16,185,129,0.15)',
          }}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <FileCheck style={{ width: 18, height: 18, color: '#4ade80' }} />
              </div>
              <div>
                <div className="font-bold text-sm mb-0.5" style={{ color: '#e4f0ff' }}>Full Certificate of Analysis — Included With Every Order</div>
                <p className="text-xs" style={{ color: '#7a98b8' }}>HPLC trace + mass spectrometry data. Request prior to purchase via our contact page.</p>
              </div>
            </div>
            <Link to="/lab-reports"
              className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#4ade80' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.18)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.1)'}
            >
              View Lab Reports <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          RESEARCH AREAS
      ════════════════════════════════ */}
      <section id="research-areas" className="py-20 cv-auto" style={{ background: 'linear-gradient(180deg, #030a14 0%, #040d1a 100%)' }}>
        <div className="container mx-auto px-6">
          <div className="will-fade max-w-2xl mb-14">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#10b981' }}>Peptide Research Areas</p>
            <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', fontWeight: 800, color: '#f0f8ff', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Active Areas of Preclinical Research
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 will-fade">
            {benefits.map(({ icon: Icon, label, title, desc, tag, color, slug }) => (
              <Link to={slug} key={title}
                className="group relative rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}30`; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
              >
                <div className="absolute top-0 inset-x-6 h-px rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
                    <Icon style={{ width: 18, height: 18, color }} />
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: `${color}12`, color, border: `1px solid ${color}25` }}>{tag}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: `${color}90` }}>{label}</p>
                  <h3 className="font-bold text-base mb-2" style={{ color: '#d8ecff' }}>{title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#7a98b8' }}>{desc}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold mt-auto" style={{ color }}>
                  Explore compounds <ArrowRight style={{ width: 13, height: 13 }} className="transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          STATS STRIP
      ════════════════════════════════ */}
      <section id="stats" aria-labelledby="stats-heading" style={{ background: 'rgba(16,185,129,0.03)', borderTop: '1px solid rgba(16,185,129,0.1)', borderBottom: '1px solid rgba(16,185,129,0.1)' }}>
        <h2 id="stats-heading" className="sr-only">PH Labs by the numbers</h2>
        <div className="container mx-auto px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 will-fade">
            {[
              { val: '14+', label: 'Research Compounds', sub: 'Active catalogue' },
              { val: '≥99%', label: 'Minimum Purity', sub: 'HPLC-verified' },
              { val: '100%', label: 'CoA Coverage', sub: 'Every order' },
              { val: '1–3d', label: 'UK Dispatch', sub: 'Same-day available' },
            ].map(({ val, label, sub }) => (
              <div key={label} className="text-center">
                <div style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 900, color: '#10b981', letterSpacing: '-0.04em', lineHeight: 1 }}>{val}</div>
                <div className="font-semibold text-sm mt-1.5" style={{ color: '#d8ecff' }}>{label}</div>
                <div className="text-xs mt-0.5" style={{ color: '#3a5a82' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          TESTIMONIALS
      ════════════════════════════════ */}
      <section id="testimonials" className="py-20 cv-auto" style={{ background: 'linear-gradient(180deg, #040d1a 0%, #030a14 100%)' }}>
        <div className="container mx-auto px-6">
          <div className="will-fade max-w-2xl mb-14">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#10b981' }}>Researcher Feedback</p>
            <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', fontWeight: 800, color: '#f0f8ff', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Trusted by UK Researchers
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 will-fade">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl p-6 flex flex-col gap-4" style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, s) => (
                    <Star key={s} style={{ width: 13, height: 13, color: '#f59e0b', fill: '#f59e0b' }} />
                  ))}
                </div>
                <p className="text-sm leading-relaxed flex-1" style={{ color: '#9cb8d9' }}>"{t.content}"</p>
                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <div className="font-bold text-sm" style={{ color: '#c8dff5' }}>{t.name}</div>
                    <div className="text-xs" style={{ color: '#3a5a82' }}>{t.role}</div>
                  </div>
                  <div className="text-xs" style={{ color: '#3a5a82' }}>{t.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          PROTOCOL LIBRARY CTA
      ════════════════════════════════ */}
      <section id="protocol-library" className="py-20 cv-auto" style={{ background: '#030a14' }}>
        <div className="container mx-auto px-6">
          <div className="will-fade rounded-2xl overflow-hidden relative" style={{
            background: 'linear-gradient(135deg, #061828 0%, #040f1e 50%, #060d1c 100%)',
            border: '1px solid rgba(16,185,129,0.15)',
          }}>
            {/* Subtle grid bg */}
            <div className="absolute inset-0 pointer-events-none opacity-30" style={{
              backgroundImage: 'linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />

            <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center p-10 md:p-14">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <FlaskConical style={{ width: 13, height: 13, color: '#4ade80' }} />
                  <span style={{ color: '#4ade80', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Free Resource</span>
                </div>
                <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', fontWeight: 800, color: '#f0f8ff', letterSpacing: '-0.025em', lineHeight: 1.2, marginBottom: '16px' }}>
                  Research Protocol Library
                </h2>
                <p className="text-sm leading-relaxed mb-6" style={{ color: '#7a98b8' }}>
                  Comprehensive reconstitution protocols, dosing references, and storage guides for 14 research compounds. Compiled from peer-reviewed preclinical literature.
                </p>
                <div className="flex flex-col gap-2">
                  {['BPC-157 & TB-500 reconstitution guide', 'GLP-1 agonist protocol comparisons', 'Peptide storage & stability reference', '10% discount code included'].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle2 style={{ width: 14, height: 14, color: '#10b981', flexShrink: 0 }} />
                      <span style={{ color: '#9cb8d9', fontSize: '0.83rem' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                {emailStatus === 'sent' || emailStatus === 'already_claimed' ? (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
                      <CheckCircle2 style={{ width: 28, height: 28, color: '#10b981' }} />
                    </div>
                    <p className="font-bold text-base mb-1" style={{ color: '#e4f0ff' }}>
                      {emailStatus === 'sent' ? 'Protocol Library sent!' : 'You\u2019ve already claimed this'}
                    </p>
                    <p className="text-sm mb-5" style={{ color: '#7a98b8' }}>
                      {emailStatus === 'sent'
                        ? 'Check your inbox for the PDF download link.'
                        : 'Your discount code is still valid \u2014 use it at checkout.'}
                    </p>
                    <div className="rounded-xl p-5" style={{ background: 'rgba(16,185,129,0.06)', border: '1px dashed rgba(16,185,129,0.35)' }}>
                      <p className="text-[9px] sm:text-[10px] text-emerald-300/90 font-medium tracking-widest uppercase shadow-none mb-2">Your 10% Discount Code</p>
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <code style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.18em', color: '#f0f8ff', fontFamily: 'monospace' }}>{revealedCode}</code>
                        <button
                          type="button"
                          onClick={copyDiscountCode}
                          aria-label={codeCopied ? 'Discount code copied to clipboard' : `Copy discount code ${revealedCode} to clipboard`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: 'rgba(16,185,129,0.18)', color: '#4ade80', border: '1px solid rgba(16,185,129,0.35)' }}
                        >
                          {codeCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-[11px] mt-3" style={{ color: '#9cb8d9' }}>Apply at checkout for 10% off your first order.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
                    <div>
                      <label htmlFor="protocol-library-email" className="block text-xs font-semibold mb-2" style={{ color: '#8db4d8' }}>Email address</label>
                      <input
                        id="protocol-library-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={emailInput}
                        onChange={e => setEmailInput(e.target.value)}
                        placeholder="your@email.com"
                        required
                        maxLength={254}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"

                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#e4f0ff',
                        }}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(16,185,129,0.4)'}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)'}
                      />
                    </div>
                    <button type="submit" disabled={emailStatus === 'sending' || emailStatus === 'retrying'}
                      aria-busy={emailStatus === 'sending' || emailStatus === 'retrying'}
                      className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all duration-300 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                      style={{
                        background: 'linear-gradient(135deg, #0ea572 0%, #10b981 50%, #059669 100%)',
                        boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
                        opacity: (emailStatus === 'sending' || emailStatus === 'retrying') ? 0.7 : 1,
                      }}
                    >
                      {(emailStatus === 'sending' || emailStatus === 'retrying') ? (
                        <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" />
                      ) : (
                        <Mail style={{ width: 15, height: 15 }} />
                      )}
                      {emailStatus === 'sending'
                        ? 'Sending…'
                        : emailStatus === 'retrying'
                          ? `Retrying… (attempt ${retryAttempt + 1})`
                          : 'Send My Protocol Library'}
                    </button>

                    {emailStatus === 'retrying' && (
                      <p className="text-center text-xs font-semibold" style={{ color: '#fbbf24' }}>
                        Connection hiccup — trying again automatically…
                      </p>
                    )}
                    {emailStatus === 'error' && (
                      <p className="text-center text-xs font-semibold" style={{ color: '#f87171' }}>
                        Something went wrong. Please try again or email info@phlabs.co.uk.
                      </p>
                    )}

                    <p className="text-center text-xs" style={{ color: '#3a5a82' }}>
                      <Lock style={{ width: 10, height: 10, display: 'inline', marginRight: 4 }} />
                      No spam. Unsubscribe anytime.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════ */}
      <section id="how-it-works" className="py-20 cv-auto" style={{ background: 'linear-gradient(180deg, #030a14 0%, #040d1a 100%)' }}>
        <div className="container mx-auto px-6">
          <div className="will-fade text-center mb-14">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#10b981' }}>Process</p>
            <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', fontWeight: 800, color: '#f0f8ff', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              From Order to Laboratory
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-5 will-fade">
            {[
              { icon: FlaskConical, step: '01', title: 'Browse Catalogue', desc: 'Select from 14+ analytically verified compounds. Full purity data visible on every product page.', color: '#10b981' },
              { icon: CreditCard, step: '02', title: 'Secure Checkout', desc: 'SSL-secured payment via UK Open Banking. No account required for guest checkout.', color: '#3b82f6' },
              { icon: Snowflake, step: '03', title: 'Cold-Pack Dispatch', desc: 'Thermal packaging maintains compound integrity from warehouse to your laboratory.', color: '#06b6d4' },
              { icon: FileCheck, step: '04', title: 'CoA Documentation', desc: 'HPLC trace and mass spectrometry data included with every order.', color: '#a855f7' },
            ].map(({ icon: Icon, step, title, desc, color }) => (
              <div key={step} className="relative rounded-2xl p-6 flex flex-col gap-4" style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
                    <Icon style={{ width: 18, height: 18, color }} />
                  </div>
                  <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.04)', lineHeight: 1, letterSpacing: '-0.04em' }}>{step}</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1.5" style={{ color: '#d8ecff' }}>{title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#7a98b8' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          FAQ
      ════════════════════════════════ */}
      <section id="faq" className="py-20 cv-auto" style={{ background: '#030a14' }}>
        <div className="container mx-auto px-6">
          <div className="will-fade max-w-2xl mb-14">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#10b981' }}>FAQs</p>
            <h2 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', fontWeight: 800, color: '#f0f8ff', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
              Common Questions
            </h2>
          </div>

          <div className="max-w-3xl space-y-2 will-fade">
            {faqs.map((faq, i) => (
              <div key={i}
                className="rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  background: openFaq === i ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
                  border: openFaq === i ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <button
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span className="font-semibold text-sm" style={{ color: '#d8ecff' }}>{faq.q}</span>
                  <ChevronDown style={{ width: 16, height: 16, color: '#7a98b8', flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-sm leading-relaxed" style={{ color: '#7a98b8' }}>{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          FINAL CTA
      ════════════════════════════════ */}
      <section id="cta" className="py-20" style={{ background: 'linear-gradient(180deg, #040d1a 0%, #030a14 100%)' }}>
        <div className="container mx-auto px-6">
          <div className="will-fade text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#10b981' }}>Get Started</p>
            <h2 style={{ fontSize: 'clamp(1.9rem, 4vw, 3rem)', fontWeight: 900, color: '#f0f8ff', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '16px' }}>
              Analytically verified.<br />UK-dispatched. Documented.
            </h2>
            <p className="text-base leading-relaxed mb-10" style={{ color: '#7a98b8' }}>
              14+ HPLC-tested research compounds. Free shipping over £50. Certificate of Analysis with every order.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/products"
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-bold text-sm text-white transition-all duration-300"
                style={{ background: 'linear-gradient(135deg, #0ea572 0%, #10b981 50%, #059669 100%)', boxShadow: '0 4px 28px rgba(16,185,129,0.35)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 36px rgba(16,185,129,0.55)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 28px rgba(16,185,129,0.35)'}
              >
                Browse Full Catalogue <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/contact"
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-semibold text-sm transition-all duration-300"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#8db4d8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#e4f0ff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = '#8db4d8'; }}
              >
                Contact Our Team
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          MOBILE STICKY BAR
      ════════════════════════════════ */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50" style={{
        background: 'rgba(3,10,20,0.97)',
        borderTop: '1px solid rgba(16,185,129,0.15)',
        padding: 'max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))',
        transform: 'translateZ(0)',
        contain: 'layout paint',
      }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: '#4ade80' }}>
              <Truck className="w-3 h-3 inline mr-1" />
              Free UK Shipping over £50
            </p>
            <p className="text-xs" style={{ color: '#3a5a82' }}>HPLC-verified · CoA included</p>
          </div>
          <Link to="/products"
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #0ea572, #059669)', boxShadow: '0 4px 16px rgba(16,185,129,0.4)', flexShrink: 0 }}
          >
            Shop Peptides <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* SEO link-index — SSR-rendered hub linking to every product + article */}
      <HomeSeoIndex />

    </div>
  );
}

