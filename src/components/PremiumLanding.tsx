import { Link } from "@tanstack/react-router";
import heroImg from "@/assets/lab-white-hero.jpg";
import detailImg from "@/assets/lab-white-detail.jpg";

/**
 * /compound — light, modern, Moser-inspired editorial layout.
 * White lab background. Animated typography. Brand-neutral.
 */
export function PremiumLanding({ eyebrow }: { eyebrow?: string }) {
  return (
    <main className="min-h-screen bg-white text-neutral-900 antialiased selection:bg-neutral-900 selection:text-white">
      <style>{`
        @keyframes phlReveal {
          0% { opacity: 0; transform: translateY(28px); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes phlLine {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes phlFade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes phlFloat {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes phlMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .phl-reveal { opacity: 0; animation: phlReveal 1.1s cubic-bezier(.2,.7,.2,1) forwards; }
        .phl-line { transform-origin: left; animation: phlLine 1.2s cubic-bezier(.7,.2,.2,1) forwards; }
        .phl-fade { opacity: 0; animation: phlFade 1.4s ease forwards; }
        .phl-float { animation: phlFloat 6s ease-in-out infinite; }
        .phl-marquee { animation: phlMarquee 38s linear infinite; }
        .phl-d1 { animation-delay: .1s; }
        .phl-d2 { animation-delay: .25s; }
        .phl-d3 { animation-delay: .4s; }
        .phl-d4 { animation-delay: .55s; }
        .phl-d5 { animation-delay: .7s; }
        .phl-d6 { animation-delay: .9s; }
      `}</style>

      {/* TOP BAR */}
      <div className="border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-[11px] uppercase tracking-[0.3em] text-neutral-500">
          <span className="phl-fade phl-d1">PH Labs · United Kingdom</span>
          <span className="phl-fade phl-d2 hidden sm:inline">For Research Use Only</span>
          <span className="phl-fade phl-d3">EST. {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <img
          src={heroImg}
          alt=""
          aria-hidden="true"
          width={1920}
          height={1280}
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/40 to-white" />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-28 lg:pt-28 lg:pb-40 text-center">
          {eyebrow ? (
            <div className="phl-reveal phl-d1 mb-10 inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.4em] text-neutral-600">
              <span className="phl-line block h-px w-10 bg-neutral-400" />
              {eyebrow}
              <span className="phl-line block h-px w-10 bg-neutral-400" />
            </div>
          ) : null}

          <h1 className="font-serif font-light tracking-tight text-neutral-950 text-[2.6rem] leading-[1.02] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
            <span className="block phl-reveal phl-d2">Premium Research</span>
            <span className="block phl-reveal phl-d3">Compounds for</span>
            <span className="block phl-reveal phl-d4 italic text-neutral-500">Scientific Laboratories</span>
          </h1>

          <p className="phl-reveal phl-d5 mx-auto mt-10 max-w-2xl text-base sm:text-lg font-light leading-relaxed text-neutral-600">
            High-purity research materials developed for professional laboratory and scientific applications.
          </p>

          <div className="phl-reveal phl-d6 mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#documentation"
              className="group inline-flex items-center justify-center px-8 py-4 rounded-full bg-neutral-950 text-white text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-neutral-800"
            >
              Request Documentation
              <span className="ml-3 transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#standards"
              className="inline-flex items-center justify-center px-8 py-4 rounded-full border border-neutral-300 text-neutral-800 text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:border-neutral-950"
            >
              Our Standards
            </a>
          </div>

          {/* floating spec card */}
          <div className="phl-fade phl-d6 phl-float mt-20 mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white/85 backdrop-blur px-8 py-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.25)]">
            <dl className="grid grid-cols-3 gap-4 text-center">
              {[
                { k: "UK", v: "Dispatched" },
                { k: "QC", v: "Verified" },
                { k: "Docs", v: "Per batch" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="font-serif text-2xl font-light text-neutral-950">{s.k}</dt>
                  <dd className="mt-1 text-[10px] uppercase tracking-widest text-neutral-500">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="border-y border-neutral-200 bg-neutral-50 overflow-hidden">
        <div className="phl-marquee flex whitespace-nowrap py-6 text-[11px] uppercase tracking-[0.5em] text-neutral-400">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex shrink-0 items-center gap-12 pr-12">
              <span>Premium Research Materials</span><span>·</span>
              <span>United Kingdom Laboratory</span><span>·</span>
              <span>Verified Purity Standards</span><span>·</span>
              <span>Per-Batch Documentation</span><span>·</span>
              <span>Controlled Conditions</span><span>·</span>
            </div>
          ))}
        </div>
      </section>

      {/* WHAT WE OFFER */}
      <section className="border-b border-neutral-200 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.5em] text-neutral-500">§ 01 — Capability</p>
            <h2 className="mt-5 font-serif text-4xl md:text-5xl font-light text-neutral-950">
              What we offer
            </h2>
            <div className="mx-auto mt-6 h-px w-12 bg-neutral-300" />
            <p className="mx-auto mt-8 max-w-2xl text-base font-light leading-relaxed text-neutral-600">
              Premium-grade research compounds intended strictly for laboratory research,
              analytical studies, and scientific applications.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 rounded-2xl overflow-hidden">
            {[
              { k: "01", title: "Analytical Documentation", body: "Each batch ships with detailed analytical records that support reproducible workflows." },
              { k: "02", title: "Verified Purity Standards", body: "Materials are evaluated against rigorous quality benchmarks for advanced research compounds." },
              { k: "03", title: "Laboratory-Grade Supply", body: "Prepared, stored and dispatched from the United Kingdom under controlled conditions." },
            ].map((c) => (
              <article key={c.k} className="group bg-white p-10 transition-colors hover:bg-neutral-50">
                <div className="font-mono text-xs tracking-widest text-neutral-400">{c.k}</div>
                <h3 className="mt-6 font-serif text-2xl font-light text-neutral-950">{c.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-neutral-600">{c.body}</p>
                <span className="mt-8 inline-block text-neutral-300 transition-all group-hover:text-neutral-900 group-hover:translate-x-1">→</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* QUOTE BAND with detail image */}
      <section id="standards" className="relative overflow-hidden border-b border-neutral-200 py-28 sm:py-40 bg-neutral-50">
        <img
          src={detailImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1600}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/50 to-white/90" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-neutral-500">§ 02 — Intended Use</p>
          <blockquote className="mt-10 font-serif text-2xl sm:text-3xl md:text-[2.5rem] font-light leading-[1.25] text-neutral-950">
            <span className="text-neutral-400">“</span>
            All products are intended exclusively for laboratory and scientific
            research purposes. They are not intended for human consumption,
            medical use, or any therapeutic applications.
            <span className="text-neutral-400">”</span>
          </blockquote>
          <div className="mx-auto mt-10 h-px w-12 bg-neutral-400" />
        </div>
      </section>

      {/* CTA */}
      <section id="documentation" className="border-b border-neutral-200 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-neutral-500">§ 03</p>
          <h2 className="mt-5 font-serif text-4xl md:text-5xl font-light text-neutral-950">
            Request Research Documentation
          </h2>
          <p className="mt-6 mx-auto max-w-2xl text-base sm:text-lg font-light leading-relaxed text-neutral-600">
            Qualified researchers and institutions may request the detailed
            documentation accompanying our premium laboratory research materials.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-neutral-950 text-white text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:bg-neutral-800"
            >
              Contact Our Team <span className="ml-2">→</span>
            </Link>
            <Link
              to="/quality-control"
              className="inline-flex items-center justify-center px-8 py-4 rounded-full border border-neutral-300 text-neutral-800 text-[12px] tracking-[0.18em] uppercase font-medium transition-all hover:border-neutral-950"
            >
              Quality Standards <span className="ml-2">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="border-t border-neutral-300 pt-12">
            <p className="text-[11px] uppercase tracking-[0.5em] text-neutral-500">Legal</p>
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
          <span>For Research Use Only · Not for Human Consumption</span>
        </div>
      </footer>
    </main>
  );
}
