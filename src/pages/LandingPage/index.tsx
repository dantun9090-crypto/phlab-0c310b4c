import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, Link, Navigate } from 'react-router-dom';

import { db, doc, getDoc, collection, getDocs } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';
import { ArrowRight, CheckCircle2, Shield, Zap, Award, Beaker, FlaskConical } from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  '🔬': <Beaker className="w-6 h-6" />,
  '❄️': <Shield className="w-6 h-6" />,
  '📄': <Award className="w-6 h-6" />,
  '⚡': <Zap className="w-6 h-6" />,
  '🔒': <Shield className="w-6 h-6" />,
  '🧪': <Beaker className="w-6 h-6" />,
};

export default function LandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'product_stock'));
        const all: Product[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Product));
        const priorityOrder = ['nad', 'retatrutide', 'glow', 'mots'];
        const matched: Product[] = [];
        for (const key of priorityOrder) {
          const found = all.find(p => p.name?.toLowerCase().includes(key) && !matched.includes(p));
          if (found) matched.push(found);
        }
        setFeaturedProducts(matched.slice(0, 4));
      } catch {
        // Silently fail — featured section won't show
      }
    };
    loadProducts();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'siteSettings', 'landingPage'));
        if (snap.exists()) {
          const d = snap.data();
          if (!d.published) { setNotFound(true); return; }
          if (slug && d.pageSlug && d.pageSlug !== slug) { setNotFound(true); return; }
          setData(d);
          
          // Set page title
          if (d.pageTitle) document.title = d.pageTitle;
          
          // Set meta description
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc && d.metaDescription) metaDesc.setAttribute('content', d.metaDescription);
          
          // Set Open Graph tags
          const ogTitle = document.querySelector('meta[property="og:title"]') || document.createElement('meta');
          ogTitle.setAttribute('property', 'og:title');
          ogTitle.setAttribute('content', d.pageTitle || 'PH Labs');
          if (!document.querySelector('meta[property="og:title"]')) document.head.appendChild(ogTitle);
          
          const ogDesc = document.querySelector('meta[property="og:description"]') || document.createElement('meta');
          ogDesc.setAttribute('property', 'og:description');
          ogDesc.setAttribute('content', d.metaDescription || 'Premium research-grade peptides');
          if (!document.querySelector('meta[property="og:description"]')) document.head.appendChild(ogDesc);
          
          const ogImage = document.querySelector('meta[property="og:image"]') || document.createElement('meta');
          ogImage.setAttribute('property', 'og:image');
          ogImage.setAttribute('content', d.heroImageUrl || 'https://cdn.wegic.ai/assets/onepage/uploads/2031481443271393281/image/2026/03/14/01KKPB20SGJ3T4RK47TQPSAV0N.png');
          if (!document.querySelector('meta[property="og:image"]')) document.head.appendChild(ogImage);
          
          const ogUrl = document.querySelector('meta[property="og:url"]') || document.createElement('meta');
          ogUrl.setAttribute('property', 'og:url');
          ogUrl.setAttribute('content', window.location.href);
          if (!document.querySelector('meta[property="og:url"]')) document.head.appendChild(ogUrl);
          
          // Set Twitter Card tags
          const twitterCard = document.querySelector('meta[name="twitter:card"]') || document.createElement('meta');
          twitterCard.setAttribute('name', 'twitter:card');
          twitterCard.setAttribute('content', 'summary_large_image');
          if (!document.querySelector('meta[name="twitter:card"]')) document.head.appendChild(twitterCard);
          
          const twitterTitle = document.querySelector('meta[name="twitter:title"]') || document.createElement('meta');
          twitterTitle.setAttribute('name', 'twitter:title');
          twitterTitle.setAttribute('content', d.pageTitle || 'PH Labs');
          if (!document.querySelector('meta[name="twitter:title"]')) document.head.appendChild(twitterTitle);
          
          const twitterDesc = document.querySelector('meta[name="twitter:description"]') || document.createElement('meta');
          twitterDesc.setAttribute('name', 'twitter:description');
          twitterDesc.setAttribute('content', d.metaDescription || 'Premium research-grade peptides');
          if (!document.querySelector('meta[name="twitter:description"]')) document.head.appendChild(twitterDesc);
          
          // Set canonical link — always use the clean homepage URL, never window.location.href
          // which can include query strings causing duplicate content issues
          const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
          canonical.setAttribute('rel', 'canonical');
          canonical.setAttribute('href', 'https://phlabs.co.uk/');
          if (!document.querySelector('link[rel="canonical"]')) document.head.appendChild(canonical);
          
          // Inject JSON-LD structured data
          const existingJsonLd = document.querySelector('script[type="application/ld+json"][data-landing-page]');
          if (existingJsonLd) existingJsonLd.remove();
          
          const jsonLd = document.createElement('script');
          jsonLd.type = 'application/ld+json';
          jsonLd.setAttribute('data-landing-page', 'true');
          jsonLd.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "PH Labs",
            "url": "https://phlabs.co.uk",
            "logo": "https://cdn.wegic.ai/assets/onepage/uploads/2031481443271393281/image/2026/03/14/01KKPB20SGJ3T4RK47TQPSAV0N.png",
            "description": d.metaDescription || "Premium research-grade compounds with HPLC-verified purity. For laboratory research use only.",
            "image": d.heroImageUrl || "https://cdn.wegic.ai/assets/onepage/uploads/2031481443271393281/image/2026/03/14/01KKPB20SGJ3T4RK47TQPSAV0N.png"
          });
          document.head.appendChild(jsonLd);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  if (loading) {
    // Prerender: return minimal shell — no user-visible text for Googlebot to cache
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center" aria-hidden="true">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600/20 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    // 301-equivalent: redirect /landing/* to /products when page isn't published
    return <Navigate to="/products" replace />;
  }

  const features: { icon: string; title: string; desc: string }[] = data.features || [];
  const stats: { value: string; label: string }[] = data.stats || [];
  const trustBullets: string[] = data.trustBullets || [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--theme-bg)' }}>
      {/* Hero */}
      <section className="page-hero relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/60 via-transparent to-transparent" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-700/8 rounded-full" />
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            {data.heroBadge && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 bg-blue-600/12 border border-blue-500/25 text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6"
              >
                <CheckCircle2 className="w-4 h-4" />
                {data.heroBadge}
              </motion.div>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#f0f6ff] leading-tight tracking-tight mb-6"
            >
              {data.heroHeading || 'Research-Grade Peptides'}
            </motion.h1>
            {data.heroSubheading && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-lg text-[#9cb8d9] leading-relaxed mb-8 max-w-2xl mx-auto"
              >
                {data.heroSubheading}
              </motion.p>
            )}
            {data.heroImageUrl && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl overflow-hidden border border-white/[0.08] mb-8 max-h-80 object-cover"
              >
                <img src={data.heroImageUrl} alt="Hero" className="w-full h-80 object-cover" loading="eager" fetchPriority="high" />
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap items-center justify-center gap-4"
            >
              <a
                href={data.heroCtaUrl || '/products'}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-8 py-4 rounded-xl font-semibold hover:from-blue-500 hover:to-blue-400 transition-all shadow-[0_4px_20px_rgba(37,99,235,0.35)] hover:-translate-y-0.5"
              >
                {data.heroCta || 'Access Compound Catalogue'} <ArrowRight className="w-5 h-5" />
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Featured Compounds — 4 in one row */}
      {featuredProducts.length > 0 && (
        <section className="py-16">
          <div className="container mx-auto px-6">
            <div className="text-center mb-10">
              <p className="text-blue-400 text-xs font-semibold tracking-widest uppercase mb-2">Featured Compounds</p>
              <h2 className="text-2xl md:text-3xl font-bold text-white">Analytical-Grade Research Peptides</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredProducts.map((p, i) => {
                const imgSrc = p.images?.find(Boolean) || p.imageUrl || '';
                const price = typeof p.price === 'number' ? p.price : parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0;
                const inStock = (p.stock ?? 0) > 0 || p.variants?.some(v => v.stock > 0);
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                  >
                    <Link
                      to={`/products/${p.id}`}
                      className="group flex flex-col border border-white/[0.07] rounded-2xl overflow-hidden hover:border-blue-500/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(37,99,235,0.15)]"
                      style={{ backgroundColor: 'var(--theme-surface)' }}
                    >
                      {/* Image */}
                      <div className="aspect-square overflow-hidden relative" style={{ backgroundColor: 'var(--theme-bg)' }}>
                        {imgSrc ? (
                          <img src={imgSrc} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <FlaskConical className="w-10 h-10 text-[#1a3a6a]" />
                          </div>
                        )}
                        {/* Purity badge */}
                        {p.purity && (
                          <div className="absolute top-2 left-2 bg-blue-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {p.purity} purity
                          </div>
                        )}
                        {!inStock && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white/70 text-xs font-semibold">Out of Stock</span>
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="p-4 flex flex-col gap-2 flex-1">
                        <p className="text-[#3a5a82] text-[10px] uppercase tracking-widest font-semibold">{p.category || 'Research Compound'}</p>
                        <h3 className="text-white font-bold text-sm leading-snug group-hover:text-blue-300 transition-colors">{p.name}</h3>
                        <div className="mt-auto flex items-center justify-between pt-2">
                          <span className="text-white font-bold text-base">
                            {price > 0 ? `from £${price.toFixed(2)}` : 'View Compound'}
                          </span>
                          <span className="text-blue-400 group-hover:translate-x-0.5 transition-transform">
                            <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
            <div className="mt-8 text-center">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 px-6 py-3 border border-blue-500/40 bg-blue-600/10 text-blue-300 rounded-xl text-sm font-semibold hover:bg-blue-600/20 transition-all"
              >
                View Full Compound Catalogue <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Stats */}
      {stats.length > 0 && (
        <section className="py-12 border-y border-white/[0.06]" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-surface) 80%, transparent)' }}>
          <div className="container mx-auto px-6">
            <div className="flex flex-wrap justify-center gap-12">
              {stats.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <p className="text-3xl font-bold text-white mb-1">{s.value}</p>
                  <p className="text-[#9cb8d9] text-sm">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      {features.length > 0 && (
        <section className="py-20">
          <div className="container mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-3">Analytical Standards & Research Integrity</h2>
              <p className="text-[#9cb8d9]">Every compound supplied is HPLC-tested before dispatch. Analytical results documented and available on request.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-[#0b1a30] border border-white/[0.07] rounded-2xl p-6 hover:border-blue-500/30 transition-colors"
                  style={{ backgroundColor: 'var(--theme-surface)' }}
                >
                  <div className="w-12 h-12 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center mb-4 text-2xl">
                    {f.icon || (ICON_MAP['🔬'])}
                  </div>
                  <h3 className="text-white font-bold mb-2">{f.title}</h3>
                  <p className="text-[#9cb8d9] text-sm leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust Bullets */}
      {trustBullets.length > 0 && (
        <section className="py-16" style={{ backgroundColor: 'color-mix(in srgb, var(--theme-surface) 50%, transparent)' }}>
          <div className="container mx-auto px-6">
            <div className="max-w-2xl mx-auto border border-white/[0.08] rounded-2xl p-8" style={{ backgroundColor: 'var(--theme-surface)' }}>
              <h2 className="text-white font-bold text-xl mb-6 text-center">Compound Verification Standards</h2>
              <div className="space-y-3">
                {trustBullets.map((b, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                    <p className="text-[#8cabd8] text-sm">{b}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA Block */}
      {data.ctaHeading && (
        <section
          className="py-20"
          style={{ background: data.ctaBgColor || 'var(--theme-surface)' }}
        >
          <div className="container mx-auto px-6 text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-white mb-4"
            >
              {data.ctaHeading}
            </motion.h2>
            {data.ctaSubtext && (
              <p className="text-[#9cb8d9] mb-8 max-w-xl mx-auto">{data.ctaSubtext}</p>
            )}
            <a
              href={data.ctaButtonUrl || '/products'}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-10 py-4 rounded-xl font-bold hover:from-blue-500 hover:to-blue-400 transition-all shadow-[0_4px_24px_rgba(37,99,235,0.4)] hover:-translate-y-0.5"
            >
              {data.ctaButton || 'Access Compound Catalogue'} <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </section>
      )}
      {/* Research Disclaimer Footer */}
      <section className="py-8 border-t border-white/[0.05]">
        <div className="container mx-auto px-6 text-center">
          <p className="text-[#2a4a7a] text-xs leading-relaxed max-w-2xl mx-auto">
            All compounds supplied by PH Labs are intended strictly for <strong className="text-[#3a5a82]">in vitro research and laboratory use only</strong>. 
            Not for human or veterinary administration. Every batch is HPLC-tested before dispatch.
            Analytical results documented and available on request.
            By accessing this page you confirm compliance with applicable local regulations.
          </p>
        </div>
      </section>
    </div>
  );
}
