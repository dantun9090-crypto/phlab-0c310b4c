import { useEffect, useState, type FormEvent } from "react";
import { LandingPromoStrip } from "@/components/LandingPromoStrip";
import { LandingTrustStrip } from "@/components/LandingTrustStrip";

/* ───── Luxury background assets ───── */
const HERO_IMG = "/og/luxury/hero.jpg";
const MOLECULAR_IMG = "/og/luxury/molecular.jpg";
const DETAIL_IMG = "/og/luxury/detail.jpg";

/**
 * /compound — Ultra-premium Full Gold Premium landing.
 * Ads-policy compliant. No peptide names. Research-use-only.
 */
export function PremiumLanding({ eyebrow }: { eyebrow?: string }) {
  const [form, setForm] = useState({
    name: "",
    institution: "",
    email: "",
    message: "",
    consent: false,
  });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.consent) {
      setStatus("error");
      setErrorMsg("Please confirm the GDPR consent to proceed.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/public/send-mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "contact",
          name: form.name,
          email: form.email,
          subject: `Research Documentation Request — ${form.institution || "Independent Researcher"}`,
          message:
            `Institution: ${form.institution || "—"}\n\n` +
            `${form.message || "(No additional message provided.)"}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setStatus("ok");
      setForm({ name: "", institution: "", email: "", message: "", consent: false });
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? `We couldn't send your request: ${err.message}. Please email info@phlabs.co.uk directly.`
          : "We couldn't send your request. Please email info@phlabs.co.uk directly.",
      );
    }
  }

  return (
    <main data-source="premium-landing" data-route="/compound" className="min-h-screen bg-[#060b18] text-white antialiased selection:bg-[#c9a44c] selection:text-[#060b18] scroll-smooth">
      <PremiumLandingGuard />
      <LandingPromoStrip theme="dark" />
      <LandingTrustStrip theme="dark" />



      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes luxFadeUp { 0% { opacity:0; transform:translateY(40px); filter:blur(10px);} 100% { opacity:1; transform:translateY(0); filter:blur(0);} }
        @keyframes luxLine { 0% { transform:scaleX(0);} 100% { transform:scaleX(1);} }
        @keyframes luxFade { 0% { opacity:0;} 100% { opacity:1;} }
        @keyframes luxFloat { 0%,100% { transform:translateY(0);} 50% { transform:translateY(-10px);} }
        @keyframes luxMarquee { 0% { transform:translateX(0);} 100% { transform:translateX(-50%);} }
        @keyframes luxKen { 0% { transform:scale(1.08);} 100% { transform:scale(1.18);} }
        @keyframes luxShimmer { 0% { background-position:-200% center;} 100% { background-position:200% center;} }
        .lux-fade-up { opacity:0; animation: luxFadeUp 1.2s cubic-bezier(.22,.7,.2,1) forwards; }
        .lux-line { transform-origin:left; animation: luxLine 1.4s cubic-bezier(.65,.2,.2,1) forwards; }
        .lux-fade { opacity:0; animation: luxFade 1.6s ease forwards; }
        .lux-float { animation: luxFloat 7s ease-in-out infinite; }
        .lux-marquee { animation: luxMarquee 48s linear infinite; will-change: transform; }
        .lux-ken { animation: luxKen 26s ease-in-out infinite alternate; }
        .lux-shimmer { background: linear-gradient(90deg, transparent 0%, rgba(201,164,76,0.08) 50%, transparent 100%); background-size: 200% 100%; animation: luxShimmer 6s ease-in-out infinite; }
        .d1{animation-delay:.15s} .d2{animation-delay:.3s} .d3{animation-delay:.5s}
        .d4{animation-delay:.7s} .d5{animation-delay:.9s} .d6{animation-delay:1.1s} .d7{animation-delay:1.3s}
        .gold-text{color:#c9a44c}.gold-bg{background-color:#c9a44c}.gold-border{border-color:#c9a44c}
        .gold-gradient{background: linear-gradient(135deg, #c9a44c 0%, #e8d5a3 50%, #c9a44c 100%);}
        .display{font-family:'Cormorant Garamond','Times New Roman',serif}
        section[id]{scroll-margin-top:80px}
        @media (max-width: 767px) {
          .lux-ken, .lux-float, .lux-shimmer, .lux-marquee { animation: none !important; }
          .lux-shimmer { display: none !important; }
          .mobile-no-blur { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lux-fade-up, .lux-line, .lux-fade, .lux-float, .lux-marquee, .lux-ken, .lux-shimmer { animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important; }
        }
      `}</style>

      {/* ── TOP BAR ── */}
      <div className="mobile-no-blur border-b border-white/10 bg-[#060b18]/95 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5 text-[10.5px] uppercase tracking-[0.35em] text-white/60">
          <span className="lux-fade d1 flex items-center gap-2.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full gold-bg" />
            PH Labs · United Kingdom
          </span>
          <span className="lux-fade d2 hidden md:inline gold-text font-medium tracking-[0.3em]">
            For Research Use Only · Not for Human Consumption
          </span>
          <span className="lux-fade d3">EST. {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden min-h-[85vh] sm:min-h-[92vh] lg:min-h-[96vh] flex items-center">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={HERO_IMG}
            alt=""
            aria-hidden="true"
            width={1920}
            height={1080}
            fetchPriority="high"
            decoding="async"
            className="lux-ken absolute inset-0 h-full w-full object-cover"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#060b18]/90 via-[#060b18]/60 to-[#060b18]" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#060b18]/85 via-transparent to-[#060b18]/70" />
          <div aria-hidden="true" className="absolute inset-0 lux-shimmer" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-28 lg:py-36 text-center w-full">
          {eyebrow ? (
            <div className="lux-fade-up d1 mb-12 inline-flex items-center gap-4 text-[11px] uppercase tracking-[0.45em] text-white/60">
              <span className="lux-line block h-px w-14 gold-bg" />
              {eyebrow}
              <span className="lux-line block h-px w-14 gold-bg" />
            </div>
          ) : null}

          <h1 className="display font-light tracking-tight text-white text-[2.8rem] leading-[1.02] sm:text-[4.2rem] md:text-[5.5rem] lg:text-[6.5rem]">
            <span className="block lux-fade-up d2">Premium Research</span>
            <span className="block lux-fade-up d3">Compounds for</span>
            <span className="block lux-fade-up d4 italic gold-text">Scientific Laboratories</span>
          </h1>

          <div className="mx-auto mt-8 h-px w-20 gold-bg lux-line d3" />

          <p className="lux-fade-up d5 mx-auto mt-10 max-w-2xl text-base sm:text-lg font-light leading-[1.7] text-white/70">
            High-purity research materials prepared under controlled UK laboratory
            conditions for professional scientific applications.
          </p>

          <div className="lux-fade-up d6 mt-14 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#request-form"
              className="group inline-flex items-center justify-center px-10 py-4 rounded-full gold-bg text-[#060b18] text-[12px] tracking-[0.2em] uppercase font-semibold transition-all hover:brightness-110 hover:scale-[1.02] shadow-[0_24px_60px_-20px_rgba(201,164,76,0.55)]"
            >
              Request Research Documentation
              <span className="ml-3 transition-transform group-hover:translate-x-1.5">→</span>
            </a>
            <a
              href="#standards"
              className="inline-flex items-center justify-center px-10 py-4 rounded-full border gold-border text-white text-[12px] tracking-[0.2em] uppercase font-medium transition-all hover:bg-white/[0.04] hover:border-[#c9a44c]/60"
            >
              Our Standards
            </a>
          </div>

          {/* Spec card */}
          <div className="lux-fade d6 lux-float mt-24 mx-auto max-w-lg rounded-2xl border border-white/[0.12] bg-white/[0.03] mobile-no-blur backdrop-blur-md px-10 py-7 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.7)]">
            <dl className="grid grid-cols-3 gap-6 text-center">
              {[
                { k: "UK", v: "Dispatched" },
                { k: "QC", v: "Verified" },
                { k: "Docs", v: "Per batch" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="display text-[1.75rem] sm:text-3xl font-light text-white">{s.k}</dt>
                  <dd className="mt-1.5 text-[10px] uppercase tracking-[0.3em] gold-text">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── PROMINENT NOTICE BANNER ── */}
      <a
        href="#disclaimer"
        className="block border-y gold-border bg-[#c9a44c]/[0.07] hover:bg-[#c9a44c]/[0.11] transition-colors"
      >
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 text-center">
          <span className="inline-flex items-center gap-2.5 text-[10px] uppercase tracking-[0.4em] gold-text font-semibold">
            <span className="inline-block h-1.5 w-1.5 rounded-full gold-bg" />
            Important Notice
          </span>
          <span className="text-sm sm:text-base text-white/85 font-light">
            All products are intended strictly for laboratory and scientific research use only.
            <span className="gold-text font-medium"> Not for human consumption.</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/50 underline underline-offset-4 hover:text-white/80 transition-colors">
            Read full disclaimer →
          </span>
        </div>
      </a>

      {/* ── MARQUEE ── */}
      <section className="border-b border-white/10 bg-[#080e1f] overflow-hidden">
        <div className="lux-marquee flex whitespace-nowrap py-7 text-[11px] uppercase tracking-[0.55em] text-white/50">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex shrink-0 items-center gap-14 pr-14">
              <span>Premium Research Materials</span><span className="gold-text text-lg">◆</span>
              <span>United Kingdom Laboratory</span><span className="gold-text text-lg">◆</span>
              <span>Verified Purity Standards</span><span className="gold-text text-lg">◆</span>
              <span>Per-Batch Documentation</span><span className="gold-text text-lg">◆</span>
              <span>Controlled Conditions</span><span className="gold-text text-lg">◆</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── OUR STANDARDS ── */}
      <section id="standards" className="relative border-b border-white/10 py-28 sm:py-36 lg:py-44">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.55em] gold-text">§ 01 — Our Standards</p>
            <h2 className="mt-6 display text-[2.6rem] sm:text-5xl md:text-[3.5rem] font-light text-white leading-[1.1]">
              Built on rigour and provenance
            </h2>
            <div className="mx-auto mt-8 h-px w-16 gold-bg" />
          </div>

          <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.08] border border-white/[0.08] rounded-2xl overflow-hidden">
            {[
              { k: "01", t: "United Kingdom Laboratory", d: "Prepared, stored and dispatched from UK laboratory facilities." },
              { k: "02", t: "Verified Purity Standards", d: "Evaluated against rigorous quality benchmarks for research compounds." },
              { k: "03", t: "Per-Batch Documentation", d: "Detailed analytical records accompany every batch shipped." },
              { k: "04", t: "Controlled Conditions", d: "Materials handled and stored under controlled laboratory conditions." },
            ].map((c) => (
              <article key={c.k} className="bg-[#060b18] p-10 lg:p-12 transition-colors hover:bg-[#080e1f] group">
                <div className="font-mono text-xs tracking-[0.3em] gold-text opacity-70 group-hover:opacity-100 transition-opacity">{c.k}</div>
                <h3 className="mt-7 display text-[1.35rem] font-light text-white leading-snug">{c.t}</h3>
                <p className="mt-5 text-sm leading-[1.75] text-white/60">{c.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT WE OFFER ── */}
      <section id="offer" className="relative border-b border-white/10 py-28 sm:py-36 lg:py-44 overflow-hidden">
        <img
          src={MOLECULAR_IMG}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#060b18] via-[#060b18]/88 to-[#060b18]" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.55em] gold-text">§ 02 — What We Offer</p>
          <h2 className="mt-6 display text-[2.6rem] sm:text-5xl md:text-[3.5rem] font-light text-white leading-[1.1]">
            Premium-grade research compounds
          </h2>
          <div className="mx-auto mt-8 h-px w-16 gold-bg" />
          <p className="mt-12 mx-auto max-w-2xl text-base sm:text-lg font-light leading-[1.75] text-white/75">
            We provide premium-grade research compounds intended strictly for laboratory
            research, analytical studies, and scientific applications. All materials are
            supplied with detailed analytical documentation to support high-quality and
            reproducible scientific work.
          </p>
        </div>
      </section>

      {/* ── WHY PH LABS — premium trust pillars ── */}
      <section id="why-ph-labs" className="relative border-b border-white/10 py-28 sm:py-36 lg:py-44 overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(201,164,76,0.10),transparent_55%),radial-gradient(circle_at_85%_85%,rgba(201,164,76,0.08),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.55em] gold-text">§ 02·B — Why PH Labs</p>
            <h2 className="mt-6 display text-[2.4rem] sm:text-[3rem] md:text-[3.5rem] font-light text-white leading-[1.1]">
              Four pillars that <span className="italic gold-text">define our work</span>
            </h2>
            <div className="mx-auto mt-8 h-px w-16 gold-bg" />
          </div>

          <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { n: '01', t: 'UK Laboratory', d: 'Controlled, temperature-monitored facility based in the United Kingdom.', sym: '⌬' },
              { n: '02', t: 'Per-Batch COA', d: 'Independent HPLC analysis attached to every consignment we dispatch.', sym: '✓' },
              { n: '03', t: 'Cold-Chain Logistics', d: 'Insulated, tracked dispatch designed for sensitive research materials.', sym: '❄' },
              { n: '04', t: 'Discreet Handling', d: 'Confidential laboratory packaging — never branded externally.', sym: '◈' },
            ].map((p) => (
              <article
                key={p.n}
                className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-7 transition-all hover:border-[#c9a44c]/40 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(201,164,76,0.45)]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.4em] gold-text opacity-80">{p.n}</span>
                  <span aria-hidden className="text-2xl gold-text">{p.sym}</span>
                </div>
                <h3 className="mt-6 display text-[1.25rem] font-light text-white leading-snug">{p.t}</h3>
                <p className="mt-3 text-sm leading-[1.7] text-white/65">{p.d}</p>
                <div aria-hidden className="mt-6 h-px w-10 gold-bg opacity-70" />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUALITY CONTROL TIMELINE ── */}
      <section id="qc-timeline" className="relative border-b border-white/10 py-28 sm:py-36 lg:py-44 bg-[#070d1c] overflow-hidden">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.55em] gold-text">§ 02·C — Quality Control</p>
            <h2 className="mt-6 display text-[2.4rem] sm:text-[3rem] md:text-[3.5rem] font-light text-white leading-[1.1]">
              From synthesis to <span className="italic gold-text">your laboratory</span>
            </h2>
            <div className="mx-auto mt-8 h-px w-16 gold-bg" />
            <p className="mx-auto mt-8 max-w-2xl text-sm sm:text-base text-white/65 font-light leading-[1.8]">
              A five-stage workflow that every consignment passes through before it is released.
            </p>
          </div>

          <ol className="mt-20 relative grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-3">
            <div aria-hidden className="hidden md:block absolute left-0 right-0 top-[26px] h-px bg-gradient-to-r from-transparent via-[#c9a44c]/40 to-transparent" />
            {[
              { k: '01', t: 'Synthesis', d: 'Reagent-grade precursors under controlled conditions.' },
              { k: '02', t: 'Purification', d: 'Reverse-phase chromatography to research-grade purity.' },
              { k: '03', t: 'HPLC Verification', d: 'Independent third-party analytical assay.' },
              { k: '04', t: 'Lyophilisation', d: 'Sterile fill, freeze-dry & sealed under inert atmosphere.' },
              { k: '05', t: 'Cold Dispatch', d: 'Insulated, tracked delivery with batch COA enclosed.' },
            ].map((s) => (
              <li key={s.k} className="relative flex flex-col items-center text-center">
                <span className="relative z-10 inline-flex items-center justify-center w-[52px] h-[52px] rounded-full border gold-border bg-[#060b18] font-mono text-xs tracking-[0.2em] gold-text">
                  {s.k}
                </span>
                <h3 className="mt-5 display text-[1.05rem] font-light text-white">{s.t}</h3>
                <p className="mt-2 text-xs leading-[1.7] text-white/55 max-w-[180px]">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>



      {/* ── INTENDED USE ── */}
      <section id="intended-use" className="relative overflow-hidden border-b border-white/10 py-32 sm:py-44 lg:py-52">
        <img
          src={DETAIL_IMG}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          width={1920}
          height={1200}
          className="lux-ken absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#060b18]/85 via-[#060b18]/70 to-[#060b18]" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.55em] gold-text">§ 03 — Intended Use</p>
          <blockquote className="mt-12 display text-2xl sm:text-3xl md:text-[2.75rem] font-light leading-[1.35] text-white">
            <span className="gold-text text-5xl leading-none">“</span>
            All products are intended exclusively for laboratory and scientific
            research purposes. They are not intended for human use or for any
            non-research application.
            <span className="gold-text text-5xl leading-none">”</span>
          </blockquote>
          <div className="mx-auto mt-12 h-px w-16 gold-bg" />
          <p className="mt-7 text-[11px] uppercase tracking-[0.45em] text-white/50">PH Labs · Research Standard</p>
        </div>
      </section>

      {/* ── REQUEST DOCUMENTATION FORM ── */}
      <section id="request-form" className="border-b border-white/10 py-28 sm:py-36 lg:py-44 bg-[#080e1f]">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.55em] gold-text">§ 04 — Request Documentation</p>
            <h2 className="mt-6 display text-[2.6rem] sm:text-5xl md:text-[3.5rem] font-light text-white leading-[1.1]">
              Documentation for qualified researchers
            </h2>
            <div className="mx-auto mt-8 h-px w-16 gold-bg" />
            <p className="mt-10 mx-auto max-w-2xl text-base font-light leading-[1.75] text-white/70">
              Qualified researchers and institutions may request detailed
              documentation for our premium laboratory research materials.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="mt-14 rounded-2xl border border-white/[0.09] bg-[#060b18] p-8 sm:p-12 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)] space-y-7"
            noValidate
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
              <label className="block">
                <span className="block text-[11px] uppercase tracking-[0.3em] gold-text mb-2.5">Full Name *</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full min-h-[52px] rounded-lg border-2 border-slate-600 bg-slate-800 px-4 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors"
                  placeholder="Dr. Jane Smith"
                  maxLength={120}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-[0.3em] gold-text mb-2.5">Institution / Company *</span>
                <input
                  type="text"
                  required
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  className="w-full min-h-[52px] rounded-lg border-2 border-slate-600 bg-slate-800 px-4 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors"
                  placeholder="University / Laboratory"
                  maxLength={200}
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.3em] gold-text mb-2.5">Email *</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full min-h-[52px] rounded-lg border-2 border-slate-600 bg-slate-800 px-4 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors"
                placeholder="researcher@institution.ac.uk"
                maxLength={320}
              />
            </label>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.3em] gold-text mb-2.5">Message (optional)</span>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={5}
                className="w-full rounded-lg border-2 border-slate-600 bg-slate-800 px-4 py-3.5 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors resize-y"
                placeholder="Briefly describe your research enquiry."
                maxLength={2000}
              />
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                className="mt-1 h-5 w-5 rounded border-2 border-slate-600 bg-slate-800 accent-[#c9a44c] flex-shrink-0"
                required
              />
              <span className="text-sm text-white/70 leading-[1.7]">
                I consent to PH Labs processing my details to respond to this
                enquiry, in accordance with the{" "}
                <a href="/privacy-policy" className="gold-text underline underline-offset-4 hover:brightness-125">
                  Privacy Policy
                </a>
                . I confirm I am a qualified researcher and understand these
                materials are for research use only.
              </span>
            </label>

            <div className="pt-3">
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full sm:w-auto inline-flex items-center justify-center px-12 py-4 rounded-full gold-bg text-[#060b18] text-[12px] tracking-[0.2em] uppercase font-semibold transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_24px_60px_-20px_rgba(201,164,76,0.55)]"
              >
                {status === "sending" ? "Sending…" : "Submit Request"}
                {status !== "sending" && <span className="ml-3">→</span>}
              </button>
            </div>

            {status === "ok" && (
              <p
                role="status"
                className="text-sm text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 rounded-lg px-5 py-4"
              >
                Thank you — your request has been received. Our team will
                respond by email shortly.
              </p>
            )}
            {status === "error" && (
              <p
                role="alert"
                className="text-sm text-rose-200 border border-rose-500/40 bg-rose-500/10 rounded-lg px-5 py-4"
              >
                {errorMsg}
              </p>
            )}
          </form>
        </div>
      </section>

      {/* ── LEGAL DISCLAIMER ── */}
      <section id="disclaimer" className="py-24 sm:py-32 bg-[#060b18]">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="border-t gold-border pt-14">
            <p className="text-[11px] uppercase tracking-[0.55em] gold-text">Legal</p>

            {/* Short Important Notice */}
            <div className="mt-8 mx-auto max-w-2xl rounded-xl border gold-border bg-[#c9a44c]/[0.07] px-7 py-6 text-left">
              <p className="text-[10px] uppercase tracking-[0.4em] gold-text font-semibold">Important Notice</p>
              <p className="mt-4 text-sm sm:text-base leading-[1.7] text-white/90">
                All products supplied by PH Labs are intended strictly for
                laboratory and scientific research use only.{" "}
                <span className="gold-text font-medium">Not for human use</span>{" "}
                or for any non-research application.
              </p>
            </div>

            <h2 className="mt-14 display text-[1.75rem] sm:text-[2rem] font-light text-white">Legal Disclaimer</h2>
            <p className="mt-8 text-sm sm:text-[15px] leading-[1.8] text-white/65">
              All products offered on this website are intended solely for
              laboratory research and scientific purposes. They are not
              intended for human use or for any non-research application.
              Products are sold exclusively to qualified
              researchers, scientific professionals, academic institutions and
              commercial laboratories. By accessing this website or purchasing
              any product, you confirm that you are a qualified researcher or
              authorised institution and that you will comply with all
              applicable laws and regulations regarding the handling, storage
              and use of research materials. Misuse of these products may be
              dangerous and unlawful. To the maximum extent permitted by law,
              PH Labs accepts no liability for any loss, damage, injury or
              claim arising from any use of these products outside of
              controlled laboratory research settings.
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/"
                className="inline-flex items-center justify-center px-9 py-3.5 rounded-full border border-white/20 text-white/80 text-[11px] tracking-[0.2em] uppercase hover:bg-white/5 transition-all"
              >
                ← Back to homepage
              </a>
              <a
                href="/terms-and-conditions"
                className="inline-flex items-center justify-center px-9 py-3.5 rounded-full border border-white/20 text-white/80 text-[11px] tracking-[0.2em] uppercase hover:bg-white/5 transition-all"
              >
                Terms of Service
              </a>
              <a
                href="/contact"
                className="inline-flex items-center justify-center px-9 py-3.5 rounded-full border border-white/20 text-white/80 text-[11px] tracking-[0.2em] uppercase hover:bg-white/5 transition-all"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/10 py-12 bg-[#060b18]">
        <div className="mx-auto max-w-7xl px-6 flex flex-col items-center justify-center gap-3 text-[11px] uppercase tracking-[0.35em] text-white/50 text-center">
          <span>© {new Date().getFullYear()} PH Labs · United Kingdom</span>
          <span className="gold-text font-medium">For Research Use Only · Not for Human Consumption</span>
        </div>
      </footer>
    </main>
  );
}

/**
 * Overlay/regression guard for /compound.
 *
 * The /compound URL must render ONLY <PremiumLanding>. If a future change
 * accidentally re-mounts the legacy article page (data-source="legacy-research-page"),
 * an Ads-landing variant, or a shop product card on top of it, beacon details
 * to /api/public/error-monitor so it surfaces in Admin → Research Incidents.
 */
function PremiumLandingGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/compound") return;
    const t = setTimeout(() => {
      const root = document.querySelector('[data-source="premium-landing"]');
      const legacyResearch = !!document.querySelector('[data-source="legacy-research-page"]');
      const adsLanding = !!document.querySelector('[data-source="research-ads-landing"]');
      const stuffedArticles =
        !!document.getElementById("incretin") ||
        !!document.getElementById("peptides") ||
        !!document.getElementById("nad");
      const overlay = legacyResearch || adsLanding || stuffedArticles;
      if (!root || overlay) {
        const details = {
          hasPremiumMarker: !!root,
          hasLegacyResearch: legacyResearch,
          hasAdsLanding: adsLanding,
          hasResearchArticles: stuffedArticles,
        };
        // eslint-disable-next-line no-console
        console.warn("[compound-route-guard] overlay/regression at /compound", details);
        try {
          const payload = JSON.stringify({
            type: "compound_overlay",
            path: "/compound",
            referrer: document.referrer || undefined,
            userAgent: navigator.userAgent,
            message: overlay
              ? "Foreign content overlay detected on /compound"
              : "PremiumLanding marker missing on /compound",
            details,
          });
          const blob = new Blob([payload], { type: "application/json" });
          if (!navigator.sendBeacon?.("/api/public/error-monitor", blob)) {
            fetch("/api/public/error-monitor", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: payload,
              keepalive: true,
            }).catch(() => undefined);
          }
        } catch {
          /* diagnostics must never break the page */
        }
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}
