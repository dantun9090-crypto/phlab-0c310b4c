import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Clock, BookOpen, ArrowRight, FlaskConical } from 'lucide-react';
import { articles } from './data/articles';
import { MolecularBackground } from '@/components/MolecularBackground';

const categoryColors: Record<string, string> = {
  'Metabolic Research': 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'Analytical Methods': 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  'Tissue Repair': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  'Cognitive Research': 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  'Endocrinology': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'Peptide Science': 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
};

function getCategoryColor(cat: string) {
  return categoryColors[cat] ?? 'bg-blue-500/15 text-blue-300 border-blue-500/25';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Resources() {
  const featured = articles[0];


  const categories = Array.from(new Set(articles.map(a => a.category)));

  // FIX 4: Group articles by category for proper H2/H3 hierarchy
  const categoryGroups: Record<string, { heading: string; articles: typeof articles }> = {
    'Metabolic Research': { 
      heading: 'Metabolic & GLP-1 Research', 
      articles: articles.filter(a => a.category === 'Metabolic Research')
    },
    'Tissue Repair': { 
      heading: 'Tissue Repair & Recovery Research', 
      articles: articles.filter(a => a.category === 'Tissue Repair')
    },
    'Cognitive Research': { 
      heading: 'Neuropeptide & Cognitive Research', 
      articles: articles.filter(a => a.category === 'Cognitive Research')
    },
    'Endocrinology': { 
      heading: 'Growth Hormone Axis Research', 
      articles: articles.filter(a => a.category === 'Endocrinology')
    },
    'Analytical Methods': { 
      heading: 'Peptide Science Fundamentals', 
      articles: articles.filter(a => a.category === 'Analytical Methods')
    },
    'Peptide Science': { 
      heading: 'Longevity & Cellular Research', 
      articles: articles.filter(a => a.category === 'Peptide Science')
    },
  };

  const orderedCategories = [
    'Tissue Repair',
    'Metabolic Research',
    'Cognitive Research',
    'Endocrinology',
    'Peptide Science',
    'Analytical Methods',
  ].filter(cat => categoryGroups[cat]?.articles.length > 0);

  // SEO: title + meta description + canonical + Article schema
  useEffect(() => {
    document.title = 'Research Hub | Pro Health Peptides UK';
    const setMeta = (name: string, content: string, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        if (prop) el.setAttribute('property', name); else el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const metaDesc = 'Peptide research articles: HPLC testing, BPC-157, Tirzepatide, TB-500, NAD+. Laboratory guides for UK researchers. Pro Health Peptides UK.';
    setMeta('description', metaDesc);
    setMeta('keywords', 'peptide research articles, HPLC testing peptides, BPC-157 research, Retatrutide study, research peptides UK science');
    setMeta('og:title', 'Peptide Research Hub | Lab Guides & Science Articles | Pro Health Peptides', true);
    setMeta('og:description', metaDesc, true);
    setMeta('og:url', 'https://www.prohealthpeptides.co.uk/resources', true);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', 'https://www.prohealthpeptides.co.uk/resources');
    return () => {
      document.title = 'Pro Health Peptides UK | HPLC-Tested Research Peptides';
      const d2 = document.querySelector('meta[name="description"]');
      if (d2) d2.setAttribute('content', 'Premium research compounds with HPLC-verified purity. For laboratory research use only. Fast UK shipping.');
      const c2 = document.querySelector('link[rel="canonical"]');
      if (c2) c2.setAttribute('href', 'https://www.prohealthpeptides.co.uk/');
    };
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--theme-bg)' }}>
      {/* Hero header — diagonal accent with depth */}
      <section className="page-hero relative overflow-hidden hero-scanline" style={{ background: 'var(--theme-bg)' }}>
        {/* Background layers */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 100% 80% at 70% -20%, color-mix(in srgb, var(--theme-primary) 15%, transparent) 0%, var(--theme-bg) 55%, var(--theme-bg) 100%)' }} />
        <MolecularBackground opacity={0.55} />

        {/* Right-side accent lines — unique to Resources page */}
        <div className="absolute pointer-events-none" style={{ top: '0%', right: '5%', width: 2, height: '100%', background: 'linear-gradient(to bottom, transparent, rgba(56,182,255,0.15) 40%, rgba(56,182,255,0.08) 70%, transparent)' }} />
        <div className="absolute pointer-events-none" style={{ top: '10%', right: '10%', width: 1, height: '80%', background: 'linear-gradient(to bottom, transparent, rgba(129,140,248,0.12) 50%, transparent)' }} />

        {/* Central glow */}
        <div className="absolute pointer-events-none" style={{ top: '-10%', right: '15%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)', filter: 'blur(60px)' }} />
        <div className="absolute pointer-events-none" style={{ bottom: '0%', left: '10%', width: 500, height: 300, background: 'radial-gradient(ellipse, rgba(37,99,235,0.08) 0%, transparent 65%)', filter: 'blur(40px)' }} />

        <div className="hero-top-shimmer pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-24"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--theme-bg))' }} />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-5 animate-slide-in-up" style={{ animationDelay: '0.05s' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(129,140,248,0.1))', border: '1px solid rgba(129,140,248,0.3)' }}>
              <FlaskConical className="w-4 h-4 text-indigo-400" />
            </div>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#818cf8' }}>Research Library</span>
          </div>
          <h1 className="font-black tracking-tight leading-[1.04] mb-4 animate-slide-in-up"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', color: '#f0f6ff', animationDelay: '0.15s' }}>
            Peptide Science{' '}
            <span style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c7d2fe 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Resources
            </span>
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed mb-6 animate-slide-in-up" style={{ color: '#5a7ea8', animationDelay: '0.25s' }}>
            In-depth scientific articles on research peptides — mechanisms, analytical methods, and preclinical data, written for researchers and science professionals.
          </p>
          {/* Category pills */}
          <div className="flex flex-wrap gap-2 animate-slide-in-up" style={{ animationDelay: '0.35s' }}>
            {categories.map(cat => (
              <span key={cat} className={`text-xs font-medium px-3 py-1.5 rounded-full border ${getCategoryColor(cat)}`}>
                {cat}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {/* Featured article */}
        <div className="mb-14">
          <p className="text-[#3a5a82] text-xs font-semibold uppercase tracking-widest mb-4">Featured Article</p>
          <Link
            to={`/resources/${featured.slug}`}
            className="group block rounded-2xl border border-white/[0.07] hover:border-blue-500/30 transition-all duration-300 overflow-hidden hover:shadow-[0_0_40px_rgba(59,130,246,0.08)]"
            style={{ background: 'var(--theme-surface)' }}
          >
            <div className="p-8 sm:p-10">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <span className={`text-xs font-medium px-3 py-1 rounded-full border ${getCategoryColor(featured.category)}`}>
                  {featured.category}
                </span>
                <span className="flex items-center gap-1.5 text-[#3a5a82] text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  {featured.readTime} min read
                </span>
                <span className="text-[#3a5a82] text-xs">{formatDate(featured.publishDate)}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#f0f6ff] mb-3 group-hover:text-blue-200 transition-colors leading-snug">
                {featured.title}
              </h2>
              <p className="text-[#4a6a8a] text-sm mb-2 italic">{featured.subtitle}</p>
              <p className="text-[#6b8fba] leading-relaxed mb-6 max-w-3xl">{featured.excerpt}</p>
              <div className="flex items-center gap-2 text-blue-400 text-sm font-medium group-hover:gap-3 transition-all">
                <BookOpen className="w-4 h-4" />
                Read full article
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        </div>

        {/* Article grid - grouped by category with H2 headers */}
        <div>
          <p className="text-[#3a5a82] text-xs font-semibold uppercase tracking-widest mb-6">Research Library</p>
          {orderedCategories.map((categoryKey, _catIdx) => {
            const group = categoryGroups[categoryKey];
            if (!group || group.articles.length === 0) return null;
            
            return (
              <div key={categoryKey} className="mb-12">
                {/* H2 Category Header */}
                <h2 className="text-2xl font-bold text-[#f0f6ff] mb-6 pb-3 border-b border-white/[0.07]">
                  {group.heading}
                </h2>
                
                {/* Articles as H3 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {group.articles.map((article, _i) => (
                    <Link
                      key={article.slug}
                      to={`/resources/${article.slug}`}
                      className="group flex flex-col rounded-xl border border-white/[0.07] hover:border-blue-500/25 transition-all duration-300 overflow-hidden hover:shadow-[0_0_24px_rgba(59,130,246,0.07)] p-6"
                      style={{ background: 'var(--theme-surface)' }}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getCategoryColor(article.category)}`}>
                          {article.category}
                        </span>
                      </div>
                      <h3 className="text-[#e0eeff] font-semibold text-base mb-2 group-hover:text-blue-200 transition-colors leading-snug flex-1">
                        {article.title}
                      </h3>
                      <p className="text-[#3a5a82] text-xs leading-relaxed mb-4 line-clamp-3">{article.excerpt}</p>
                      <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/[0.05]">
                        <div className="flex items-center gap-1.5 text-[#3a5a82] text-xs">
                          <Clock className="w-3 h-3" />
                          {article.readTime} min
                        </div>
                        <span className="text-[#3a5a82] text-xs">{formatDate(article.publishDate)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Disclaimer */}
        <div className="mt-14 p-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
          <p className="text-amber-300/70 text-xs leading-relaxed text-center">
            All articles are written for educational and research purposes only. The compounds discussed are investigational and not approved for human therapeutic use. Information does not constitute medical advice.
          </p>
        </div>
      </div>
    </div>
  );
}
