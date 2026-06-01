import { useEffect, useRef, useState } from 'react';
import {
  FlaskConical, ShieldCheck, FileCheck2,
  BarChart3, CheckCircle2, Download, ExternalLink,
  ChevronRight, Beaker, Lock, Package
} from 'lucide-react';

// ─── Animation helpers ──────────────────────────────────────────────────────

// Lightweight scroll-triggered section: adds 'is-visible' via IntersectionObserver
function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); }
    }, { threshold: 0.08 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`will-fade ${className}`}>
      {children}
    </div>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const testingMethods = [
  {
    icon: <BarChart3 className="w-6 h-6" />,
    acronym: 'HPLC',
    fullName: 'High-Performance Liquid Chromatography',
    description:
      'Every batch is tested by reversed-phase HPLC. Compound peaks are separated and measured against reference standards. Any batch that does not meet specification is not released.',
    metrics: ['Retention time matched', 'Peak area integration', 'Impurity profiling', 'Reference standard check'],
    color: 'text-blue-400',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/[0.04]',
    glow: 'bg-blue-500/10',
  },
];

const qualitySteps = [
  { step: '01', label: 'Raw Material Receipt', detail: 'Incoming compounds are checked against supplier Certificates of Analysis before being accepted into storage.' },
  { step: '02', label: 'Visual & Physical Inspection', detail: 'Each vial is inspected for correct appearance, fill level, and labelling before moving to QC testing.' },
  { step: '03', label: 'HPLC Testing', detail: 'Reversed-phase HPLC analysis is performed on every batch. Analytical results are confirmed against reference standards before release.' },
  { step: '04', label: 'Out-of-Spec Quarantine', detail: 'Any batch that does not meet specification is quarantined and not released for supply under any circumstances.' },
  { step: '05', label: 'Batch Documentation', detail: 'Every batch is issued an internal analytical record showing the compound name, batch number, test date, HPLC analytical results, and storage conditions. Available on request.' },
  { step: '06', label: 'Lyophilised & Sealed', detail: 'Compounds are supplied as lyophilised powder in sealed vials, stable at the temperatures specified on each product page.' },
  { step: '07', label: 'Packaging', detail: 'Orders are packed in thermal sealed bags to protect against temperature fluctuations during transit. No ice packs are included.' },
  { step: '08', label: 'Dispatch', detail: 'Tracking number issued at point of dispatch. Orders are sent via tracked courier service.' },
];

const certifications = [
  { icon: <FileCheck2 className="w-5 h-5" />, label: 'Batch Documented', sub: 'Every batch, results on file' },
  { icon: <ShieldCheck className="w-5 h-5" />, label: 'HPLC Method', sub: 'Analytical testing' },
  { icon: <Beaker className="w-5 h-5" />, label: 'Research-Use Classification', sub: 'MHRA-aligned labelling' },
  { icon: <CheckCircle2 className="w-5 h-5" />, label: 'Out-of-Spec = Not Released', sub: 'No exceptions' },
  { icon: <Lock className="w-5 h-5" />, label: 'Sealed Thermal Packaging', sub: 'Protected during transit' },
  { icon: <Package className="w-5 h-5" />, label: 'Tracked Dispatch', sub: 'Every order' },
];

const faqs = [
  {
    q: 'What analytical documentation do you provide?',
    a: 'We maintain HPLC analytical records for every batch. Each record includes the compound name, batch number, test date, and analytical method (HPLC). Documentation is available on request — contact us with your order reference.',
  },
  {
    q: 'What testing method do you use?',
    a: 'We use High-Performance Liquid Chromatography (HPLC) to verify the purity of every batch before it is released. We do not currently perform mass spectrometry or NMR in-house.',
  },
  {
    q: 'How do you verify quality?',
    a: 'We test every batch by HPLC and only release compounds that meet specification. Any batch that falls below spec is not released for supply.',
  },
  {
    q: 'How are compounds stored and shipped?',
    a: 'Compounds are stored as lyophilised powder in sealed vials at the temperature specified on each product page. Orders are packed in thermally sealed bags to protect against temperature changes during transit. No ice packs are included.',
  },
  {
    q: 'What happens if a batch fails QC?',
    a: 'Any batch that fails HPLC testing is quarantined and never released for sale. We do not make exceptions to this.',
  },
];

