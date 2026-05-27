import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Microscope, FileText, Download, CheckCircle2, ExternalLink, FlaskConical, BarChart3, Dna, Award } from 'lucide-react';
import { Link } from 'react-router-dom';

const labReports = [
  {
    id: 'tb500',
    compound: 'TB-500 (Thymosin Beta-4)',
    batchRef: 'PHP-TB500-2501',
    date: 'January 2025',
    method: 'HPLC / MS',
    status: 'Passed',
    mw: '4,963 Da',
    sequence: 'Ac-SDKPDMAEIEKFDKSKLKKTETE...',
    notes: 'Identity confirmed by ESI-MS.',
  },
  {
    id: 'bpc157',
    compound: 'BPC-157',
    batchRef: 'PHP-BPC157-2502',
    date: 'February 2025',
    method: 'HPLC / MS',
    status: 'Passed',
    mw: '1,419 Da',
    sequence: 'GEPPPGKPADDAGLV',
    notes: 'Lyophilised. Single dominant peak observed at 214 nm. Mass confirmed.',
  },
  {
    id: 'nad',
    compound: 'NAD+ (Nicotinamide Adenine Dinucleotide)',
    batchRef: 'PHP-NAD-2503',
    date: 'March 2025',
    method: 'HPLC / UV',
    status: 'Passed',
    mw: '663 Da',
    sequence: 'N/A — nucleotide compound',
    notes: 'UV absorbance profile consistent with reference standard. No amino acid contamination detected.',
  },
  {
    id: 'kpv',
    compound: 'KPV Tripeptide',
    batchRef: 'PHP-KPV-2504',
    date: 'March 2025',
    method: 'HPLC / MS',
    status: 'Passed',
    mw: '340 Da',
    sequence: 'Lys-Pro-Val',
    notes: 'Exceptionally high purity batch. Identity confirmed by tandem MS/MS fragmentation pattern.',
  },
  {
    id: 'motsc',
    compound: 'MOTS-c',
    batchRef: 'PHP-MOTSC-2505',
    date: 'April 2025',
    method: 'HPLC / MS',
    status: 'Passed',
    mw: '2,174 Da',
    sequence: 'MRWQEMGYIFYPRKLR',
    notes: 'Mitochondria-encoded peptide. Sequence verified by LC-MS/MS. Lyophilised and sealed under inert atmosphere.',
  },
  {
    id: 'selank',
    compound: 'Selank',
    batchRef: 'PHP-SELANK-2506',
    date: 'April 2025',
    method: 'HPLC / MS',
    status: 'Passed',
    mw: '751 Da',
    sequence: 'Thr-Lys-Pro-Arg-Pro-Gly-Pro',
    notes: 'Heptapeptide analogue of tuftsin. Single HPLC peak. MS confirms nominal mass ±0.1 Da.',
  },
];

const methodologySteps = [
  {
    icon: FlaskConical,
    title: 'Sample Preparation',
    desc: 'Each batch is dissolved in mobile phase-compatible solvent at defined concentration for analytical injection.',
    color: 'blue',
  },
  {
    icon: BarChart3,
    title: 'HPLC Analysis',
    desc: 'Reverse-phase HPLC with C18 column, UV detection at 214 nm. Run time: 20–30 min per sample.',
    color: 'purple',
  },
  {
    icon: Microscope,
    title: 'Mass Spectrometry',
    desc: 'ESI-MS confirms molecular weight against theoretical value. Tolerance ±0.5 Da accepted.',
    color: 'green',
  },
  {
    icon: FileText,
    title: 'CoA Generation',
    desc: 'Certificate of Analysis generated for each batch with chromatogram and MS data.',
    color: 'amber',
  },
];

const colorMap: Record<string, string> = {
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  green: 'bg-green-500/10 border-green-500/20 text-green-400',
  amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
};

