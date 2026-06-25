// Link import intentionally removed — /contact, /privacy-policy and
// /terms-and-conditions are served by the legacy catch-all router, so we use
// plain <a href> to force a full navigation that the legacy router handles.
import { useState, type FormEvent } from "react";

// Responsive image variants (AVIF + WebP) live in /public/og/lab/.
// Mobile (~640) hits ~13 KB AVIF instead of the 186 KB JPG.
const HERO_AVIF = "/og/lab/hero-640.avif 640w, /og/lab/hero-960.avif 960w, /og/lab/hero-1440.avif 1440w, /og/lab/hero-1920.avif 1920w";
const HERO_WEBP = "/og/lab/hero-640.webp 640w, /og/lab/hero-960.webp 960w, /og/lab/hero-1440.webp 1440w, /og/lab/hero-1920.webp 1920w";
const HERO_FALLBACK = "/og/lab/hero-1440.webp";
const MOLECULAR_AVIF = "/og/lab/molecular-768.avif 768w, /og/lab/molecular-1440.avif 1440w";
const MOLECULAR_WEBP = "/og/lab/molecular-768.webp 768w, /og/lab/molecular-1440.webp 1440w";
const DETAIL_AVIF = "/og/lab/detail-768.avif 768w, /og/lab/detail-1440.avif 1440w";
const DETAIL_WEBP = "/og/lab/detail-768.webp 768w, /og/lab/detail-1440.webp 1440w";

