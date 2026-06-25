import { Link } from "@tanstack/react-router";
import heroImg from "@/assets/premium-lab-hero.jpg";
import molecularImg from "@/assets/premium-molecular.jpg";

/**
 * /compound — modern split-screen executive layout.
 * Brand-neutral. No substance names.
 */
export function PremiumLanding({ eyebrow }: { eyebrow?: string }) {
  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100 antialiased selection:bg-amber-300/30">
      {/* TOP NOTICE */}
      <div className="border-b border-white/5 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-6 py-3 text-center text-[11px] sm:text-xs uppercase tracking-[0.25em] text-amber-200/80">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.7)]" />
          For laboratory & scientific research only — not for human consumption
        </div>
      </div>

      {/* HERO — centered */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-16 pb-20 lg:pt-24 lg:pb-32 text-center">
          {eyebrow ? (
            <div className="mb-10 flex items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-amber-200/80">
              <span className="h-px w-10 bg-amber-300/60" />
              {eyebrow}
              <span className="h-px w-10 bg-amber-300/60" />
            </div>
          ) : null}

          <h1 className="font-serif text-[2.5rem] leading-[1.05] sm:text-5xl md:text-6xl lg:text-7xl font-light tracking-tight text-white">
            Premium Research
            <br />
            Compounds for
            <br />
            <span className="italic bg-gradient-to-r from-amber-200 via-amber-100 to-amber-300 bg-clip-text text-transparent">
              Scientific Laboratories
            </span>
          </h1>

          <p className="mt-8 max-w-2xl text-lg sm:text-xl font-light leading-relaxed text-slate-300/90">
            High-purity research materials developed for professional
            laboratory and scientific applications.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a
              href="#documentation"
              className="group inline-flex items-center justify-center px-8 py-4 rounded-sm bg-amber-300 text-[#0a0f1c] font-semibold text-[12px] tracking-[0.18em] uppercase transition-all hover:bg-amber-200"
            >
              Request Research Documentation
              <span className="ml-3 transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#standards"
              className="inline-flex items-center justify-center px-8 py-4 rounded-sm border border-white/15 text-slate-200 font-medium text-[12px] tracking-[0.18em] uppercase transition-all hover:border-white/40 hover:text-white"
            >
              Our Standards
            </a>
          </div>

          {/* trust strip */}
          <dl className="mt-16 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-white/10 bg-white/5 max-w-xl w-full">
            {[
              { k: "UK", v: "Prepared & dispatched" },
              { k: "QC", v: "Verified purity standards" },
              { k: "Docs", v: "Per-batch records" },
            ].map((s) => (
              <div key={s.k} className="bg-[#070b14] px-4 py-5 text-center">
                <dt className="font-serif text-2xl font-light text-amber-300/90">{s.k}</dt>
                <dd className="mt-1 text-[11px] uppercase tracking-wider text-slate-400">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* WHAT WE OFFER — horizontal numbered */}
      <section className="border-b border-white/5 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-4">
              <p className="text-[11px] uppercase tracking-[0.4em] text-amber-200/70">§ 01</p>
              <h2 className="mt-4 font-serif text-4xl md:text-5xl font-light text-white">
                What we offer
              </h2>
              <div className="mt-6 h-px w-12 bg-amber-300/60" />
              <p className="mt-8 text-base font-light leading-relaxed text-slate-400">
                We provide premium-grade research compounds intended strictly
                for laboratory research, analytical studies, and scientific
                applications. All materials are supplied with detailed
                documentation and meet high standards of quality and purity.
              </p>
            </div>

            <div className="lg:col-span-8 space-y-px bg-white/5 border border-white/10 rounded-sm overflow-hidden">
              {[
                {
                  k: "01",
                  title: "Analytical Documentation",
                  body: "Each batch is accompanied by detailed analytical records supporting reproducible laboratory workflows.",
                },
                {
                  k: "02",
                  title: "Verified Purity Standards",
                  body: "Materials are evaluated against rigorous quality benchmarks established for advanced scientific research compounds.",
                },
                {
                  k: "03",
                  title: "Laboratory-Grade Supply",
                  body: "Premium laboratory research materials prepared, stored and dispatched under controlled conditions.",
                },
              ].map((c) => (
                <article
                  key={c.k}
                  className="group grid grid-cols-[auto_1fr_auto] items-start gap-6 bg-[#070b14] px-6 sm:px-10 py-10 transition-colors hover:bg-[#0c1224]"
                >
                  <div className="font-mono text-xs text-amber-300/70 pt-1">{c.k}</div>
                  <div>
                    <h3 className="text-xl font-medium text-white">{c.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-400 max-w-xl">{c.body}</p>
                  </div>
                  <span className="text-amber-300/40 pt-1 transition-transform group-hover:translate-x-1">→</span>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* INTENDED USE — quote band */}
      <section
        id="standards"
        className="relative overflow-hidden border-b border-white/5 py-28 sm:py-40"
      >
        <img
          src={molecularImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1920}
          height={1280}
          className="absolute inset-0 h-full w-full object-cover opacity-15"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#070b14] via-[#070b14]/70 to-[#070b14]" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.4em] text-amber-200/70">§ 02 — Intended Use</p>
          <blockquote className="mt-10 font-serif text-2xl sm:text-3xl md:text-4xl font-light leading-[1.3] text-white">
            <span className="text-amber-300/70">“</span>
            All products are intended exclusively for laboratory and scientific
            research purposes. They are not intended for human consumption,
            medical use, or any therapeutic applications.
            <span className="text-amber-300/70">”</span>
          </blockquote>
          <div className="mx-auto mt-10 h-px w-12 bg-amber-300/50" />
        </div>
      </section>

      {/* DOCUMENTATION CTA */}
      <section
        id="documentation"
        className="relative border-b border-white/5 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-7">
              <p className="text-[11px] uppercase tracking-[0.4em] text-amber-200/70">§ 03</p>
              <h2 className="mt-4 font-serif text-4xl md:text-5xl font-light text-white">
                Request Research Documentation
              </h2>
              <p className="mt-6 max-w-xl text-base sm:text-lg font-light leading-relaxed text-slate-300/90">
                Qualified researchers and institutions may request the detailed
                documentation accompanying our premium laboratory research
                materials.
              </p>
            </div>
            <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-between px-7 py-4 rounded-sm bg-amber-300 text-[#0a0f1c] font-semibold text-[12px] tracking-[0.18em] uppercase transition-all hover:bg-amber-200"
              >
                Contact Our Team <span>→</span>
              </Link>
              <Link
                to="/quality-control"
                className="inline-flex items-center justify-between px-7 py-4 rounded-sm border border-white/15 text-slate-200 font-medium text-[12px] tracking-[0.18em] uppercase transition-all hover:border-white/40 hover:text-white"
              >
                Quality Standards <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* LEGAL DISCLAIMER */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 border-t border-amber-300/30 pt-12">
            <div className="md:w-48">
              <p className="text-[11px] uppercase tracking-[0.4em] text-amber-200/80">Legal</p>
              <h2 className="mt-3 font-serif text-2xl font-light text-amber-100">Disclaimer</h2>
            </div>
            <p className="text-sm sm:text-[15px] leading-relaxed text-slate-300/90">
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

      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] uppercase tracking-[0.25em] text-slate-500">
          <span>© {new Date().getFullYear()} PH Labs · United Kingdom</span>
          <span>For Research Use Only · Not for Human Consumption</span>
        </div>
      </footer>
    </main>
  );
}
