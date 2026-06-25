import { Link } from "@tanstack/react-router";
import heroImg from "@/assets/lab-luxury-hero.jpg";
import detailImg from "@/assets/lab-luxury-detail.jpg";
import wideImg from "@/assets/lab-luxury-wide.jpg";

/**
 * /compound — luxury laboratory editorial.
 * Full-bleed lab photography, gold accents, animated typography.
 */
export function PremiumLanding({ eyebrow }: { eyebrow?: string }) {
  return (
    <main className="min-h-screen bg-white text-neutral-900 antialiased selection:bg-[#b08a3e] selection:text-white">
      <style>{`
        @keyframes phlReveal {
          0% { opacity: 0; transform: translateY(28px); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes phlLine { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        @keyframes phlFade { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes phlFloat {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes phlMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes phlKenBurns {
          0% { transform: scale(1.05) translate(0,0); }
          100% { transform: scale(1.15) translate(-1.5%, -1.5%); }
        }
        .phl-reveal { opacity: 0; animation: phlReveal 1.1s cubic-bezier(.2,.7,.2,1) forwards; }
        .phl-line { transform-origin: left; animation: phlLine 1.2s cubic-bezier(.7,.2,.2,1) forwards; }
        .phl-fade { opacity: 0; animation: phlFade 1.4s ease forwards; }
        .phl-float { animation: phlFloat 6s ease-in-out infinite; }
        .phl-marquee { animation: phlMarquee 38s linear infinite; }
        .phl-ken { animation: phlKenBurns 18s ease-in-out infinite alternate; }
        .phl-d1 { animation-delay: .1s; } .phl-d2 { animation-delay: .25s; }
        .phl-d3 { animation-delay: .4s; } .phl-d4 { animation-delay: .55s; }
        .phl-d5 { animation-delay: .7s; } .phl-d6 { animation-delay: .9s; }
        .gold { color: #b08a3e; }
        .gold-border { border-color: #b08a3e; }
        .gold-bg { background-color: #b08a3e; }
      `}</style>

      {/* TOP BAR */}
      <div className="border-b border-neutral-200 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-[11px] uppercase tracking-[0.3em] text-neutral-600">
          <span className="phl-fade phl-d1 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full gold-bg" />
            PH Labs · United Kingdom
          </span>
          <span className="phl-fade phl-d2 hidden sm:inline gold">For Research Use Only</span>
          <span className="phl-fade phl-d3">EST. {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* HERO — full-bleed laboratory */}
      <section className="relative overflow-hidden min-h-[92vh] flex items-center">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={heroImg}
            alt=""
            aria-hidden="true"
            width={1920}
            height={1280}
            className="phl-ken absolute inset-0 h-full w-full object-cover"
          />
          {/* layered gradients for legibility + luxury */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/15 to-white/85" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-white/70 via-transparent to-white/40" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32 text-center w-full">
          {eyebrow ? (
            <div className="phl-reveal phl-d1 mb-10 inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.4em] text-neutral-700">
              <span className="phl-line block h-px w-10 gold-bg" />
              {eyebrow}
              <span className="phl-line block h-px w-10 gold-bg" />
            </div>
          ) : null}

          <h1 className="font-serif font-light tracking-tight text-neutral-950 text-[2.6rem] leading-[1.02] sm:text-6xl md:text-7xl lg:text-[5.75rem]">
            <span className="block phl-reveal phl-d2">Premium Research</span>
            <span className="block phl-reveal phl-d3">Compounds for</span>
            <span className="block phl-reveal phl-d4 italic" style={{ color: '#8a6a2e' }}>Scientific Laboratories</span>
          </h1>

          <p className="phl-reveal phl-d5 mx-auto mt-10 max-w-2xl text-base sm:text-lg font-light leading-relaxed text-neutral-700">
            High-purity research materials prepared under controlled UK
            laboratory conditions for professional scientific applications.
          </p>

          <div className="phl-reveal phl-d6 mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#documentation"
              className="group inline-flex items-center justify-center px-9 py-4 rounded-full bg-neutral-950 text-white text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-[#8a6a2e] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]"
            >
              Request Documentation
              <span className="ml-3 transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#standards"
              className="inline-flex items-center justify-center px-9 py-4 rounded-full border gold-border bg-white/80 backdrop-blur text-neutral-900 text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-white"
            >
              Our Standards
            </a>
          </div>

          {/* floating spec card */}
          <div className="phl-fade phl-d6 phl-float mt-20 mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white/90 backdrop-blur px-8 py-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)]">
            <dl className="grid grid-cols-3 gap-4 text-center">
              {[
                { k: "UK", v: "Dispatched" },
                { k: "QC", v: "Verified" },
                { k: "Docs", v: "Per batch" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="font-serif text-2xl font-light text-neutral-950">{s.k}</dt>
                  <dd className="mt-1 text-[10px] uppercase tracking-widest gold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="border-y border-neutral-200 bg-neutral-50 overflow-hidden">
        <div className="phl-marquee flex whitespace-nowrap py-6 text-[11px] uppercase tracking-[0.5em] text-neutral-500">
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

      {/* WHAT WE OFFER — laboratory backdrop */}
      <section className="relative border-b border-neutral-200 py-24 sm:py-32 overflow-hidden">
        <img
          src={wideImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.10]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white via-white/90 to-white" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 01 — Capability</p>
            <h2 className="mt-5 font-serif text-4xl md:text-5xl font-light text-neutral-950">
              What we offer
            </h2>
            <div className="mx-auto mt-6 h-px w-12 gold-bg" />
            <p className="mx-auto mt-8 max-w-2xl text-base font-light leading-relaxed text-neutral-700">
              Premium-grade research compounds intended strictly for laboratory
              research, analytical studies, and scientific applications.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 rounded-2xl overflow-hidden shadow-[0_30px_80px_-40px_rgba(0,0,0,0.25)]">
            {[
              { k: "01", title: "Analytical Documentation", body: "Each batch ships with detailed analytical records that support reproducible workflows." },
              { k: "02", title: "Verified Purity Standards", body: "Materials are evaluated against rigorous quality benchmarks for advanced research compounds." },
              { k: "03", title: "Laboratory-Grade Supply", body: "Prepared, stored and dispatched from the United Kingdom under controlled conditions." },
            ].map((c) => (
              <article key={c.k} className="group bg-white p-10 transition-colors hover:bg-neutral-50">
                <div className="font-mono text-xs tracking-widest gold">{c.k}</div>
                <h3 className="mt-6 font-serif text-2xl font-light text-neutral-950">{c.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-neutral-600">{c.body}</p>
                <span className="mt-8 inline-block gold transition-all group-hover:translate-x-1">→</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* QUOTE BAND — luxury vial photography */}
      <section id="standards" className="relative overflow-hidden border-b border-neutral-200 py-32 sm:py-44">
        <img
          src={detailImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1600}
          height={1200}
          className="phl-ken absolute inset-0 h-full w-full object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white/85 via-white/60 to-white/95" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 02 — Intended Use</p>
          <blockquote className="mt-10 font-serif text-2xl sm:text-3xl md:text-[2.5rem] font-light leading-[1.25] text-neutral-950">
            <span className="gold text-4xl">“</span>
            All products are intended exclusively for laboratory and scientific
            research purposes. They are not intended for human consumption,
            medical use, or any therapeutic applications.
            <span className="gold text-4xl">”</span>
          </blockquote>
          <div className="mx-auto mt-10 h-px w-12 gold-bg" />
          <p className="mt-6 text-[11px] uppercase tracking-[0.4em] text-neutral-600">PH Labs · Research Standard</p>
        </div>
      </section>

      {/* CTA */}
      <section id="documentation" className="border-b border-neutral-200 py-24 sm:py-32 bg-neutral-50">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] gold">§ 03</p>
          <h2 className="mt-5 font-serif text-4xl md:text-5xl font-light text-neutral-950">
            Request Research Documentation
          </h2>
          <p className="mt-6 mx-auto max-w-2xl text-base sm:text-lg font-light leading-relaxed text-neutral-700">
            Qualified researchers and institutions may request the detailed
            documentation accompanying our premium laboratory research materials.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center px-9 py-4 rounded-full bg-neutral-950 text-white text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-[#8a6a2e]"
            >
              Contact Our Team <span className="ml-2">→</span>
            </Link>
            <Link
              to="/quality-control"
              className="inline-flex items-center justify-center px-9 py-4 rounded-full border gold-border text-neutral-900 text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-white"
            >
              Quality Standards <span className="ml-2">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="border-t gold-border pt-12">
            <p className="text-[11px] uppercase tracking-[0.5em] gold">Legal</p>
            <h2 className="mt-3 font-serif text-2xl font-light text-neutral-950">Disclaimer</h2>
            <p className="mt-6 text-sm sm:text-[15px] leading-relaxed text-neutral-600">
              All products offered on this website are intended solely for
              laboratory research and scientific purposes. They are not intended
              for human consumption, medical diagnosis, treatment, or any
              therapeutic use. By accessing this website or purchasing any
              product, you confirm that you are a qualified researcher or
              institution and that you will comply with all applicable laws and
              regulations regarding the handling and use of research materials.
              Misuse of these products may be dangerous and illegal.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-10 bg-white">
        <div className="mx-auto max-w-7xl px-6 flex flex-col items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-neutral-500 text-center">
          <span>© {new Date().getFullYear()} PH Labs · United Kingdom</span>
          <span className="gold">For Research Use Only · Not for Human Consumption</span>
        </div>
      </footer>
    </main>
  );
}
