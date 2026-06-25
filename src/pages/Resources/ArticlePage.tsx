import { useParams, Link, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Clock, ArrowLeft, BookOpen, ExternalLink, AlertTriangle, FlaskConical, ArrowRight } from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import { getArticle, getRelatedArticles, type Section, type TableData } from './data/articles';
import { MolecularBackground } from '@/components/MolecularBackground';

// Maps article slug → relevant product slugs to link to
const ARTICLE_PRODUCT_MAP: Record<string, Array<{ name: string; slug: string; tagline: string }>> = {
  'what-is-retatrutide': [
    { name: 'Retatrutide', slug: 'retatrutide', tagline: 'Triple GLP-1/GIP/GCGR agonist' },
    { name: 'Tirzepatide', slug: 'tirzepatide', tagline: 'Dual GIP/GLP-1 agonist' },
  ],
  'retatrutide-vs-tirzepatide-vs-semaglutide': [
    { name: 'Retatrutide', slug: 'retatrutide', tagline: 'Triple GLP-1/GIP/GCGR agonist' },
    { name: 'Tirzepatide', slug: 'tirzepatide', tagline: 'Dual GIP/GLP-1 agonist' },
    { name: 'Semaglutide', slug: 'semaglutide', tagline: 'GLP-1 receptor agonist' },
  ],
  'tirzepatide-dual-agonist-research': [
    { name: 'Tirzepatide', slug: 'tirzepatide', tagline: 'Dual GIP/GLP-1 agonist' },
    { name: 'Retatrutide', slug: 'retatrutide', tagline: 'Triple GLP-1/GIP/GCGR agonist' },
    { name: 'Semaglutide', slug: 'semaglutide', tagline: 'GLP-1 receptor agonist' },
  ],
  'bpc-157-tissue-repair': [
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair & gut research' },
    { name: 'TB-500', slug: 'tb-500', tagline: 'Thymosin Beta-4 tissue repair' },
    { name: 'GHK-Cu', slug: 'ghk-cu', tagline: 'Copper peptide skin & repair' },
  ],
  'tb-500-thymosin-beta-4': [
    { name: 'TB-500', slug: 'tb-500', tagline: 'Thymosin Beta-4 tissue repair' },
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair & gut research' },
  ],
  'tb-500-thymosin-beta-4-research': [
    { name: 'TB-500', slug: 'tb-500', tagline: 'Thymosin Beta-4 tissue repair' },
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair & gut research' },
  ],
  'ghk-cu-copper-peptide-research': [
    { name: 'GHK-Cu', slug: 'ghk-cu', tagline: 'Copper peptide skin & repair' },
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair research' },
    { name: 'Epithalon', slug: 'epithalon', tagline: 'Telomere & longevity research' },
  ],
  'epithalon-telomere-research': [
    { name: 'Epithalon', slug: 'epithalon', tagline: 'Telomere & longevity research' },
    { name: 'NAD+', slug: 'nad-plus', tagline: 'Cellular energy & longevity' },
  ],
  'epithalon-telomere-epigenetic-research': [
    { name: 'Epithalon', slug: 'epithalon', tagline: 'Telomere & longevity research' },
    { name: 'NAD+', slug: 'nad-plus', tagline: 'Cellular energy & longevity' },
    { name: 'MOTS-c', slug: 'mots-c', tagline: 'Mitochondrial-derived peptide' },
  ],
  'nad-nicotinamide-adenine-dinucleotide-research': [
    { name: 'NAD+', slug: 'nad-plus', tagline: 'Cellular energy & longevity' },
    { name: 'Epithalon', slug: 'epithalon', tagline: 'Telomere & longevity research' },
    { name: 'MOTS-c', slug: 'mots-c', tagline: 'Mitochondrial-derived peptide' },
  ],
  'ipamorelin-ghrp-research': [
    { name: 'Ipamorelin', slug: 'ipamorelin', tagline: 'GHRP growth hormone secretagogue' },
    { name: 'CJC-1295', slug: 'cjc-1295', tagline: 'GHRH analogue growth hormone' },
  ],
  'cjc-1295-mod-grf-ghrh-research': [
    { name: 'CJC-1295', slug: 'cjc-1295', tagline: 'GHRH analogue growth hormone' },
    { name: 'Ipamorelin', slug: 'ipamorelin', tagline: 'GHRP growth hormone secretagogue' },
  ],
  'selank-anxiolytic-nootropic-peptide': [
    { name: 'Selank', slug: 'selank', tagline: 'Anxiolytic nootropic peptide' },
    { name: 'Semax', slug: 'semax', tagline: 'Neuroprotective cognitive peptide' },
  ],
  'semax-cognitive-neuroprotective-research': [
    { name: 'Semax', slug: 'semax', tagline: 'Neuroprotective cognitive peptide' },
    { name: 'Selank', slug: 'selank', tagline: 'Anxiolytic nootropic peptide' },
  ],
  'kpv-tripeptide-anti-inflammatory-research': [
    { name: 'KPV', slug: 'kpv', tagline: 'Anti-inflammatory tripeptide' },
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair & gut research' },
  ],
  'mots-c-mitochondrial-derived-peptide': [
    { name: 'MOTS-c', slug: 'mots-c', tagline: 'Mitochondrial-derived peptide' },
    { name: 'NAD+', slug: 'nad-plus', tagline: 'Cellular energy & longevity' },
    { name: 'Epithalon', slug: 'epithalon', tagline: 'Telomere & longevity research' },
  ],
  'melanotan-2-melanocortin-research': [
    { name: 'Melanotan 2', slug: 'melanotan-2', tagline: 'Melanocortin photoprotection' },
    { name: 'PT-141', slug: 'pt-141', tagline: 'Melanocortin receptor agonist' },
  ],
  'pt-141-bremelanotide-melanocortin-research': [
    { name: 'PT-141', slug: 'pt-141', tagline: 'Melanocortin receptor agonist' },
    { name: 'Melanotan 2', slug: 'melanotan-2', tagline: 'Melanocortin photoprotection' },
  ],
  'follistatin-344-myostatin-inhibition-research': [
    { name: 'Follistatin-344', slug: 'follistatin-344', tagline: 'Myostatin inhibition research' },
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair research' },
    { name: 'TB-500', slug: 'tb-500', tagline: 'Thymosin Beta-4 tissue repair' },
  ],
  'peptide-storage-reconstitution': [
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair & gut research' },
    { name: 'TB-500', slug: 'tb-500', tagline: 'Thymosin Beta-4 tissue repair' },
    { name: 'Retatrutide', slug: 'retatrutide', tagline: 'Triple GLP-1/GIP/GCGR agonist' },
  ],
  'peptide-storage-lyophilisation-science': [
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'Tissue repair & gut research' },
    { name: 'TB-500', slug: 'tb-500', tagline: 'Thymosin Beta-4 tissue repair' },
    { name: 'Retatrutide', slug: 'retatrutide', tagline: 'Triple GLP-1/GIP/GCGR agonist' },
  ],
  'hplc-testing-explained': [
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'HPLC-verified ≥99% purity' },
    { name: 'TB-500', slug: 'tb-500', tagline: 'HPLC-verified ≥99% purity' },
    { name: 'Retatrutide', slug: 'retatrutide', tagline: 'HPLC-verified ≥99% purity' },
  ],
  'mass-spectrometry-peptide-identity-verification': [
    { name: 'BPC-157', slug: 'bpc-157', tagline: 'MS-verified research peptide' },
    { name: 'Retatrutide', slug: 'retatrutide', tagline: 'MS-verified research peptide' },
    { name: 'Tirzepatide', slug: 'tirzepatide', tagline: 'MS-verified research peptide' },
  ],
  'glow-blend-skin-peptide-research': [
    { name: 'GHK-Cu', slug: 'ghk-cu', tagline: 'Copper peptide skin & repair' },
    { name: 'Epithalon', slug: 'epithalon', tagline: 'Telomere & longevity research' },
  ],
  'klow-blend-cognitive-research': [
    { name: 'Selank', slug: 'selank', tagline: 'Anxiolytic nootropic peptide' },
    { name: 'Semax', slug: 'semax', tagline: 'Neuroprotective cognitive peptide' },
  ],
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const categoryColors: Record<string, string> = {
  'Metabolic Research': 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  'Analytical Methods': 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  'Tissue Repair': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  'Cognitive Research': 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  'Endocrinology': 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  'Peptide Science': 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
};