/**
 * /compound — premium navy + gold laboratory landing.
 * Ads-policy compliant copy. Inline documentation-request form, smooth
 * anchor scrolling, and prominent research-use-only disclaimer.
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
  const [errorMsg, setErrorMsg] = useState<string>("");

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
    <main className="min-h-screen bg-[#0a1530] text-white antialiased selection:bg-[#c9a44c] selection:text-[#0a1530] scroll-smooth">
      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes phlReveal { 0% { opacity:0; transform:translateY(28px); filter:blur(8px);} 100% { opacity:1; transform:translateY(0); filter:blur(0);} }
        @keyframes phlLine { 0% { transform:scaleX(0);} 100% { transform:scaleX(1);} }
        @keyframes phlFade { 0% { opacity:0;} 100% { opacity:1;} }
        @keyframes phlFloat { 0%,100% { transform:translateY(0);} 50% { transform:translateY(-8px);} }
        @keyframes phlMarquee { 0% { transform:translateX(0);} 100% { transform:translateX(-50%);} }
        @keyframes phlKen { 0% { transform:scale(1.05);} 100% { transform:scale(1.15);} }
        .phl-reveal { opacity:0; animation: phlReveal 1.1s cubic-bezier(.2,.7,.2,1) forwards; }
        .phl-line { transform-origin:left; animation: phlLine 1.2s cubic-bezier(.7,.2,.2,1) forwards; }
        .phl-fade { opacity:0; animation: phlFade 1.4s ease forwards; }
        .phl-float { animation: phlFloat 6s ease-in-out infinite; }
        .phl-marquee { animation: phlMarquee 42s linear infinite; will-change: transform; }
        .phl-ken { animation: phlKen 22s ease-in-out infinite alternate; }
        .d1{animation-delay:.1s} .d2{animation-delay:.25s} .d3{animation-delay:.4s}
        .d4{animation-delay:.55s} .d5{animation-delay:.7s} .d6{animation-delay:.9s}
        .gold{color:#c9a44c}.gold-bg{background-color:#c9a44c}.gold-border{border-color:#c9a44c}
        .serif{font-family:'Cormorant Garamond','Times New Roman',serif}
        section[id]{scroll-margin-top:80px}
        /* Mobile + reduced-motion: drop heavy animations to protect INP/CLS/CPU */
        @media (max-width: 767px) {
          .phl-ken, .phl-float { animation: none !important; }
          .phl-marquee { animation-duration: 60s; }
        }
        @media (prefers-reduced-motion: reduce) {
          .phl-reveal, .phl-line, .phl-fade, .phl-float, .phl-marquee, .phl-ken { animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important; }
        }
      `}</style>

      {/* TOP BAR — strong disclaimer */}
      <div className="border-b border-white/10 bg-[#0a1530]/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-[10.5px] uppercase tracking-[0.3em] text-white/70">
          <span className="phl-fade d1 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full gold-bg" />
            PH Labs · United Kingdom
          </span>
          <span className="phl-fade d2 hidden sm:inline gold">For Research Use Only · Not for Human Consumption</span>
          <span className="phl-fade d3">EST. {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden min-h-[78vh] sm:min-h-[88vh] lg:min-h-[94vh] flex items-center">
        <div className="absolute inset-0 overflow-hidden">
          <picture>
            <source type="image/avif" srcSet={HERO_AVIF} sizes="100vw" />
            <source type="image/webp" srcSet={HERO_WEBP} sizes="100vw" />
            <img
              src={HERO_FALLBACK}
              alt=""
              aria-hidden="true"
              width={1920}
              height={1280}
              fetchPriority="high"
              decoding="async"
              className="phl-ken absolute inset-0 h-full w-full object-cover"
            />
          </picture>
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0a1530]/85 via-[#0a1530]/55 to-[#0a1530]" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#0a1530]/80 via-transparent to-[#0a1530]/60" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32 text-center w-full">
          {eyebrow ? (
            <div className="phl-reveal d1 mb-10 inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.4em] text-white/70">
              <span className="phl-line block h-px w-10 gold-bg" />
              {eyebrow}
              <span className="phl-line block h-px w-10 gold-bg" />
            </div>
          ) : null}

          <h1 className="serif font-light tracking-tight text-white text-[2.6rem] leading-[1.04] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
            <span className="block phl-reveal d2">Premium Research</span>
            <span className="block phl-reveal d3">Compounds for</span>
            <span className="block phl-reveal d4 italic gold">Scientific Laboratories</span>
          </h1>

          <p className="phl-reveal d5 mx-auto mt-10 max-w-2xl text-base sm:text-lg font-light leading-relaxed text-white/75">
            High-purity research materials prepared under controlled UK laboratory
            conditions for professional scientific applications.
          </p>

          <div className="phl-reveal d6 mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#request-form"
              className="group inline-flex items-center justify-center px-9 py-4 rounded-full gold-bg text-[#0a1530] text-[12px] tracking-[0.18em] uppercase font-semibold transition-all hover:brightness-110 shadow-[0_20px_50px_-20px_rgba(201,164,76,0.6)]"
            >
              Request Research Documentation
              <span className="ml-3 transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#standards"
              className="inline-flex items-center justify-center px-9 py-4 rounded-full border gold-border text-white text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-white/5"
            >
              Our Standards
            </a>
          </div>

          {/* spec card */}
          <div className="phl-fade d6 phl-float mt-20 mx-auto max-w-md rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur px-8 py-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
            <dl className="grid grid-cols-3 gap-4 text-center">
              {[
                { k: "UK", v: "Dispatched" },
                { k: "QC", v: "Verified" },
                { k: "Docs", v: "Per batch" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="serif text-2xl font-light text-white">{s.k}</dt>
                  <dd className="mt-1 text-[10px] uppercase tracking-widest gold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* PROMINENT NOTICE BANNER */}
      <a
        href="#disclaimer"
        className="block border-y gold-border bg-[#c9a44c]/10 hover:bg-[#c9a44c]/15 transition-colors"
      >
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] gold font-semibold">
            <span className="inline-block h-1.5 w-1.5 rounded-full gold-bg" />
            Important Notice
          </span>
          <span className="text-sm sm:text-[15px] text-white/90 font-light">
            All products are for laboratory and scientific research use only.
            <span className="gold font-medium"> Not for human consumption.</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/60 underline-offset-4 underline">
            Read full disclaimer →
          </span>
        </div>
      </a>

      {/* MARQUEE */}
      <section className="border-b border-white/10 bg-[#0c1a3a] overflow-hidden">
        <div className="phl-marquee flex whitespace-nowrap py-6 text-[11px] uppercase tracking-[0.5em] text-white/55">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex shrink-0 items-center gap-12 pr-12">
              <span>Premium Research Materials</span><span className="gold">◆</span>
              <span>United Kingdom Laboratory</span><span className="gold">◆</span>
              <span>Verified Purity Standards</span><span className="gold">◆</span>
              <span>Per-Batch Documentation</span><span className="gold">◆</span>
              <span>Controlled Conditions</span><span className="gold">◆</span>
            </div>
          ))}
        </div>
      </section>

      {/* OUR STANDARDS */}
      <section id="standards" className="relative border-b border-white/10 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 01 — Our Standards</p>
            <h2 className="mt-5 serif text-4xl md:text-5xl font-light text-white">
              Built on rigour and provenance
            </h2>
            <div className="mx-auto mt-6 h-px w-12 gold-bg" />
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
            {[
              { k: "01", t: "United Kingdom Laboratory", d: "Prepared, stored and dispatched from UK laboratory facilities." },
              { k: "02", t: "Verified Purity Standards", d: "Evaluated against rigorous quality benchmarks for research compounds." },
              { k: "03", t: "Per-Batch Documentation", d: "Detailed analytical records accompany every batch shipped." },
              { k: "04", t: "Controlled Conditions", d: "Materials handled and stored under controlled laboratory conditions." },
            ].map((c) => (
              <article key={c.k} className="bg-[#0a1530] p-10 transition-colors hover:bg-[#0c1a3a]">
                <div className="font-mono text-xs tracking-widest gold">{c.k}</div>
                <h3 className="mt-6 serif text-xl font-light text-white">{c.t}</h3>
                <p className="mt-4 text-sm leading-relaxed text-white/65">{c.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT WE OFFER */}
      <section id="offer" className="relative border-b border-white/10 py-24 sm:py-32 overflow-hidden">
        <picture>
          <source type="image/avif" srcSet={MOLECULAR_AVIF} sizes="100vw" />
          <source type="image/webp" srcSet={MOLECULAR_WEBP} sizes="100vw" />
          <img
            src="/og/lab/molecular-1440.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={1920}
            height={1088}
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        </picture>
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0a1530] via-[#0a1530]/85 to-[#0a1530]" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 02 — What We Offer</p>
          <h2 className="mt-5 serif text-4xl md:text-5xl font-light text-white">
            Premium-grade research compounds
          </h2>
          <div className="mx-auto mt-6 h-px w-12 gold-bg" />
          <p className="mt-10 mx-auto max-w-2xl text-base sm:text-lg font-light leading-relaxed text-white/80">
            Premium-grade research compounds intended strictly for laboratory
            research, analytical studies, and scientific applications. All
            materials are supplied with detailed analytical documentation to
            support high-quality and reproducible scientific work.
          </p>
        </div>
      </section>

      {/* INTENDED USE */}
      <section id="intended-use" className="relative overflow-hidden border-b border-white/10 py-32 sm:py-44">
        <picture>
          <source type="image/avif" srcSet={DETAIL_AVIF} sizes="100vw" />
          <source type="image/webp" srcSet={DETAIL_WEBP} sizes="100vw" />
          <img
            src="/og/lab/detail-1440.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={1600}
            height={1200}
            className="phl-ken absolute inset-0 h-full w-full object-cover opacity-40"
          />
        </picture>
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0a1530]/80 via-[#0a1530]/65 to-[#0a1530]" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 03 — Intended Use</p>
          <blockquote className="mt-10 serif text-2xl sm:text-3xl md:text-[2.5rem] font-light leading-[1.3] text-white">
            <span className="gold text-4xl">“</span>
            All products are intended exclusively for laboratory and scientific
            research purposes. They are not intended for human consumption,
            medical use, or any therapeutic applications.
            <span className="gold text-4xl">”</span>
          </blockquote>
          <div className="mx-auto mt-10 h-px w-12 gold-bg" />
          <p className="mt-6 text-[11px] uppercase tracking-[0.4em] text-white/55">PH Labs · Research Standard</p>
        </div>
      </section>

      {/* REQUEST DOCUMENTATION FORM */}
      <section id="request-form" className="border-b border-white/10 py-24 sm:py-32 bg-[#0c1a3a]">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 04 — Request Documentation</p>
            <h2 className="mt-5 serif text-4xl md:text-5xl font-light text-white">
              Documentation for qualified researchers
            </h2>
            <div className="mx-auto mt-6 h-px w-12 gold-bg" />
            <p className="mt-8 mx-auto max-w-2xl text-base font-light leading-relaxed text-white/75">
              Qualified researchers and institutions may request detailed
              documentation for our premium laboratory research materials.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="mt-12 rounded-2xl border border-white/10 bg-[#0a1530] p-8 sm:p-10 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] space-y-6"
            noValidate
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <label className="block">
                <span className="block text-[11px] uppercase tracking-[0.25em] gold mb-2">Full Name *</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 px-4 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors"
                  placeholder="Dr. Jane Smith"
                  maxLength={120}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-[0.25em] gold mb-2">Institution</span>
                <input
                  type="text"
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 px-4 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors"
                  placeholder="University / Laboratory"
                  maxLength={200}
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.25em] gold mb-2">Email *</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 px-4 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors"
                placeholder="researcher@institution.ac.uk"
                maxLength={320}
              />
            </label>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-[0.25em] gold mb-2">Message (optional)</span>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={4}
                className="w-full rounded-lg border-2 border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors resize-y"
                placeholder="Briefly describe your research enquiry."
                maxLength={2000}
              />
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                className="mt-1 h-5 w-5 rounded border-2 border-slate-600 bg-slate-800 accent-[#c9a44c] flex-shrink-0"
                required
              />
              <span className="text-sm text-white/75 leading-relaxed">
                I consent to PH Labs processing my details to respond to this
                enquiry, in accordance with the{" "}
                <a href="/privacy-policy" className="gold underline underline-offset-4 hover:brightness-125">
                  Privacy Policy
                </a>
                . I confirm I am a qualified researcher and understand these
                materials are for research use only.
              </span>
            </label>

            <div className="pt-2">
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full sm:w-auto inline-flex items-center justify-center px-10 py-4 rounded-full gold-bg text-[#0a1530] text-[12px] tracking-[0.18em] uppercase font-semibold transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_20px_50px_-20px_rgba(201,164,76,0.6)]"
              >
                {status === "sending" ? "Sending…" : "Submit Request"}
                {status !== "sending" && <span className="ml-3">→</span>}
              </button>
            </div>

            {status === "ok" && (
              <p
                role="status"
                className="text-sm text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 rounded-lg px-4 py-3"
              >
                Thank you — your request has been received. Our team will
                respond by email shortly.
              </p>
            )}
            {status === "error" && (
              <p
                role="alert"
                className="text-sm text-rose-200 border border-rose-500/40 bg-rose-500/10 rounded-lg px-4 py-3"
              >
                {errorMsg}
              </p>
            )}
          </form>
        </div>
      </section>

      {/* LEGAL DISCLAIMER */}
      <section id="disclaimer" className="py-20 bg-[#0a1530]">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="border-t gold-border pt-12">
            <p className="text-[11px] uppercase tracking-[0.5em] gold">Legal</p>
            <h2 className="mt-3 serif text-2xl font-light text-white">Legal Disclaimer</h2>
            <p className="mt-6 text-sm sm:text-[15px] leading-relaxed text-white/70">
              All products offered on this website are intended solely for
              laboratory research and scientific purposes. They are not intended
              for human consumption, medical diagnosis, treatment, or any
              therapeutic use. By accessing this website or purchasing any
              product, you confirm that you are a qualified researcher or
              institution and that you will comply with all applicable laws and
              regulations regarding the handling and use of research materials.
              Misuse of these products may be dangerous and illegal. The company
              accepts no liability for any misuse of these products.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/"
                className="inline-flex items-center justify-center px-8 py-3 rounded-full border border-white/20 text-white/80 text-[11px] tracking-[0.2em] uppercase hover:bg-white/5 transition-all"
              >
                ← Back to homepage
              </a>
              <a
                href="/terms-and-conditions"
                className="inline-flex items-center justify-center px-8 py-3 rounded-full border border-white/20 text-white/80 text-[11px] tracking-[0.2em] uppercase hover:bg-white/5 transition-all"
              >
                Terms of Service
              </a>
              <a
                href="/contact"
                className="inline-flex items-center justify-center px-8 py-3 rounded-full border border-white/20 text-white/80 text-[11px] tracking-[0.2em] uppercase hover:bg-white/5 transition-all"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-10 bg-[#0a1530]">
        <div className="mx-auto max-w-7xl px-6 flex flex-col items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/55 text-center">
          <span>© {new Date().getFullYear()} PH Labs · United Kingdom</span>
          <span className="gold">For Research Use Only · Not for Human Consumption</span>
        </div>
      </footer>
    </main>
  );
}