// ─── Counter ─────────────────────────────────────────────────────────────────

function Counter({ end, suffix = '' }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        obs.disconnect();
        const duration = 1200;
        const startTime = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.round(eased * end));
          if (progress < 1) requestAnimationFrame(tick);
          else setCount(end);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

// ─── FAQ Item ────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.07]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
        aria-expanded={open}
      >
        <span className="text-[#c8d8f0] font-medium text-sm group-hover:text-white transition-colors">{q}</span>
        <ChevronRight className={`w-4 h-4 text-blue-400 shrink-0 mt-0.5 transition-transform duration-300 ${open ? 'rotate-90' : ''}`} />
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? '300px' : '0px', opacity: open ? 1 : 0 }}
      >
        <p className="text-[#4a7aaa] text-sm leading-relaxed pb-5">{a}</p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function QualityControl() {
  // Inject page title + meta description + schema without Helmet
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Quality Control | PH Labs UK';
    
    // Set meta description
    const desc = document.querySelector('meta[name="description"]');
    const prevDesc = desc?.getAttribute('content') || '';
    if (desc) desc.setAttribute('content', 'Quality control at PH Labs: HPLC testing on every batch, thermally sealed dispatch. Research compounds for laboratory use only.');
    
    // Set canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    const prevCanonical = canonical?.getAttribute('href') || '';
    if (canonical) canonical.setAttribute('href', 'https://www.phlabs.co.uk/quality-control');

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'qc-schema';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Quality Control — PH Labs',
      url: 'https://www.phlabs.co.uk/quality-control',
      description: 'Quality control procedures at PH Labs: HPLC testing on every batch, thermally sealed dispatch packaging. Research compounds supplied for laboratory use only.',
      mainEntity: {
        '@type': 'ResearchOrganization',
        name: 'PH Labs',
        url: 'https://www.phlabs.co.uk',
        knowsAbout: ['HPLC analytical testing', 'Research peptide supply', 'Laboratory compound quality control'],
      },
    });
    document.head.appendChild(script);

    const faqScript = document.createElement('script');
    faqScript.type = 'application/ld+json';
    faqScript.id = 'qc-faq-schema';
    faqScript.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
    document.head.appendChild(faqScript);

    return () => {
      document.title = prevTitle;
      if (desc && prevDesc) desc.setAttribute('content', prevDesc);
      if (canonical && prevCanonical) canonical.setAttribute('href', prevCanonical);
      document.getElementById('qc-schema')?.remove();
      document.getElementById('qc-faq-schema')?.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#060f1e] text-white">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="page-hero relative overflow-hidden hero-scanline">
          {/* Grid texture */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
            style={{ backgroundImage: 'linear-gradient(#4a90d9 1px, transparent 1px), linear-gradient(90deg, #4a90d9 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          {/* Ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full opacity-[0.08] pointer-events-none"
            style={{ background: 'radial-gradient(circle, #2563eb 0%, transparent 70%)' }} />

          <div className="max-w-5xl mx-auto px-6 relative">
            <AnimatedSection>
              <div className="flex items-center gap-2 mb-6 animate-slide-in-up" style={{ animationDelay: '0.05s' }}>
                <div className="h-px w-8 bg-blue-500/50" />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-blue-400/70">Analytical Quality Assurance</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#f0f6ff] leading-[1.1] tracking-tight mb-6 max-w-3xl animate-slide-in-up" style={{ animationDelay: '0.15s' }}>
                Rigorous Testing.<br />
                <span className="text-blue-400">Every Batch.</span>
              </h1>

              <p className="text-[#4a7aaa] text-base md:text-lg leading-relaxed max-w-2xl mb-10 animate-slide-in-up" style={{ animationDelay: '0.25s' }}>
                Every batch of research compound from PH Labs is tested by HPLC before dispatch. Analytical results are documented for every batch. We only tell you what we actually do.
              </p>

              <div className="flex flex-wrap gap-3 animate-slide-in-up" style={{ animationDelay: '0.35s' }}>
                <a href="/products"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 transition-colors rounded-xl text-sm font-semibold text-white">
                  <FlaskConical className="w-4 h-4" />
                  View Research Compounds
                </a>
                <a href="/contact"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] transition-colors rounded-xl text-sm font-semibold text-[#c8d8f0]">
                  <Download className="w-4 h-4" />
                  Request a CoA
                </a>
              </div>
            </AnimatedSection>

            {/* Stats strip */}
            <AnimatedSection className="mt-16 grid grid-cols-2 md:grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden">
              {[
                { value: 1, suffix: '', label: 'Test Method', sub: 'HPLC analysis' },
                { value: 8, suffix: '-step', label: 'QC Process', sub: 'Receipt to dispatch' },
                { value: 100, suffix: '%', label: 'Batches Documented', sub: 'Results on file' },
              ].map(({ value, suffix, label, sub }) => (
                <div key={label} className="bg-[#060f1e] px-6 py-6 text-center">
                  <div className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-1">
                    <Counter end={value} suffix={suffix} />
                  </div>
                  <div className="text-xs font-semibold text-[#c8d8f0] mb-0.5">{label}</div>
                  <div className="text-[10px] text-[#3a5a82] uppercase tracking-wider">{sub}</div>
                </div>
              ))}
            </AnimatedSection>
          </div>
        </section>

        {/* ── Testing Methods ───────────────────────────────────────────── */}
        <section className="py-20 border-t border-white/[0.05]">
          <div className="max-w-5xl mx-auto px-6">
            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px w-8 bg-blue-500/50" />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-blue-400/70">Analytical Methods</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#f0f6ff] mb-3">
                Our Testing Method
              </h2>
              <p className="text-[#4a7aaa] text-sm max-w-xl">
                We use HPLC (High-Performance Liquid Chromatography) to test every batch before release. This is the single analytical method we currently use.
              </p>
            </AnimatedSection>

            <div className="max-w-2xl">
              {testingMethods.map((m) => (
                <AnimatedSection key={m.acronym}>
                  <div className={`rounded-2xl border ${m.border} ${m.bg} p-6 h-full`}>
                    <div className="flex items-start gap-4 mb-5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.glow} ${m.color} shrink-0`}>
                        {m.icon}
                      </div>
                      <div>
                        <div className={`text-xl font-bold ${m.color} mb-0.5`}>{m.acronym}</div>
                        <div className="text-[11px] text-[#3a5a82] leading-tight">{m.fullName}</div>
                      </div>
                    </div>
                    <p className="text-[#4a7aaa] text-sm leading-relaxed mb-5">{m.description}</p>
                    <div className="space-y-1.5">
                      {m.metrics.map(metric => (
                        <div key={metric} className="flex items-center gap-2">
                          <div className={`w-1 h-1 rounded-full ${m.color.replace('text-', 'bg-')}`} />
                          <span className="text-[#8aabcc] text-xs font-mono">{metric}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── 8-Step QC Pipeline ────────────────────────────────────────── */}
        <section className="py-20 border-t border-white/[0.05]">
          <div className="max-w-5xl mx-auto px-6">
            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px w-8 bg-blue-500/50" />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-blue-400/70">Production Workflow</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#f0f6ff] mb-3">
                8-Step Quality Control Pipeline
              </h2>
              <p className="text-[#4a7aaa] text-sm max-w-xl">
                From raw material intake through final dispatch — every stage is governed by documented in-process control procedures.
              </p>
            </AnimatedSection>

            <div className="relative">
              {/* Vertical connector line — desktop only */}
              <div className="hidden md:block absolute left-[28px] top-8 bottom-8 w-px bg-gradient-to-b from-blue-500/30 via-blue-500/10 to-transparent" />

              <div className="space-y-4">
                {qualitySteps.map(({ step, label, detail }, i) => (
                  <AnimatedSection key={step}>
                    <div className="flex gap-5 items-start group">
                      {/* Step bubble */}
                      <div className="relative shrink-0 w-14 h-14 rounded-xl border border-blue-500/25 bg-[#0b1a30] flex flex-col items-center justify-center z-10">
                        <span className="text-[9px] font-bold text-blue-500/50 uppercase tracking-widest leading-none">{step}</span>
                      </div>
                      {/* Content */}
                      <div className="flex-1 pt-1 pb-4 border-b border-white/[0.05] group-last:border-b-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[#e8f0fe] font-semibold text-sm">{label}</span>
                          {i === 6 && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">Batch Documented</span>
                          )}
                        </div>
                        <p className="text-[#4a7aaa] text-xs leading-relaxed">{detail}</p>
                      </div>
                    </div>
                  </AnimatedSection>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Certifications grid ────────────────────────────────────────── */}
        <section className="py-20 border-t border-white/[0.05]">
          <div className="max-w-5xl mx-auto px-6">
            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px w-8 bg-blue-500/50" />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-blue-400/70">Standards & Compliance</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#f0f6ff]">
                Quality Standards We Uphold
              </h2>
            </AnimatedSection>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {certifications.map(({ icon, label, sub }) => (
                <AnimatedSection key={label}>
                  <div className="flex items-start gap-3.5 p-5 rounded-xl border border-white/[0.07] bg-[#0b1a30]/50 hover:border-blue-500/30 hover:bg-[#0b1a30] transition-all duration-300">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                      {icon}
                    </div>
                    <div>
                      <div className="text-[#c8d8f0] font-semibold text-sm mb-0.5">{label}</div>
                      <div className="text-[#3a5a82] text-xs">{sub}</div>
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── MHRA Disclaimer Banner ────────────────────────────────────── */}
        <section className="py-8 border-t border-amber-500/15">
          <div className="max-w-5xl mx-auto px-6">
            <div className="flex items-start gap-4 p-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-400/80 text-xs leading-relaxed font-medium">
                <strong className="text-amber-400 font-bold uppercase">Regulatory Notice: </strong>
                All products supplied by PH Labs are intended exclusively for <strong>in-vitro laboratory research</strong>. They are not intended for human or veterinary use and have not been approved by the MHRA, FDA, or any other regulatory authority for the diagnosis, treatment, cure, or prevention of any disease or medical condition.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="py-20 border-t border-white/[0.05]">
          <div className="max-w-3xl mx-auto px-6">
            <AnimatedSection className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px w-8 bg-blue-500/50" />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-blue-400/70">QC FAQs</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-[#f0f6ff]">
                Common Quality Questions
              </h2>
            </AnimatedSection>
            <div>
              {faqs.map(({ q, a }) => (
                <FaqItem key={q} q={q} a={a} />
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="py-20 border-t border-white/[0.05]">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <AnimatedSection>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/25 bg-blue-500/[0.08] mb-6">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">HPLC Tested · UK Research Supplier</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-4">
                Contact Us About Your Order
              </h2>
              <p className="text-[#4a7aaa] text-sm leading-relaxed mb-8 max-w-lg mx-auto">
                Have questions about your batch or analytical results? Contact our team with your order reference and we'll provide all available HPLC documentation for that batch.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <a href="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 transition-colors rounded-xl text-sm font-semibold text-white">
                  <FileCheck2 className="w-4 h-4" />
                  Contact Us
                </a>
                <a href="/products"
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] transition-colors rounded-xl text-sm font-semibold text-[#c8d8f0]">
                  Browse Compounds
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </AnimatedSection>
          </div>
        </section>

      </div>
  );
}
