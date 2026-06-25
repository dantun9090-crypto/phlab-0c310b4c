import { Link } from "@tanstack/react-router";
import heroImg from "@/assets/premium-lab-hero.jpg";
import molecularImg from "@/assets/premium-molecular.jpg";

/**
 * Premium, brand-neutral scientific landing page.
 * No substance names. Used by /compound and /landing/phlabs.
 */
export function PremiumLanding({ eyebrow }: { eyebrow?: string }) {
  return (
    <main className="min-h-screen bg-[#0a1020] text-slate-100 antialiased">
      {/* IMPORTANT NOTICE BAR */}
      <div className="w-full border-b border-amber-300/20 bg-gradient-to-r from-amber-500/5 via-amber-400/10 to-amber-500/5">
        <div className="mx-auto max-w-6xl px-6 py-3 text-center text-[13px] sm:text-sm text-amber-200/90 tracking-wide">
          <strong className="font-semibold text-amber-100">Important Notice:</strong>{" "}
          These research compounds are sold strictly for laboratory and scientific
          research use only. Not for human consumption.
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
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#0a1020]/70 via-[#0a1020]/85 to-[#0a1020]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent"
        />

        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-28 sm:pt-32 sm:pb-40 text-center">
          {eyebrow ? (
            <p className="mb-8 inline-flex items-center gap-3 text-[11px] sm:text-xs uppercase tracking-[0.35em] text-amber-200/80">
              <span className="h-px w-8 bg-amber-300/50" />
              {eyebrow}
              <span className="h-px w-8 bg-amber-300/50" />
            </p>
          ) : null}

          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light leading-[1.05] tracking-tight text-white">
            Premium Research Compounds{" "}
            <span className="block mt-2 bg-gradient-to-r from-amber-200 via-amber-100 to-amber-300 bg-clip-text text-transparent">
              for Scientific Laboratories
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-base sm:text-lg md:text-xl font-light leading-relaxed text-slate-300/90">
            High-purity research materials developed for professional laboratory
            and scientific applications.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#documentation"
              className="group inline-flex items-center justify-center px-9 py-4 rounded-sm border border-amber-300/60 bg-amber-300/10 text-amber-100 font-medium text-sm tracking-[0.15em] uppercase transition-all hover:bg-amber-300/20 hover:border-amber-300"
            >
              Request Research Documentation
              <span className="ml-3 transition-transform group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#standards"
              className="inline-flex items-center justify-center px-9 py-4 rounded-sm border border-slate-500/40 text-slate-200 font-medium text-sm tracking-[0.15em] uppercase transition-all hover:border-slate-300/70 hover:text-white"
            >
              Learn More About Our Standards
            </a>
          </div>
        </div>
      </section>

      {/* WHAT WE OFFER */}
      <section className="relative border-t border-white/5 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-5 text-[11px] uppercase tracking-[0.4em] text-amber-200/70">
              Our Offering
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-white">
              What We Offer
            </h2>
            <div className="mx-auto mt-6 h-px w-16 bg-amber-300/50" />
          </div>

          <p className="mx-auto max-w-3xl text-center text-lg sm:text-xl font-light leading-relaxed text-slate-300/90">
            We provide premium-grade research compounds intended strictly for
            laboratory research, analytical studies, and scientific applications.
            All materials are supplied with detailed documentation and meet high
            standards of quality and purity.
          </p>

          <div className="mt-20 grid gap-px bg-white/5 sm:grid-cols-3 overflow-hidden rounded-sm border border-white/5">
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
                className="bg-[#0a1020] p-10 transition-colors hover:bg-[#0d1428]"
              >
                <div className="mb-6 font-serif text-2xl font-light text-amber-300/80">
                  {c.k}
                </div>
                <h3 className="mb-3 text-lg font-medium tracking-wide text-white">
                  {c.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-400">
                  {c.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* INTENDED USE */}
      <section
        id="standards"
        className="relative overflow-hidden border-t border-white/5 py-24 sm:py-32"
      >
        <img
          src={molecularImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1920}
          height={1280}
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#0a1020] via-[#0a1020]/85 to-[#0a1020]"
        />

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <p className="mb-5 text-[11px] uppercase tracking-[0.4em] text-amber-200/70">
            Scope
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-light text-white">
            Intended Use
          </h2>
          <div className="mx-auto mt-6 h-px w-16 bg-amber-300/50" />
          <p className="mt-10 text-lg sm:text-xl font-light leading-relaxed text-slate-300/90">
            All products are intended exclusively for laboratory and scientific
            research purposes. They are not intended for human consumption,
            medical use, or any therapeutic applications.
          </p>
        </div>
      </section>

      {/* DOCUMENTATION CTA */}
      <section id="documentation" className="border-t border-white/5 py-24 sm:py-28">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-light text-white">
            Request Research Documentation
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg font-light leading-relaxed text-slate-300/90">
            Qualified researchers and institutions may request the detailed
            documentation accompanying our premium laboratory research materials.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center px-9 py-4 rounded-sm border border-amber-300/60 bg-amber-300/10 text-amber-100 font-medium text-sm tracking-[0.15em] uppercase transition-all hover:bg-amber-300/20 hover:border-amber-300"
            >
              Contact Our Team
            </Link>
            <Link
              to="/quality-control"
              className="inline-flex items-center justify-center px-9 py-4 rounded-sm border border-slate-500/40 text-slate-200 font-medium text-sm tracking-[0.15em] uppercase transition-all hover:border-slate-300/70 hover:text-white"
            >
              Quality Standards
            </Link>
          </div>
        </div>
      </section>

      {/* STRONG LEGAL DISCLAIMER */}
      <section className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="rounded-sm border border-amber-300/30 bg-gradient-to-b from-amber-500/[0.04] to-transparent p-8 sm:p-12">
            <p className="mb-5 text-center text-[11px] uppercase tracking-[0.4em] text-amber-200/80">
              Legal
            </p>
            <h2 className="text-center font-serif text-2xl sm:text-3xl font-light text-amber-100">
              Legal Disclaimer
            </h2>
            <div className="mx-auto mt-5 h-px w-12 bg-amber-300/40" />
            <p className="mt-8 text-sm sm:text-base leading-relaxed text-amber-100/85">
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
        <div className="mx-auto max-w-6xl px-6 text-center text-xs tracking-wide text-slate-500">
          © {new Date().getFullYear()} PH Labs · United Kingdom · For Research
          Use Only. Not for Human Consumption.
        </div>
      </footer>
    </main>
  );
}
