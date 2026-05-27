import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Home, Activity, Flame, Brain, Dna, Microscope, ArrowRight } from 'lucide-react';

const categories = [
  { label: 'Tissue Repair', slug: 'tissue-repair', icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { label: 'Metabolic / GLP-1', slug: 'metabolic-signaling', icon: Flame, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { label: 'Cellular Ageing', slug: 'cellular-aging', icon: Dna, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { label: 'Neurological', slug: 'neurological', icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { label: 'Lab Reports', slug: null, href: '/lab-reports', icon: Microscope, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
];

export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page Not Found | PH Labs UK';
    let desc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!desc) { desc = document.createElement('meta'); desc.setAttribute('name', 'description'); document.head.appendChild(desc); }
    desc.setAttribute('content', 'This page could not be found. Browse HPLC-verified research peptides — BPC-157, Semaglutide, TB-500 and more. UK delivery, ≥99% purity.');

    // Tell Prerender.io to return HTTP 404 for this snapshot (fixes the
    // dashboard.prerender.io "404 status returned" warning).
    let status = document.querySelector('meta[name="prerender-status-code"]') as HTMLMetaElement | null;
    if (!status) { status = document.createElement('meta'); status.setAttribute('name', 'prerender-status-code'); document.head.appendChild(status); }
    status.setAttribute('content', '404');

    // Also tell crawlers not to index 404 pages.
    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) { robots = document.createElement('meta'); robots.setAttribute('name', 'robots'); document.head.appendChild(robots); }
    robots.setAttribute('content', 'noindex, follow');

    return () => {
      // Clean up so the tag doesn't leak into other routes when SPA-navigating away.
      status?.remove();
      if (robots?.getAttribute('content') === 'noindex, follow') robots.remove();
    };
  }, []);

  return (
    <section id="not-found" className="flex flex-col items-center justify-center min-h-screen bg-[#060f1e] px-6 py-20">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/[0.06] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-emerald-600/[0.04] rounded-full pointer-events-none" />

      <div className="relative text-center max-w-2xl mx-auto space-y-8">
        {/* 404 badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 mb-2">
          <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-blue-400">404 — Sequence Not Found</span>
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
            404
          </h1>
          <p className="text-xl font-semibold text-[#c8daf0] mb-3">
            Research protocol not located
          </p>
          <p className="text-[#a8c0e0] text-sm leading-relaxed max-w-md mx-auto">
            The compound you are looking for does not exist at this location, or has been moved to a different sequence in the catalogue.
          </p>
        </div>

        {/* Primary CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold text-sm rounded-xl shadow-[0_4px_20px_rgba(22,163,74,0.4)] transition-all duration-200 hover:-translate-y-px"
          >
            <Home className="w-4 h-4" />
            Return to Homepage
          </Link>
          <Link
            to="/products"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] hover:border-white/[0.2] text-[#c8daf0] hover:text-white font-semibold text-sm rounded-xl transition-all duration-200"
          >
            Browse All Compounds
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        {/* Category shortcuts */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#8aa8d0] mb-4">Browse by research category</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categories.map(cat => {
              const Icon = cat.icon;
              const href = cat.href || `/products?category=${cat.slug}`;
              return (
                <Link
                  key={cat.label}
                  to={href}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl ${cat.bg} border ${cat.border} hover:opacity-80 transition-all duration-200 text-left`}
                >
                  <Icon className={`w-4 h-4 ${cat.color} shrink-0`} />
                  <span className={`text-xs font-semibold ${cat.color}`}>{cat.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* MHRA disclaimer */}
        <p className="text-[11px] text-[#7090b8] leading-relaxed max-w-lg mx-auto">
          All products supplied by PH Labs are for laboratory research use only. Not for human or veterinary consumption.
        </p>
      </div>
    </section>
  );
}