// Intersection-observer based fade-in hook
function useFadeIn(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold, rootMargin: '0px 0px -30px 0px' }
    );
    obs.observe(el);
    // Also fire immediately if already in view
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) { setVisible(true); obs.disconnect(); }
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useFadeIn();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function LabReports() {
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    document.title = 'Lab Reports & CoA | PH Labs UK';
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
    const metaDesc = 'HPLC & mass spec lab reports for every batch. Certificates of Analysis (CoA) for UK research peptides — BPC-157, Tirzepatide, TB-500.';
    setMeta('description', metaDesc);
    setMeta('keywords', 'HPLC tested peptides UK, peptide CoA, certificate of analysis research peptides, lab reports peptides UK, mass spectrometry peptide verification');
    setMeta('og:title', 'Lab Reports & CoA | HPLC-Tested Research Peptides | PH Labs UK', true);
    setMeta('og:description', metaDesc, true);
    setMeta('og:url', 'https://www.phlabs.co.uk/lab-reports', true);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', 'https://www.phlabs.co.uk/lab-reports');
    // Trigger hero animation after paint
    const raf = requestAnimationFrame(() => setTimeout(() => setHeroVisible(true), 80));
    return () => {
      cancelAnimationFrame(raf);
      document.title = 'PH Labs UK | HPLC-Tested Research Peptides';
      const d2 = document.querySelector('meta[name="description"]');
      if (d2) d2.setAttribute('content', 'Premium research compounds with HPLC-verified purity. For laboratory research use only. Fast UK shipping.');
      const c2 = document.querySelector('link[rel="canonical"]');
      if (c2) c2.setAttribute('href', 'https://www.phlabs.co.uk/');
    };
  }, []);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: 'var(--theme-bg)' }}>

      {/* ── Hero ── */}
      <section className="page-hero relative border-b border-white/[0.07] overflow-hidden hero-scanline">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/50 via-[#060f1e] to-[#060f1e]" />
        <div
          className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full transition-all duration-1000"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)', opacity: heroVisible ? 1 : 0 }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full transition-all duration-1200 delay-300"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)', opacity: heroVisible ? 1 : 0 }}
        />

        {/* Floating dots */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${3 + (i % 3)}px`,
              height: `${3 + (i % 3)}px`,
              background: i % 3 === 0 ? 'rgba(59,130,246,0.4)' : i % 3 === 1 ? 'rgba(16,185,129,0.35)' : 'rgba(139,92,246,0.3)',
              top: `${10 + i * 10}%`,
              left: `${5 + i * 11}%`,
              opacity: heroVisible ? 0.6 : 0,
              transform: heroVisible ? 'scale(1)' : 'scale(0)',
              transition: `all 0.8s ease ${300 + i * 80}ms`,
              animation: heroVisible ? `float-${i % 2 === 0 ? 'a' : 'b'} ${4 + i}s ease-in-out infinite` : 'none',
            }}
          />
        ))}

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-2 rounded-full text-sm font-medium mb-6"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(-12px)', transition: 'all 0.6s ease 100ms' }}
            >
              <ShieldCheck className="w-4 h-4" />
              Independent Third-Party Testing
            </div>

            {/* H1 */}
            <h1
              className="text-4xl md:text-5xl font-bold text-[#f0f6ff] leading-tight mb-5"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.7s ease 200ms' }}
            >
              Lab Reports{' '}&{' '}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                Batch Certificates
              </span>
            </h1>

            <p
              className="text-[#9cb8d9] text-lg leading-relaxed max-w-2xl mb-8"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.7s ease 350ms' }}
            >
              Every compound we supply undergoes independent analytical testing by HPLC and mass spectrometry before dispatch. Our commitment to full transparency means batch-specific data is available for every product we stock.
            </p>

            {/* Trust stats */}
            <div
              className="flex flex-wrap gap-6"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.7s ease 480ms' }}
            >
              {[
                { icon: CheckCircle2, color: 'text-green-400', label: '100% Batch Tested' },
                { icon: Dna, color: 'text-blue-400', label: 'HPLC + Mass Spec' },
                { icon: Award, color: 'text-amber-400', label: 'CoA on Request' },
              ].map(({ icon: Icon, color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <span className="text-[#8caad4] text-sm font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Testing Methodology ── */}
      <section className="py-16 border-b border-white/[0.06]">
        <div className="container mx-auto px-6">
          <FadeIn className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-4">
              <FlaskConical className="w-3.5 h-3.5" />
              Our Process
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#f0f6ff]">Testing Methodology</h2>
            <p className="text-[#9cb8d9] mt-2 max-w-xl mx-auto text-sm">
              A rigorous four-step analytical workflow applied to every batch before release.
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {methodologySteps.map((step, i) => (
              <FadeIn key={step.title} delay={i * 100}>
                <div className={`h-full p-6 rounded-2xl border bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 hover:-translate-y-1 ${colorMap[step.color].split(' ').slice(1).join(' ')}`}>
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${colorMap[step.color]}`}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#3a5a82] mb-1">Step {i + 1}</div>
                  <h3 className="text-white font-semibold mb-2">{step.title}</h3>
                  <p className="text-[#9cb8d9] text-sm leading-relaxed">{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Batch Reports ── */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <FadeIn className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-3">
                <BarChart3 className="w-3.5 h-3.5" />
                Q1–Q2 2025 Batches
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#f0f6ff]">Current Batch Reports</h2>
            </div>
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-green-400 text-sm font-semibold">All {labReports.length} batches passed</span>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {labReports.map((report, i) => (
              <FadeIn key={report.id} delay={i * 80}>
                <div className="group h-full border border-white/[0.07] hover:border-blue-500/25 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_40px_rgba(37,99,235,0.12)]"
                  style={{ backgroundColor: 'var(--theme-surface)' }}>

                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h3 className="text-[#f0f6ff] font-semibold text-base leading-snug mb-1">{report.compound}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[#3a5a82] text-xs font-mono">{report.batchRef}</span>
                        <span className="text-[#3a5a82] text-xs">·</span>
                        <span className="text-[#3a5a82] text-xs">{report.date}</span>
                      </div>
                    </div>
                    <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/25 text-green-400 text-xs font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      {report.status}
                    </span>
                  </div>

                  {/* Data rows */}
                  <div className="space-y-2.5 mb-5">
                    {[
                      { label: 'Method', value: report.method },
                      { label: 'Mol. Weight', value: report.mw },
                      { label: 'Sequence', value: report.sequence },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-start gap-2">
                        <span className="text-[#3a5a82] text-[11px] font-semibold uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">{label}</span>
                        <span className="text-[#8caad4] text-xs font-mono leading-relaxed break-all">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 mb-5">
                    <p className="text-[#9cb8d9] text-xs leading-relaxed italic">{report.notes}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <a
                      href={`mailto:info@phlabs.co.uk?subject=CoA Request — ${report.batchRef}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] hover:border-white/15 text-[#8caad4] hover:text-white rounded-xl text-xs font-semibold transition-all duration-200"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Request CoA
                    </a>
                    <Link
                      to="/products"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/20 hover:border-blue-500/40 text-blue-300 hover:text-blue-200 rounded-xl text-xs font-semibold transition-all duration-200"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Product
                    </Link>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA + Disclaimer ── */}
      <section className="py-16 border-t border-white/[0.06]" style={{ backgroundColor: 'var(--theme-surface)' }}>
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* CTA card */}
            <FadeIn>
              <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/25 to-[#060f1e] border border-blue-500/15 rounded-2xl p-8 md:p-10 text-center">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-transparent to-indigo-600/5 pointer-events-none" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
                    <Microscope className="w-7 h-7 text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-3">Need a Full Certificate of Analysis?</h2>
                  <p className="text-[#9cb8d9] mb-7 max-w-xl mx-auto">
                    Full batch CoA documentation — including chromatogram images, integration data, and MS spectra — is available for any product on request. Contact us with your order reference number.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <a
                      href="mailto:info@phlabs.co.uk?subject=Certificate of Analysis Request"
                      className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 text-white font-semibold rounded-xl transition-all shadow-[0_4px_20px_rgba(37,99,235,0.35)] hover:shadow-[0_4px_28px_rgba(37,99,235,0.55)] hover:-translate-y-px"
                    >
                      <FileText className="w-4 h-4" />
                      Request CoA by Email
                    </a>
                    <Link
                      to="/contact"
                      className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/[0.06] hover:bg-white/[0.10] border border-white/15 text-white font-medium rounded-xl transition-all hover:-translate-y-px"
                    >
                      Contact Our Team
                    </Link>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Legal disclaimer */}
            <FadeIn delay={100}>
              <div className="bg-amber-900/10 border border-amber-500/15 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 font-semibold text-sm mb-1">Research Use Only</p>
                    <p className="text-[#9cb8d9] text-xs leading-relaxed">
                      All compounds and associated analytical data are provided exclusively for in-vitro laboratory research purposes. These materials are not intended for diagnostic, therapeutic, or human consumption use. Analytical results relate to specific batch samples and do not constitute a guarantee of performance in research applications. PH Labs operates in full compliance with applicable UK regulatory frameworks governing the supply of research compounds.
                    </p>
                  </div>
                </div>
              </div>
            </FadeIn>

          </div>
        </div>
      </section>

      <style>{`
        @keyframes float-a {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-8px) scale(1.1); }
        }
        @keyframes float-b {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(6px) scale(0.95); }
        }
      `}</style>
    </div>
  );
}
