import { Link } from "@tanstack/react-router";
import heroImg from "@/assets/lab-navy-hero.jpg";
import molecularImg from "@/assets/lab-navy-molecular.jpg";
import detailImg from "@/assets/lab-navy-detail.jpg";

/**
 * /compound — premium navy + gold laboratory landing.
 * Deep navy, charcoal, white, subtle gold. Ads-policy compliant copy.
 */
export function PremiumLanding({ eyebrow }: { eyebrow?: string }) {
  return (
    <main className="min-h-screen bg-[#0a1530] text-white antialiased selection:bg-[#c9a44c] selection:text-[#0a1530]">
      <style>{`
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
        .phl-marquee { animation: phlMarquee 42s linear infinite; }
        .phl-ken { animation: phlKen 22s ease-in-out infinite alternate; }
        .d1{animation-delay:.1s} .d2{animation-delay:.25s} .d3{animation-delay:.4s}
        .d4{animation-delay:.55s} .d5{animation-delay:.7s} .d6{animation-delay:.9s}
        .gold{color:#c9a44c}.gold-bg{background-color:#c9a44c}.gold-border{border-color:#c9a44c}
        .serif{font-family:'Cormorant Garamond','Times New Roman',serif}
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
      <section className="relative overflow-hidden min-h-[94vh] flex items-center">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={heroImg}
            alt=""
            aria-hidden="true"
            width={1920}
            height={1280}
            className="phl-ken absolute inset-0 h-full w-full object-cover"
          />
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
              href="#documentation"
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

      {/* MARQUEE */}
      <section className="border-y border-white/10 bg-[#0c1a3a] overflow-hidden">
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
              { k: "01", t: "United Kingdom Laboratory Supply", d: "Prepared, stored and dispatched from UK laboratory facilities." },
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

      {/* WHAT WE OFFER — molecular backdrop */}
      <section className="relative border-b border-white/10 py-24 sm:py-32 overflow-hidden">
        <img
          src={molecularImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1920}
          height={1088}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#0a1530] via-[#0a1530]/85 to-[#0a1530]" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 02 — What We Offer</p>
          <h2 className="mt-5 serif text-4xl md:text-5xl font-light text-white">
            Premium-grade research compounds
          </h2>
          <div className="mx-auto mt-6 h-px w-12 gold-bg" />
          <p className="mt-10 mx-auto max-w-2xl text-base sm:text-lg font-light leading-relaxed text-white/80">
            We provide premium-grade research compounds intended strictly for
            laboratory research, analytical studies, and scientific applications.
            All materials are supplied with detailed analytical documentation to
            support high-quality and reproducible scientific work.
          </p>
        </div>
      </section>

      {/* INTENDED USE — luxury vial photography */}
      <section className="relative overflow-hidden border-b border-white/10 py-32 sm:py-44">
        <img
          src={detailImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1600}
          height={1200}
          className="phl-ken absolute inset-0 h-full w-full object-cover opacity-40"
        />
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

      {/* IMPORTANT NOTICE */}
      <section className="border-b border-white/10 py-20 bg-[#0c1a3a]">
        <div className="mx-auto max-w-4xl px-6">
          <div className="rounded-2xl border gold-border bg-[#0a1530] p-10 sm:p-12 shadow-[0_30px_80px_-40px_rgba(201,164,76,0.3)]">
            <p className="text-[11px] uppercase tracking-[0.5em] gold">Important Notice</p>
            <h2 className="mt-4 serif text-2xl sm:text-3xl font-light text-white">For laboratory and scientific research use only</h2>
            <p className="mt-6 text-sm sm:text-[15px] leading-relaxed text-white/75">
              These research compounds are sold strictly for laboratory and
              scientific research use only. They are not for human consumption
              and have not been evaluated for safety or efficacy in humans.
            </p>
          </div>
        </div>
      </section>

      {/* REQUEST DOCUMENTATION */}
      <section id="documentation" className="border-b border-white/10 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 04 — Request Documentation</p>
          <h2 className="mt-5 serif text-4xl md:text-5xl font-light text-white">
            Documentation for qualified researchers
          </h2>
          <p className="mt-8 mx-auto max-w-2xl text-base sm:text-lg font-light leading-relaxed text-white/75">
            Qualified researchers and institutions may request detailed
            documentation for our premium laboratory research materials.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center px-9 py-4 rounded-full gold-bg text-[#0a1530] text-[12px] tracking-[0.18em] uppercase font-semibold transition-all hover:brightness-110"
            >
              Request Research Documentation <span className="ml-2">→</span>
            </Link>
            <Link
              to="/quality-control"
              className="inline-flex items-center justify-center px-9 py-4 rounded-full border gold-border text-white text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-white/5"
            >
              Learn More About Our Standards <span className="ml-2">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* LEGAL DISCLAIMER */}
      <section className="py-20 bg-[#0a1530]">
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
            <Link
              to="/"
              className="mt-10 inline-flex items-center justify-center px-8 py-3 rounded-full border border-white/20 text-white/80 text-[11px] tracking-[0.2em] uppercase hover:bg-white/5 transition-all"
            >
              ← Back to homepage
            </Link>
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
