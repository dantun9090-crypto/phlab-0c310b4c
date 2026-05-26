import { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FlaskConical, ShieldCheck, Truck, HeartHandshake,
  ArrowRight, CheckCircle2, Mail,
  Award, Zap, Globe, ChevronRight
} from 'lucide-react';
import { db, doc, getDoc } from '@/lib/firebase';
import { useSEO } from '@/hooks/useSEO';

const HERO_DEFAULT    = 'https://cdn.wegic.ai/assets/onepage/agent/images/1773693478805.jpg?imageMogr2/format/webp';
const MISSION_DEFAULT = 'https://cdn.wegic.ai/assets/onepage/agent/images/1773693499312.jpg?imageMogr2/format/webp';
const QUALITY_DEFAULT = 'https://cdn.wegic.ai/assets/onepage/agent/images/1773693499413.jpg?imageMogr2/format/webp';

/* ── Scroll-triggered fade ── */
function useScrollFade() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already in viewport on mount — show immediately
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0, rootMargin: '0px 0px 120px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function FadeIn({ children, delay = 0, direction = 'up', className = '' }: {
  children: React.ReactNode; delay?: number; direction?: 'up' | 'left' | 'right' | 'none'; className?: string;
}) {
  const { ref, visible } = useScrollFade();
  const t = { up: 'translateY(20px)', left: 'translateX(-16px)', right: 'translateX(16px)', none: 'none' };
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : t[direction],
      transition: `opacity 0.45s ease ${delay}ms, transform 0.45s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>{children}</div>
  );
}

const pillars = [
  {
    icon: FlaskConical,
    title: 'HPLC-Verified Purity',
    desc: 'Every compound in our catalogue is tested by HPLC before dispatch. Analytical results are documented and available on request for full traceability.',
    gradient: 'from-blue-600/20 to-blue-800/5',
    border: 'border-blue-500/25',
    iconBg: 'bg-blue-600/20',
    iconColor: 'text-blue-400',
    glow: 'rgba(37,99,235,0.15)',
  },
  {
    icon: ShieldCheck,
    title: 'CoA on Request',
    desc: 'We provide full HPLC analytical data for every batch we dispatch. Results are documented — contact us with your order reference to obtain your report.',
    gradient: 'from-emerald-600/20 to-emerald-800/5',
    border: 'border-emerald-500/25',
    iconBg: 'bg-emerald-600/20',
    iconColor: 'text-emerald-400',
    glow: 'rgba(16,185,129,0.15)',
  },
  {
    icon: Truck,
    title: 'Fast UK Shipping',
    desc: 'Fully UK-based operations mean no customs delays or international fees. Orders dispatched promptly with discreet, thermally-sealed packaging.',
    gradient: 'from-cyan-600/20 to-cyan-800/5',
    border: 'border-cyan-500/25',
    iconBg: 'bg-cyan-600/20',
    iconColor: 'text-cyan-400',
    glow: 'rgba(6,182,212,0.15)',
  },
  {
    icon: HeartHandshake,
    title: 'Dedicated Support',
    desc: 'Our knowledgeable team is always on hand to assist with product queries, orders, and research guidance. Every enquiry treated with care and expertise.',
    gradient: 'from-amber-600/20 to-amber-800/5',
    border: 'border-amber-500/25',
    iconBg: 'bg-amber-600/20',
    iconColor: 'text-amber-400',
    glow: 'rgba(245,158,11,0.15)',
  },
];

const standards = [
  'HPLC purity testing on every batch before dispatch',
  'Analytical results documented and available on request',
  'Thermally sealed bags for compound integrity',
  'Tamper-evident, discreet packaging on every order',
  'Full compliance with UK research-chemical regulations',
  'UK-based operations — no import delays',
];

const stats = [
  { value: 'HPLC', label: 'Purity testing', icon: FlaskConical },
  { value: '100%', label: 'Batches documented', icon: ShieldCheck },
  { value: 'UK', label: 'Based operations', icon: Globe },
  { value: 'Fast', label: 'Dispatch & delivery', icon: Zap },
];

const team = [
  { initials: 'JM', name: 'James Mitchell', role: 'Founder & Head of Procurement', gradient: 'from-blue-600 to-blue-800' },
  { initials: 'SK', name: 'Sarah Keane', role: 'Quality Assurance Lead', gradient: 'from-emerald-600 to-emerald-800' },
  { initials: 'RP', name: 'Ryan Patel', role: 'Customer Experience Manager', gradient: 'from-cyan-600 to-cyan-800' },
];

export default function AboutPage() {
  const [heroImg, setHeroImg]       = useState(HERO_DEFAULT);
  const [missionImg, setMissionImg] = useState(MISSION_DEFAULT);
  const [qualityImg, setQualityImg] = useState(QUALITY_DEFAULT);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], [0, 90]);

  useSEO('about', {
    title: 'About PH Labs | UK Research Supplier',
    metaDescription: 'Learn about PH Labs — UK-based supplier of HPLC-verified research peptides. Batch-tested, third-party certified, shipped from the UK.',
    canonical: 'https://www.prohealthpeptides.co.uk/about',
  });

  useEffect(() => {
    getDoc(doc(db, 'settings', 'siteSettings')).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.aboutHeroImage)    setHeroImg(d.aboutHeroImage);
      if (d.aboutMissionImage) setMissionImg(d.aboutMissionImage);
      if (d.aboutQualityImage) setQualityImg(d.aboutQualityImage);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#060f1e] text-white overflow-x-hidden">

      {/* ── HERO ── */}
      <section ref={heroRef} className="page-hero relative min-h-[680px] md:min-h-[780px] overflow-hidden flex items-end hero-scanline">
        {/* Parallax image */}
        <motion.div className="absolute inset-0" style={{ y: heroY }}>
          <img
            src={heroImg}
            alt="PH Labs laboratory"
            className="w-full h-full object-cover object-center scale-110"
            loading="eager"
          />
        </motion.div>

        {/* Multi-layer overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060f1e] via-[#060f1e]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060f1e]/80 via-transparent to-transparent" />

        {/* Grid texture */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(96,165,250,1) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="hero-top-shimmer pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pb-16 w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px w-10 bg-blue-400/60" />
              <span className="text-blue-400 text-xs font-bold uppercase tracking-[0.25em]">About Us</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6 max-w-3xl">
              <span className="text-[#f0f6ff]">Science-Led.</span>
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                Quality-Driven.
              </span>
            </h1>

            <p className="text-[#8aabcf] text-lg md:text-xl max-w-2xl leading-relaxed mb-10">
              PH Labs is a UK-based research compound supplier committed to analytical excellence.
              Every batch HPLC-tested. Every result documented.
            </p>

            {/* CTA row */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/products"
                className="group inline-flex items-center gap-2.5 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl transition-all duration-300 shadow-[0_4px_24px_rgba(37,99,235,0.4)] hover:shadow-[0_4px_32px_rgba(37,99,235,0.6)] hover:-translate-y-0.5"
              >
                View Catalogue
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.12] text-[#e8f0fe] font-semibold rounded-2xl transition-all duration-300"
              >
                <Mail className="w-4 h-4" />
                Get in Touch
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#060f1e] to-transparent" />
      </section>

      {/* ── STATS STRIP ── */}
      <section className="relative border-y border-white/[0.06] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-transparent to-blue-600/5" />
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.06]">
            {stats.map((s, i) => (
              <FadeIn key={s.label} delay={i * 80} direction="up">
                <div className="py-10 px-6 lg:px-10 text-center group">
                  <s.icon className="w-5 h-5 text-blue-400/60 mx-auto mb-3 group-hover:text-blue-400 transition-colors" />
                  <div className="text-2xl md:text-3xl font-bold text-[#f0f6ff] mb-1">{s.value}</div>
                  <div className="text-[#9cb8d9] text-xs uppercase tracking-wider font-medium">{s.label}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <FadeIn direction="left">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-px w-8 bg-blue-400/50" />
                <span className="text-blue-400 text-xs font-bold uppercase tracking-[0.2em]">Our Mission</span>
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#f0f6ff] leading-tight">
                Raising the Standard for<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Research Compounds</span>
              </h2>
              <p className="text-[#8aabcf] text-base md:text-lg leading-relaxed">
                We founded PH Labs with a single conviction: researchers deserve suppliers
                they can fully trust. That means HPLC analytical data for every batch, clear labelling,
                and support from people who actually understand the science.
              </p>
              <p className="text-[#9cb8d9] leading-relaxed">
                All compounds are sourced from accredited manufacturers, tested for identity and purity
                before dispatch, and shipped from the UK with no import complications.
              </p>

              {/* Inline badges */}
              <div className="flex flex-wrap gap-3 pt-2">
                {['UK Registered Company', 'HPLC Analytical Data', 'Discreet Packaging'].map(b => (
                  <span key={b} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600/10 border border-blue-500/20 rounded-full text-blue-300 text-xs font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Image */}
          <FadeIn direction="right" delay={120}>
            <div className="relative">
              <div className="rounded-3xl overflow-hidden border border-white/[0.08] shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
                <img
                  src={missionImg}
                  alt="Research laboratory"
                  width="800"
                  height="520"
                  className="w-full h-[400px] lg:h-[520px] object-cover object-center"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060f1e]/40 to-transparent" />
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-6 -left-4 md:-left-8 bg-[#0b1a30]/90 border border-blue-500/30 rounded-2xl px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                  <span className="text-[#e8f0fe] text-sm font-semibold">HPLC data on file for every batch</span>
                </div>
              </div>
              {/* Corner accent */}
              <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-blue-600/20 pointer-events-none" />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── PILLARS ── */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#04101f]/80 to-transparent" />
        <div className="absolute inset-y-0 left-0 right-0 border-y border-white/[0.04]" />

        <div className="relative max-w-6xl mx-auto px-6 lg:px-10">
          <FadeIn direction="up" className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-8 bg-blue-400/50" />
              <span className="text-blue-400 text-xs font-bold uppercase tracking-[0.2em]">Our Pillars</span>
              <div className="h-px w-8 bg-blue-400/50" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-4">
              Built on Four Commitments
            </h2>
            <p className="text-[#9cb8d9] max-w-xl mx-auto">
              Every decision we make returns to the same foundation: quality, transparency, reliability, and care.
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {pillars.map((p, i) => (
              <FadeIn key={p.title} delay={i * 80} direction="up">
                <div
                  className={`h-full group relative bg-gradient-to-br ${p.gradient} border ${p.border} rounded-2xl p-6 hover:border-opacity-60 transition-all duration-500 overflow-hidden cursor-default`}
                  style={{ boxShadow: `0 0 0 0 ${p.glow}` }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 40px ${p.glow}`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 0 transparent'; }}
                >
                  {/* Corner glow */}
                  <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${p.iconBg}`} />

                  <div className={`relative w-11 h-11 rounded-xl ${p.iconBg} flex items-center justify-center mb-5 border ${p.border}`}>
                    <p.icon className={`w-5 h-5 ${p.iconColor}`} />
                  </div>
                  <h3 className="text-[#e8f0fe] font-bold text-base mb-3 leading-snug">{p.title}</h3>
                  <p className="text-[#9cb8d9] text-sm leading-relaxed">{p.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUALITY STANDARDS ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Image */}
          <FadeIn direction="left" className="relative order-2 lg:order-1">
            <div className="rounded-3xl overflow-hidden border border-white/[0.08] shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
              <img
                src={qualityImg}
                alt="Premium peptide vials"
                width="800"
                height="520"
                className="w-full h-[400px] lg:h-[520px] object-cover object-center"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#060f1e]/30 to-transparent" />
            </div>
            <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-blue-600/20 pointer-events-none" />
            <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-emerald-600/15 pointer-events-none" />
          </FadeIn>

          {/* Text */}
          <FadeIn direction="right" delay={120} className="order-1 lg:order-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-emerald-400/50" />
              <span className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em]">Quality Standards</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] leading-tight">
              Every Batch. Every Detail.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-300">No Exceptions.</span>
            </h2>
            <p className="text-[#8aabcf] leading-relaxed">
              Our QA process is non-negotiable. From sourcing through dispatch, every compound passes
              strict criteria before it ever reaches a researcher.
            </p>

            <ul className="space-y-3 pt-2">
              {standards.map((s, i) => (
                <FadeIn key={s} delay={i * 60} direction="left">
                  <li className="flex items-start gap-3 group">
                    <div className="w-5 h-5 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-600/30 transition-colors">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    </div>
                    <span className="text-[#8aabcf] text-sm leading-relaxed">{s}</span>
                  </li>
                </FadeIn>
              ))}
            </ul>

            <FadeIn delay={400}>
              <Link
                to="/quality-control"
                className="group inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-semibold text-sm transition-colors mt-2"
              >
                View full quality policy
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </FadeIn>
          </FadeIn>
        </div>
      </section>

      {/* ── TEAM ── */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-600/[0.03] to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <FadeIn direction="up" className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="h-px w-8 bg-blue-400/50" />
              <span className="text-blue-400 text-xs font-bold uppercase tracking-[0.2em]">The Team</span>
              <div className="h-px w-8 bg-blue-400/50" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-4">
              People Behind the Science
            </h2>
            <p className="text-[#9cb8d9] max-w-xl mx-auto">
              A dedicated team with backgrounds in biochemistry, pharmaceutical supply, and customer experience.
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-3 gap-6">
            {team.map((m, i) => (
              <FadeIn key={m.name} delay={i * 100} direction="up">
                <div className="group relative bg-[#0b1a30]/60 border border-white/[0.07] rounded-2xl p-8 hover:border-blue-500/25 hover:bg-[#0d1e35]/80 transition-all duration-400 text-center overflow-hidden">
                  {/* Hover glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-blue-600/15 pointer-events-none" />

                  {/* Avatar */}
                  <div className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${m.gradient} flex items-center justify-center text-xl font-bold text-white mx-auto mb-5 shadow-lg`}>
                    {m.initials}
                    <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10" />
                  </div>

                  <h3 className="text-[#e8f0fe] font-bold text-base mb-1">{m.name}</h3>
                  <p className="text-[#9cb8d9] text-sm">{m.role}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-24">
        <FadeIn direction="up">
          <div className="relative rounded-3xl overflow-hidden border border-blue-500/20 bg-gradient-to-br from-[#0d1f3c] via-[#091628] to-[#060f1e]">
            {/* Glow spots */}
            <div className="absolute top-0 left-1/4 w-72 h-72 rounded-full bg-blue-600/15 pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 rounded-full bg-cyan-600/10 pointer-events-none" />

            <div className="relative px-8 md:px-14 py-14 md:py-16 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span className="text-amber-400 text-xs font-bold uppercase tracking-[0.2em]">Ready to Research?</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-[#f0f6ff] mb-3">
                  Explore Our Full Compound Catalogue
                </h2>
                <p className="text-[#9cb8d9] max-w-md">
                  GLP-1 agonists, peptides, NAD+ precursors and more — all HPLC-tested, UK-dispatched.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Link
                  to="/products"
                  className="group inline-flex items-center gap-2.5 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all duration-300 shadow-[0_4px_24px_rgba(37,99,235,0.4)] hover:shadow-[0_4px_32px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 whitespace-nowrap"
                >
                  <FlaskConical className="w-4 h-4" />
                  Browse Catalogue
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-[#e8f0fe] font-semibold rounded-2xl transition-all duration-300 whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" />
                  Contact Team
                </Link>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

    </div>
  );
}
