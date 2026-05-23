import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import React from 'react';
import {
  FlaskConical, BookOpen, ArrowRight, ExternalLink,
  Zap, Shield, Brain, Activity, Dna, ChevronDown
} from 'lucide-react';
import { AnimatedBackground } from '@/components/AnimatedBackground';

/* ── Scroll-fade hook ───────────────────────────────────────────── */
function useScrollFade(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px', ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

/* ── FadeIn wrapper component ───────────────────────────────────── */
interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'left' | 'right' | 'none';
  className?: string;
}
function FadeIn({ children, delay = 0, direction = 'up', className = '' }: FadeInProps) {
  const { ref, visible } = useScrollFade();
  const translateMap = { up: 'translateY(32px)', left: 'translateX(-24px)', right: 'translateX(24px)', none: 'none' };
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : translateMap[direction],
        transition: `opacity 0.65s ease ${delay}ms, transform 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

interface CompoundRow {
  name: string;
  type: string;
  targets: string;
  mechanism: string;
  halfLife: string;
  route: string;
  primaryEffect: string;
  clinicalPhase: string;
  slug: string;
  productSlug?: string;
  color: string;
}

const GLP_COMPOUNDS: CompoundRow[] = [
  {
    name: 'Retatrutide',
    type: 'Triple Agonist',
    targets: 'GLP-1R + GIPR + GCGR',
    mechanism: 'Insulin secretion ↑ · Appetite ↓ · Energy expenditure ↑↑',
    halfLife: '~6 days',
    route: 'SC weekly',
    primaryEffect: 'Weight reduction (up to −24.2% at 48 wks)',
    clinicalPhase: 'Phase 3 (TRIUMPH)',
    slug: 'what-is-retatrutide',
    productSlug: 'retatrutide',
    color: 'blue',
  },
  {
    name: 'Tirzepatide',
    type: 'Dual Agonist',
    targets: 'GLP-1R + GIPR',
    mechanism: 'Insulin secretion ↑ · Appetite ↓ · Adipose lipolysis ↑',
    halfLife: '~5 days',
    route: 'SC weekly',
    primaryEffect: 'Weight reduction (up to −20.9% at 72 wks)',
    clinicalPhase: 'Phase 3 approved (SURMOUNT)',
    slug: 'tirzepatide-dual-agonist-research',
    productSlug: 'tirzepatide',
    color: 'indigo',
  },
  {
    name: 'Semaglutide',
    type: 'Mono Agonist',
    targets: 'GLP-1R only',
    mechanism: 'Insulin secretion ↑ · Gastric emptying ↓ · Appetite ↓',
    halfLife: '~7 days',
    route: 'SC weekly / oral',
    primaryEffect: 'Weight reduction (−14.9% at 68 wks, STEP-1)',
    clinicalPhase: 'Approved (STEP, SUSTAIN)',
    slug: 'retatrutide-vs-tirzepatide-vs-semaglutide',
    productSlug: 'semaglutide',
    color: 'cyan',
  },
];

const PEPTIDE_COMPOUNDS = [
  {
    name: 'BPC-157',
    category: 'Tissue Repair',
    mechanism: 'Angiogenesis ↑ (VEGFR-2) · Growth hormone receptor upregulation · Nitric oxide modulation',
    models: 'Rodent tendon, ligament, muscle, gut mucosa models',
    keyFinding: 'Accelerated tendon-to-bone healing in transection models; gastroprotective in acetic acid ulcer models',
    slug: 'bpc-157-tissue-repair',
    productSlug: 'bpc-157',
    icon: Shield,
    color: 'emerald',
  },
  {
    name: 'KPV',
    category: 'Anti-Inflammatory',
    mechanism: 'MC1R/MC3R agonism → cAMP ↑ → NF-κB p65 translocation ↓ → TNF-α, IL-1β, IL-6 ↓',
    models: 'DSS and TNBS colitis rodent models, LPS-stimulated macrophage cultures',
    keyFinding: 'Reduced colonic MPO activity and mucosal cytokine levels in DSS colitis; nano-encapsulated form showed superior efficacy',
    slug: 'kpv-tripeptide-anti-inflammatory-research',
    productSlug: 'kpv',
    icon: Shield,
    color: 'teal',
  },
  {
    name: 'MOTS-C',
    category: 'Metabolic / Exercise',
    mechanism: 'MTHFD1 inhibition → AICAR ↑ → AMPK activation → GLUT4 translocation, mitochondrial biogenesis',
    models: 'DIO mice, aged mouse models, C2C12 myotubes',
    keyFinding: 'Restored endurance and metabolic parameters in aged mice to near-young levels; insulin sensitivity ↑ by AMPK pathway',
    slug: 'mots-c-mitochondrial-derived-peptide',
    productSlug: 'mots-c',
    icon: Zap,
    color: 'amber',
  },
  {
    name: 'Epithalon',
    category: 'Longevity / Epigenetics',
    mechanism: 'Telomerase activation · Pineal melatonin synthesis restoration · Chromatin remodelling',
    models: 'Aged rats, cell culture telomere assays',
    keyFinding: 'Lifespan extension in aged rats; telomerase activity increase in somatic cell lines',
    slug: 'epithalon-telomere-research',
    productSlug: 'epithalon',
    icon: Dna,
    color: 'purple',
  },
  {
    name: 'Selank',
    category: 'Cognitive / Anxiolytic',
    mechanism: 'Tuftsin analogue · GABA-A receptor modulation · BDNF upregulation · IL-6 normalisation',
    models: 'Rodent anxiety models (EPM, open field), cognitive impairment models',
    keyFinding: 'Dose-dependent anxiolysis without sedation; BDNF increase in frontal cortex and hippocampus',
    slug: 'selank-nootropic-research',
    productSlug: 'selank',
    icon: Brain,
    color: 'violet',
  },
  {
    name: 'PT-141',
    category: 'Melanocortin CNS',
    mechanism: 'MC3R/MC4R agonism in hypothalamic PVN/LHA circuits → central arousal pathway activation',
    models: 'Rodent proceptive behaviour models; NHP studies; Phase 3 RECONNECT trials',
    keyFinding: 'FDA-approved (HSDD); MC4R-dependent central mechanism confirmed by receptor knockout studies',
    slug: 'pt-141-bremelanotide-melanocortin-research',
    productSlug: 'pt-141',
    icon: Brain,
    color: 'pink',
  },
];

const NAD_COMPOUNDS = [
  {
    name: 'NAD+',
    role: 'Master cofactor',
    source: 'Enzymatic (not cell-permeable as such)',
    pathway: 'Direct substrate for PARP1, sirtuins (SIRT1-7), CD38',
    ageDecline: '40–60% lower in 60–80 yr vs 20–30 yr (blood, muscle)',
    slug: 'nad-nicotinamide-adenine-dinucleotide-research',
  },
  {
    name: 'NMN',
    role: 'Salvage precursor',
    source: 'Dietary / exogenous supplement',
    pathway: 'Converted to NAD+ via NMNAT1-3; enters after NAMPT step',
    ageDecline: 'Replenishes declining NAD+ pool; restores SIRT1 activity',
    slug: 'nad-nicotinamide-adenine-dinucleotide-research',
  },
  {
    name: 'NR',
    role: 'Salvage precursor',
    source: 'Dietary / exogenous supplement',
    pathway: 'Converted to NMN via NRK1/2, then to NAD+',
    ageDecline: 'Multiple clinical trials show raised blood NAD+ in humans',
    slug: 'nad-nicotinamide-adenine-dinucleotide-research',
  },
];

const colorMap: Record<string, string> = {
  blue: 'from-blue-600/20 to-blue-500/10 border-blue-500/30 text-blue-400',
  indigo: 'from-indigo-600/20 to-indigo-500/10 border-indigo-500/30 text-indigo-400',
  cyan: 'from-cyan-600/20 to-cyan-500/10 border-cyan-500/30 text-cyan-400',
  emerald: 'from-emerald-600/20 to-emerald-500/10 border-emerald-500/30 text-emerald-400',
  teal: 'from-teal-600/20 to-teal-500/10 border-teal-500/30 text-teal-400',
  amber: 'from-amber-600/20 to-amber-500/10 border-amber-500/30 text-amber-400',
  purple: 'from-purple-600/20 to-purple-500/10 border-purple-500/30 text-purple-400',
  violet: 'from-violet-600/20 to-violet-500/10 border-violet-500/30 text-violet-400',
  pink: 'from-pink-600/20 to-pink-500/10 border-pink-500/30 text-pink-400',
};

interface ExpandableRowProps {
  p: typeof PEPTIDE_COMPOUNDS[0];
  isOpen: boolean;
  cls: string;
  Icon: React.ElementType;
  onToggle: () => void;
}

function ExpandableRow({ p, isOpen, cls, Icon, onToggle }: ExpandableRowProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!bodyRef.current) return;
    if (isOpen) {
      setHeight(bodyRef.current.scrollHeight);
    } else {
      // First set to current height so transition animates from it
      setHeight(bodyRef.current.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [isOpen]);

  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all duration-300"
      style={{
        borderColor: isOpen ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.07)',
        background: isOpen ? 'linear-gradient(145deg, rgba(37,99,235,0.05), transparent)' : undefined,
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] transition-colors text-left"
        aria-expanded={isOpen}
      >
        <div
          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cls} flex items-center justify-center shrink-0 transition-all duration-300`}
          style={{ transform: isOpen ? 'scale(1.1)' : 'scale(1)' }}
        >
          <Icon className={`w-4 h-4 ${cls.split(' ')[3]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-bold text-sm">{p.name}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] ${cls.split(' ')[3]}`}>{p.category}</span>
          </div>
          <p className="text-[#4a6a8c] text-xs mt-0.5 truncate">{p.mechanism}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to={`/resources/${p.slug}`}
            onClick={e => e.stopPropagation()}
            className="hidden md:inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors"
          >
            Full article <ExternalLink className="w-3 h-3" />
          </Link>
          <ChevronDown
            className="w-4 h-4 text-white/40 transition-transform duration-300"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>

      {/* Animated body */}
      <div
        style={{
          height: isOpen ? height || 'auto' : 0,
          overflow: 'hidden',
          transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          ref={bodyRef}
          className="px-5 pb-5 border-t border-white/[0.05] pt-4 grid md:grid-cols-2 gap-4"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity 0.25s ease 0.1s, transform 0.25s ease 0.1s',
          }}
        >
          <div>
            <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">Mechanism of Action</p>
            <p className="text-[#8ab0d0] text-sm leading-relaxed">{p.mechanism}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">Research Models</p>
            <p className="text-[#8ab0d0] text-sm leading-relaxed mb-3">{p.models}</p>
            <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-2">Key Preclinical Finding</p>
            <p className="text-[#8ab0d0] text-sm leading-relaxed">{p.keyFinding}</p>
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2 pt-1">
            <Link to={`/resources/${p.slug}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/15 border border-blue-500/25 text-blue-400 text-xs font-semibold hover:bg-blue-600/25 transition-colors">
              <BookOpen className="w-3.5 h-3.5" /> Full Scientific Article
            </Link>
            {p.productSlug && (
              <Link to={`/products/${p.productSlug}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 text-xs font-semibold hover:bg-white/[0.07] transition-colors">
                <FlaskConical className="w-3.5 h-3.5" /> View Product
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Research() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // SEO: title + meta description + canonical + schema
  useEffect(() => {
    document.title = 'Research Database | Pro Health Peptides UK';
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
    const metaDesc = 'Peptide research database: GLP-1 agonists, tissue repair, nootropics. Mechanisms, receptor targets, clinical data. Laboratory use only.';
    setMeta('description', metaDesc);
    setMeta('keywords', 'peptide research database, GLP-1 research peptides, BPC-157 mechanism, Retatrutide receptor, lab tested research peptides UK');
    setMeta('og:title', 'Peptide Research Database | Mechanisms & Clinical Data | Pro Health Peptides', true);
    setMeta('og:description', metaDesc, true);
    setMeta('og:url', 'https://www.prohealthpeptides.co.uk/research', true);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', 'https://www.prohealthpeptides.co.uk/research');
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
      {/* ── Hero ── */}
      <section className="page-hero relative border-b border-white/[0.07] overflow-hidden">
        {/* Animated background */}
        <AnimatedBackground variant="blue" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#030812] via-transparent to-[#030812] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 py-24 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ animation: 'researchFadeUp 0.7s cubic-bezier(0.22,1,0.36,1) 0.05s both' }}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Scientific Research Database
          </div>

          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight"
            style={{ animation: 'researchFadeUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.18s both' }}
          >
            Peptide Research &amp;<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400">
              Comparative Science
            </span>
          </h1>

          <p
            className="text-[#7a9ec2] text-lg max-w-3xl mx-auto leading-relaxed mb-8"
            style={{ animation: 'researchFadeUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.32s both' }}
          >
            A structured overview of research compounds, receptor mechanisms, preclinical data, and comparative pharmacological profiles — built for researchers who need the science in one place.
          </p>

          <div
            className="flex flex-wrap justify-center gap-3"
            style={{ animation: 'researchFadeUp 0.8s cubic-bezier(0.22,1,0.36,1) 0.46s both' }}
          >
            <a href="#incretin" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/15 border border-blue-500/25 text-blue-400 text-sm font-semibold hover:bg-blue-600/25 transition-colors">
              <Activity className="w-3.5 h-3.5" /> GLP-1 / Incretin Axis
            </a>
            <a href="#peptides" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/15 border border-indigo-500/25 text-indigo-400 text-sm font-semibold hover:bg-indigo-600/25 transition-colors">
              <FlaskConical className="w-3.5 h-3.5" /> Research Peptides
            </a>
            <a href="#nad" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600/15 border border-amber-500/25 text-amber-400 text-sm font-semibold hover:bg-amber-600/25 transition-colors">
              <Zap className="w-3.5 h-3.5" /> NAD+ Biology
            </a>
          </div>
        </div>
      </section>

      <style>{`
        @keyframes researchFadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-6 py-16 space-y-24">

        {/* ── Section 1: GLP-1 / Incretin Comparison ── */}
        <section id="incretin">
          <FadeIn direction="up">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <Activity className="w-4 h-4 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">GLP-1 / Incretin Axis: Receptor Comparison</h2>
            </div>
            <p className="text-[#5a7a9c] text-sm max-w-2xl">
              Comparative pharmacological profiles of next-generation incretin-based research compounds, ranked by receptor activation breadth.
            </p>
          </div>
          </FadeIn>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {GLP_COMPOUNDS.map((c, idx) => {
              const cls = colorMap[c.color];
              return (
                <FadeIn key={c.name} delay={idx * 80} direction="up">
                <div className={`relative rounded-2xl bg-gradient-to-br ${cls} border p-5 hover:shadow-lg transition-all duration-200`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-0.5">{c.type}</p>
                      <h3 className="text-xl font-black text-white">{c.name}</h3>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/[0.08] ${cls.split(' ')[3]}`}>
                      {c.halfLife}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="text-white/30 mb-0.5">Targets</p>
                      <p className="text-white/80 font-semibold">{c.targets}</p>
                    </div>
                    <div>
                      <p className="text-white/30 mb-0.5">Primary Effect</p>
                      <p className="text-white/80">{c.primaryEffect}</p>
                    </div>
                    <div>
                      <p className="text-white/30 mb-0.5">Mechanism</p>
                      <p className="text-white/60">{c.mechanism}</p>
                    </div>
                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-white/30">{c.clinicalPhase}</span>
                      <Link to={`/resources/${c.slug}`} className="inline-flex items-center gap-1 text-white/60 hover:text-white transition-colors font-semibold">
                        Full article <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
                </FadeIn>
              );
            })}
          </div>

          {/* Detailed comparison table */}
          <FadeIn direction="up" delay={100}>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
            <div className="px-5 py-3 bg-white/[0.03] border-b border-white/[0.06]">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Full Receptor Profile Comparison</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Compound', 'GLP-1R', 'GIPR', 'GCGR', 'Half-life', 'Route', 'Max Weight Loss'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-white/30 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Retatrutide', 'Full agonist', 'Full agonist', 'Full agonist', '~6 days', 'SC weekly', '−24.2% (48 wk)'],
                    ['Tirzepatide', 'Full agonist', 'Full agonist', '—', '~5 days', 'SC weekly', '−20.9% (72 wk)'],
                    ['Semaglutide 2.4 mg', 'Full agonist', '—', '—', '~7 days', 'SC weekly', '−14.9% (68 wk)'],
                    ['Liraglutide 3 mg', 'Full agonist', '—', '—', '~13 h', 'SC daily', '−8.0% (56 wk)'],
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      {row.map((cell, j) => (
                        <td key={j} className={`px-4 py-3 ${j === 0 ? 'text-white font-semibold' : 'text-white/60'} whitespace-nowrap`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2.5 bg-white/[0.02] border-t border-white/[0.04]">
              <p className="text-white/20 text-[11px]">Sources: NEJM Jastreboff 2022, 2023; Frias et al. 2021; Davies et al. SCALE programme. All weight loss figures are mean at highest approved/studied dose vs placebo-controlled trials.</p>
            </div>
          </div>
          </FadeIn>

          <FadeIn direction="up" delay={50}>
          <div className="mt-4 text-right">
            <Link to="/resources/retatrutide-vs-tirzepatide-vs-semaglutide" className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm font-semibold transition-colors">
              Read full comparative analysis <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          </FadeIn>
        </section>

        {/* ── Section 2: Research Peptides ── */}
        <section id="peptides">
          <FadeIn direction="up">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                <FlaskConical className="w-4 h-4 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Research Peptides: Mechanism &amp; Evidence</h2>
            </div>
            <p className="text-[#5a7a9c] text-sm max-w-2xl">
              Mechanistic profiles and key preclinical findings for major research peptide categories.
            </p>
          </div>
          </FadeIn>

          <div className="space-y-3">
            {PEPTIDE_COMPOUNDS.map((p, idx) => {
              const isOpen = expandedRow === p.name;
              const cls = colorMap[p.color];
              const Icon = p.icon;
              return (
                <FadeIn key={p.name} delay={idx * 50} direction="up">
                <ExpandableRow
                  p={p}
                  isOpen={isOpen}
                  cls={cls}
                  Icon={Icon}
                  onToggle={() => setExpandedRow(isOpen ? null : p.name)}
                />
                </FadeIn>
              );
            })}
          </div>
        </section>

        {/* ── Section 3: NAD+ Biology ── */}
        <section id="nad">
          <FadeIn direction="up">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">NAD+ Biology: Cofactor, Precursors &amp; Ageing</h2>
            </div>
            <p className="text-[#5a7a9c] text-sm max-w-2xl">
              Comparative overview of NAD+ and its research-relevant precursor molecules — biosynthetic entry points and biological significance.
            </p>
          </div>
          </FadeIn>

          <FadeIn direction="up" delay={80}>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    {['Molecule', 'Role', 'Source / Entry Point', 'Pathway', 'Relevance to Ageing'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-white/30 font-semibold text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NAD_COMPOUNDS.map((row, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 font-bold text-amber-400 whitespace-nowrap">{row.name}</td>
                      <td className="px-5 py-4 text-white/70">{row.role}</td>
                      <td className="px-5 py-4 text-white/50">{row.source}</td>
                      <td className="px-5 py-4 text-white/50 max-w-xs">{row.pathway}</td>
                      <td className="px-5 py-4 text-white/50">{row.ageDecline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </FadeIn>

          {/* Sirtuin overview cards */}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { sirt: 'SIRT1', location: 'Nucleus/Cytoplasm', substrates: 'PGC-1α, FOXO1, NF-κB, p53', effect: 'Mitochondrial biogenesis, stress resistance, anti-inflammatory' },
              { sirt: 'SIRT3', location: 'Mitochondria', substrates: 'SDH, IDH2, MnSOD, ATP synthase', effect: 'TCA cycle activation, ROS reduction, OXPHOS efficiency' },
              { sirt: 'SIRT6', location: 'Nucleus', substrates: 'H3K9Ac, H3K56Ac, PARP1', effect: 'Genomic stability, telomere maintenance, DNA repair' },
            ].map((s, idx) => (
              <FadeIn key={s.sirt} delay={idx * 80} direction="up">
              <div className="rounded-xl bg-amber-500/[0.05] border border-amber-500/20 p-4 h-full">
                <p className="text-amber-400 font-black text-lg mb-1">{s.sirt}</p>
                <p className="text-white/30 text-xs mb-2">{s.location}</p>
                <p className="text-white/50 text-xs mb-2"><span className="text-white/25">Substrates: </span>{s.substrates}</p>
                <p className="text-white/60 text-xs leading-relaxed">{s.effect}</p>
              </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn direction="up" delay={50}>
          <div className="mt-4 text-right">
            <Link to="/resources/nad-nicotinamide-adenine-dinucleotide-research" className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-sm font-semibold transition-colors">
              Full NAD+ scientific review <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          </FadeIn>
        </section>

        {/* ── Key Studies ── */}
        <section>
          <FadeIn direction="up">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Key Published Studies</h2>
            </div>
          </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { year: 2023, authors: 'Jastreboff AM et al.', title: 'Tirzepatide Once Weekly for the Treatment of Obesity', journal: 'N Engl J Med', doi: '10.1056/NEJMoa2206038', compound: 'Tirzepatide', color: 'indigo' },
              { year: 2023, authors: 'Jastreboff AM et al.', title: 'Triple-Hormone-Receptor Agonist Retatrutide for Obesity', journal: 'N Engl J Med', doi: '10.1056/NEJMoa2301972', compound: 'Retatrutide', color: 'blue' },
              { year: 2021, authors: 'Reynolds JC et al.', title: 'MOTS-c is an exercise-induced mitochondrial-encoded regulator of age-dependent physical decline', journal: 'Nat Commun', doi: '10.1038/s41467-021-26459-2', compound: 'MOTS-C', color: 'amber' },
              { year: 2018, authors: 'Yoshino J et al.', title: 'NAD+ Intermediates: The Biology and Therapeutic Potential of NMN and NR', journal: 'Cell Metab', doi: '10.1016/j.cmet.2017.11.002', compound: 'NAD+', color: 'yellow' },
              { year: 2010, authors: 'Laroui H et al.', title: 'Treatment of colitis by a nanoparticle-based hydrogel carrying KPV peptide', journal: 'J Control Release', doi: '10.1016/j.jconrel.2010.07.111', compound: 'KPV', color: 'teal' },
              { year: 2016, authors: 'Clayton AH et al.', title: 'Bremelanotide for female sexual dysfunctions in premenopausal women', journal: 'Womens Health', doi: '10.2217/whe-2016-0050', compound: 'PT-141', color: 'pink' },
            ].map((study, i) => {
              const cls = colorMap[study.color] || colorMap['blue'];
              return (
                <FadeIn key={i} delay={i * 60} direction="up">
                <a
                  href={`https://doi.org/${study.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-4 p-4 rounded-2xl bg-[#0b1a30]/50 border border-white/[0.07] hover:border-blue-500/30 hover:bg-[#0d1f3c]/70 transition-all duration-200"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cls} flex items-center justify-center shrink-0 text-xs font-black`}>
                    {study.year.toString().slice(2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[11px] font-bold ${cls.split(' ')[3]}`}>{study.compound}</span>
                      <span className="text-white/20 text-[11px]">{study.authors}</span>
                    </div>
                    <p className="text-white/80 text-xs font-semibold leading-snug mb-1 group-hover:text-white transition-colors line-clamp-2">{study.title}</p>
                    <div className="flex items-center gap-1 text-[11px] text-white/25">
                      <span>{study.journal}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </div>
                  </div>
                </a>
                </FadeIn>
              );
            })}
          </div>
        </section>

        {/* ── CTA ── */}
        <FadeIn direction="up">
        <section className="rounded-3xl bg-gradient-to-br from-blue-600/10 via-indigo-600/[0.07] to-transparent border border-blue-500/20 p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-black text-white mb-4">Explore Individual Compound Articles</h2>
          <p className="text-[#6a90b8] max-w-xl mx-auto mb-8">
            Each compound has a dedicated long-form article covering molecular biology, preclinical data, research protocols, and key literature — written to laboratory standard.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/resources" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors shadow-[0_4px_20px_rgba(37,99,235,0.35)]">
              <BookOpen className="w-4 h-4" /> Browse All Articles
            </Link>
            <Link to="/products" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] text-white/80 font-bold text-sm transition-colors">
              <FlaskConical className="w-4 h-4" /> View Research Compounds
            </Link>
          </div>
        </section>
        </FadeIn>

      </div>
    </div>
  );
}