function ArticleTable({ data }: { data: TableData }) {
  return (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/[0.08]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#0a1828]">
            {data.headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[#8caad4] font-semibold text-xs uppercase tracking-wide border-b border-white/[0.08]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-[#060f1e]' : 'bg-[#071120]'}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-[#a8c4e8] border-b border-white/[0.04]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ type, text }: { type: 'note' | 'warning' | 'info'; text: string }) {
  const styles: Record<string, string> = {
    note: 'border-blue-500/30 bg-blue-500/[0.06] text-blue-200',
    warning: 'border-amber-500/40 bg-amber-500/[0.07] text-amber-200',
    info: 'border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-200',
  };
  const Icon = type === 'warning' ? AlertTriangle : BookOpen;
  return (
    <div className={`flex gap-3 p-4 rounded-xl border my-5 ${styles[type]}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function SectionBlock({ section }: { section: Section }) {
  const headingId = section.heading ? slugify(section.heading) : undefined;
  return (
    <div className="mb-8">
      {section.heading && (
        <h2
          id={headingId}
          className="text-xl font-bold text-[#e0eeff] mb-4 scroll-mt-24 border-l-2 border-blue-500/50 pl-4"
        >
          {section.heading}
        </h2>
      )}
      {section.body.split('\n\n').map((para, i) =>
        para.trim() ? (
          <p 
            key={i} 
            className="text-[#7a9cc0] leading-relaxed mb-4 text-[15px]"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(para.trim(), { ALLOWED_TAGS: ['a','strong','em','b','i','u','br','span','sup','sub','code'], ALLOWED_ATTR: ['href','title','target','rel','class'] }) }}
          />
        ) : null
      )}
      {section.table && <ArticleTable data={section.table} />}
      {section.callout && <Callout type={section.callout.type} text={section.callout.text} />}
    </div>
  );
}

function TableOfContents({ sections, activeId }: { sections: Section[]; activeId: string }) {
  const headings = sections.filter((s) => s.heading);
  if (headings.length === 0) return null;
  return (
    <div className="sticky top-24 rounded-xl border border-white/[0.07] bg-[#0a1828]/60 p-5">
      <p className="text-[#3a5a82] text-xs font-semibold uppercase tracking-widest mb-4">
        In this article
      </p>
      <nav className="space-y-1">
        {headings.map((s) => {
          const id = slugify(s.heading!);
          const isActive = activeId === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              className={`block text-xs py-1.5 px-2 rounded transition-colors leading-snug ${
                isActive
                  ? 'text-blue-300 bg-blue-500/10'
                  : 'text-[#3a5a82] hover:text-[#8caad4] hover:bg-white/[0.03]'
              }`}
            >
              {s.heading}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

// Legacy/external article slug aliases → canonical article slug.
// Keeps old inbound links (and Google index entries) from soft-404'ing
// against the Resources index.
const ARTICLE_SLUG_ALIASES: Record<string, string> = {
  'selank-nootropic-research': 'selank-anxiolytic-nootropic-peptide',
};

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const aliased = slug ? ARTICLE_SLUG_ALIASES[slug] : undefined;
  if (aliased) return <Navigate to={`/resources/${aliased}`} replace />;
  const article = getArticle(slug ?? '');
  const related = getRelatedArticles(article?.relatedSlugs ?? []);
  const relatedProducts = ARTICLE_PRODUCT_MAP[article?.slug ?? ''] ?? [];
  const [activeId, setActiveId] = useState('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Per-article SEO: title, meta description, canonical, OG, Article schema
  useEffect(() => {
    if (!article) return;
    const articleUrl = `https://phlabs.co.uk/resources/${article.slug}`;
    const shortTitle = article.title.length > 38 ? article.title.slice(0, 36).trimEnd() + '…' : article.title;
    document.title = `${shortTitle} | PH Labs`;

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

    // FIX 6: Meta description 120-158 chars ending with "| PH Labs UK"
    let metaDesc = article.excerpt;
    const suffix = ' | PH Labs UK';
    
    // If excerpt is too long, truncate to fit within 158 chars with suffix
    if (metaDesc.length + suffix.length > 158) {
      metaDesc = metaDesc.slice(0, 158 - suffix.length - 3) + '...' + suffix;
    } else {
      metaDesc = metaDesc + suffix;
    }
    
    // Ensure it's at least 120 chars
    if (metaDesc.length < 120) {
      metaDesc = article.excerpt.slice(0, 120 - suffix.length) + suffix;
    }
    
    setMeta('description', metaDesc);
    setMeta('keywords', [...article.keywords, 'research peptides UK', 'PH Labs'].join(', '));
    setMeta('og:title', `${article.title} | PH Labs`, true);
    setMeta('og:description', metaDesc, true);
    setMeta('og:url', articleUrl, true);
    setMeta('og:type', 'article', true);
    setMeta('article:published_time', article.publishDate, true);
    setMeta('article:section', article.category, true);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', articleUrl);

    // Article + BreadcrumbList schema
    const fallbackImage = 'https://cdn.wegic.ai/assets/onepage/uploads/2031481443271393281/image/2026/03/14/01KKPB20SGJ3T4RK47TQPSAV0N.png';
    const articleImage = (article as any).image || (article as any).coverImage || fallbackImage;
    const schema = [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: metaDesc,
        url: articleUrl,
        image: [articleImage],
        datePublished: article.publishDate,
        dateModified: article.publishDate,
        author: { '@type': 'Organization', name: 'PH Labs', url: 'https://phlabs.co.uk' },
        publisher: {
          '@type': 'Organization',
          name: 'PH Labs',
          logo: {
            '@type': 'ImageObject',
            url: 'https://cdn.wegic.ai/assets/onepage/uploads/2031481443271393281/image/2026/03/14/01KKPB20SGJ3T4RK47TQPSAV0N.png',
          },
        },
        keywords: article.keywords.join(', '),
        articleSection: article.category,
        inLanguage: 'en-GB',
        mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
      },

      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://phlabs.co.uk/' },
          { '@type': 'ListItem', position: 2, name: 'Research Hub', item: 'https://phlabs.co.uk/resources' },
          { '@type': 'ListItem', position: 3, name: article.title, item: articleUrl },
        ],
      },
    ];
    const scriptEl = document.createElement('script');
    scriptEl.type = 'application/ld+json';
    scriptEl.id = 'article-schema';
    scriptEl.textContent = JSON.stringify(schema);
    document.getElementById('article-schema')?.remove();
    document.head.appendChild(scriptEl);

    return () => {
      document.getElementById('article-schema')?.remove();
      document.title = 'PH Labs UK | HPLC-Tested Research Peptides';
      const d2 = document.querySelector('meta[name="description"]');
      if (d2) d2.setAttribute('content', 'Premium research compounds with HPLC-verified purity. For laboratory research use only. Fast UK shipping.');
      const c2 = document.querySelector('link[rel="canonical"]');
      if (c2) c2.setAttribute('href', 'https://phlabs.co.uk/');
      ['og:title','og:description','og:url','og:type','article:published_time','article:section'].forEach(p =>
        document.querySelector(`meta[property="${p}"]`)?.remove()
      );
    };
  }, [article, slug]);

  // Heading intersection observer for ToC highlighting
  useEffect(() => {
    if (!article) return;
    const headingIds = article.content
      .filter((s) => s.heading)
      .map((s) => slugify(s.heading!));

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    headingIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [article, slug]);

  if (!article) return <Navigate to="/resources" replace />;

  const catColor =
    categoryColors[article.category] ?? 'bg-blue-500/15 text-blue-300 border-blue-500/25';

  return (
    <div className="min-h-screen" style={{ background: '#010608' }}>
      <section className="relative overflow-hidden page-hero pb-12" style={{ background: '#010608' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 100% 80% at 50% -10%, #071d44 0%, #040e1e 50%, #010608 100%)' }} />
        <MolecularBackground opacity={0.4} />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/4 w-[500px] h-[200px] rounded-full" style={{ background: 'rgba(26,86,232,0.04)', opacity: 0 }} />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
          <Link
            to="/resources"
            className="inline-flex items-center gap-1.5 text-sm transition-colors mb-6"
            style={{ color: '#2e4e70' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#60a5fa'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#2e4e70'}
          >
            <ArrowLeft className="w-4 h-4" />
            Research Library
          </Link>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className={`text-xs font-medium px-3 py-1 rounded-full border ${catColor}`}>
              {article.category}
            </span>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#2e4e70' }}>
              <Clock className="w-3.5 h-3.5" />
              {article.readTime} min read
            </span>
            <span className="text-xs" style={{ color: '#2e4e70' }}>{formatDate(article.publishDate)}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight" style={{ color: '#eef4ff', letterSpacing: '-0.02em' }}>
            {article.title}
          </h1>
          <p className="text-base italic mb-4" style={{ color: '#3a5a78' }}>{article.subtitle}</p>
          <p className="text-sm leading-relaxed max-w-3xl" style={{ color: '#5a7ea8' }}>{article.excerpt}</p>
        </div>
      </section>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12" style={{ background: '#010608' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-10">
          <article>
            {article.content.map((section, i) => (
              <SectionBlock key={i} section={section} />
            ))}
            {article.references.length > 0 && (
              <section className="mt-12 pt-8 border-t border-white/[0.07]">
                <h2 className="text-lg font-bold text-[#e0eeff] mb-5">References</h2>
                <ol className="space-y-3">
                  {article.references.map((ref) => (
                    <li key={ref.id} className="flex gap-3 text-xs text-[#3a5a82] leading-relaxed">
                      <span className="text-[#9cb8d9] font-mono shrink-0 mt-0.5">[{ref.id}]</span>
                      <span>
                        {ref.authors} ({ref.year}).{' '}
                        <em className="text-[#4a6a8a]">{ref.title}.</em> {ref.journal}.{' '}
                        {ref.doi && (
                          <a
                            href={`https://doi.org/${ref.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500/70 hover:text-blue-400 inline-flex items-center gap-0.5 transition-colors"
                          >
                            doi:{ref.doi} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {relatedProducts.length > 0 && (
              <section className="mt-12">
                <h2 className="text-lg font-bold text-[#e0eeff] mb-2">Shop Related Compounds</h2>
                <p className="text-[#3a5a82] text-xs mb-5">HPLC-tested ≥99% purity · Same-day UK dispatch · Batch CoA included</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {relatedProducts.map((p) => (
                    <Link
                      key={p.slug}
                      to={`/products/${p.slug}`}
                      className="group flex items-center gap-3 p-4 rounded-xl border border-white/[0.07] bg-[#04101f]/70 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] transition-all duration-200"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <FlaskConical className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#d0e8ff] text-sm font-semibold group-hover:text-emerald-300 transition-colors truncate">{p.name}</p>
                        <p className="text-[#3a5a82] text-xs truncate">{p.tagline}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#9cb8d9] group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {related.length > 0 && (
              <section className="mt-12">
                <h2 className="text-lg font-bold text-[#e0eeff] mb-5">Related Articles</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {related.map((rel) => (
                    <Link
                      key={rel.slug}
                      to={`/resources/${rel.slug}`}
                      className="group block p-5 rounded-xl border border-white/[0.07] bg-[#0a1828]/50 hover:border-blue-500/25 transition-all"
                    >
                      <p className="text-[#e0eeff] text-sm font-medium group-hover:text-blue-300 transition-colors mb-1 leading-snug">
                        {rel.title}
                      </p>
                      <p className="text-[#3a5a82] text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {rel.readTime} min read
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <div className="mt-10 p-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.05]">
              <p className="text-amber-300/75 text-xs text-center leading-relaxed font-medium">
                <strong className="text-amber-300">RESEARCH USE ONLY NOTICE:</strong> All information on this page is provided for educational and scientific research reference purposes only. Products discussed are supplied strictly for in-vitro and preclinical laboratory research. Not for human or veterinary consumption. Not intended to diagnose, treat, cure or prevent any disease. Products have not been evaluated or approved by the MHRA or FDA. This content does not constitute medical advice. Always consult a qualified medical professional.
              </p>
            </div>
          </article>
          <aside className="hidden lg:block">
            <TableOfContents sections={article.content} activeId={activeId} />
          </aside>
        </div>
      </div>
    </div>
  );
}