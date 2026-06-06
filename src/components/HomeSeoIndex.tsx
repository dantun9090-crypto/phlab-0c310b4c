import { Link } from 'react-router-dom';
import { FlaskConical, BookOpen, Microscope } from 'lucide-react';
import { articles } from '@/pages/Resources/data/articles';

// Static, SSR-rendered link hub. Exists to give Googlebot direct anchors to
// every product slug + every resource article from the homepage — fixes
// "Discovered – currently not indexed" on deep URLs. Do not gate behind JS.
const ALL_PRODUCTS: Array<{ slug: string; name: string }> = [
  { slug: 'ghk-cu-research-peptide', name: 'GHK-Cu' },
  { slug: 'kpv-research-peptide', name: 'KPV' },
  { slug: 'melanotan-ii-research-peptide', name: 'Melanotan II' },
  { slug: 'mots-c-research-peptide', name: 'MOTS-c' },
  { slug: 'nad-research-compound', name: 'NAD+' },
  { slug: 'pt-141-research-peptide', name: 'PT-141' },
  { slug: 'retatrutide-research-peptide', name: 'Retatrutide' },
  { slug: 'tb-500-thymosin-beta-4', name: 'TB-500 (Thymosin β-4)' },
  { slug: 'tirzepatide-research-peptide', name: 'Tirzepatide' },
  { slug: 'bacteriostatic-water-research-compound', name: 'Bacteriostatic Water' },
  { slug: 'glow-blend', name: 'Glow Blend' },
  { slug: 'klow-blend', name: 'Klow Blend' },
];

export default function HomeSeoIndex() {
  return (
    <section
      aria-label="Site index"
      className="relative"
      style={{ background: '#020812', borderTop: '1px solid rgba(255,255,255,0.04)', padding: '64px 0' }}
    >
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <div className="text-[11px] font-bold tracking-[0.2em] uppercase mb-2" style={{ color: 'rgba(16,185,129,0.7)' }}>
            Full Catalogue
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Browse Every Research Compound &amp; Resource</h2>
          <p className="text-sm mt-2" style={{ color: '#8db4d8' }}>
            Direct access to every product page and research article on phlabs.co.uk.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_0.7fr] gap-10">
          {/* Featured Research Compounds */}
          <div>
            <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase mb-4" style={{ color: 'rgba(16,185,129,0.85)' }}>
              <FlaskConical className="w-3.5 h-3.5" /> Featured Research Compounds
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {ALL_PRODUCTS.map((p) => (
                <li key={p.slug}>
                  <Link
                    to={`/products/${p.slug}`}
                    className="group flex items-center gap-2 text-sm transition-colors"
                    style={{ color: '#8db4d8' }}
                  >
                    <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'rgba(16,185,129,0.5)' }} />
                    <span className="hover:text-white transition-colors">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Research Resources */}
          <div>
            <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase mb-4" style={{ color: 'rgba(59,130,246,0.85)' }}>
              <BookOpen className="w-3.5 h-3.5" /> Research Library
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {articles.map((a) => (
                <li key={a.slug}>
                  <Link
                    to={`/resources/${a.slug}`}
                    className="group flex items-start gap-2 text-sm"
                    style={{ color: '#8db4d8' }}
                  >
                    <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: 'rgba(59,130,246,0.5)' }} />
                    <span className="hover:text-white transition-colors leading-snug">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About PH Labs */}
          <div>
            <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] uppercase mb-4" style={{ color: 'rgba(168,85,247,0.85)' }}>
              <Microscope className="w-3.5 h-3.5" /> About PH Labs
            </h3>
            <ul className="space-y-2">
              {[
                { href: '/about', label: 'About Us' },
                { href: '/quality-control', label: 'Quality Control & Testing' },
                { href: '/lab-reports', label: 'HPLC Lab Reports' },
                { href: '/research', label: 'Research Methodology' },
                { href: '/contact', label: 'Contact Us' },
                { href: '/shipping-policy', label: 'Shipping Policy' },
                { href: '/refund-policy', label: 'Refund Policy' },
                { href: '/privacy-policy', label: 'Privacy Policy' },
                { href: '/terms-and-conditions', label: 'Terms & Conditions' },
                { href: '/cookies', label: 'Cookie Policy' },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="flex items-center gap-2 text-sm hover:text-white transition-colors"
                    style={{ color: '#8db4d8' }}
                  >
                    <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'rgba(168,85,247,0.5)' }} />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
