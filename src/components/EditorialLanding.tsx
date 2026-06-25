import { Link } from "@tanstack/react-router";
import editorialImg from "@/assets/premium-lab-editorial.jpg";
import molecularImg from "@/assets/premium-molecular.jpg";

/**
 * /landing/phlabs — editorial magazine layout.
 * Distinct from /compound. Brand-neutral. No substance names.
 */
export function EditorialLanding({ eyebrow }: { eyebrow?: string }) {
  return (
    <main className="min-h-screen bg-[#f6f3ec] text-[#0c111d] antialiased selection:bg-[#0c111d] selection:text-[#f6f3ec]">
      {/* MASTHEAD */}
      <header className="border-b border-[#0c111d]/15">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 text-[10px] uppercase tracking-[0.32em] text-[#0c111d]/70">
          <span className="font-serif text-base italic tracking-normal text-[#0c111d]">PH Labs</span>
          <span className="hidden sm:inline">{eyebrow ?? "Laboratory Editorial"}</span>
          <span>Vol. {new Date().getFullYear()} · UK</span>
        </div>
      </header>

      {/* IMPORTANT NOTICE */}
      <div className="border-b border-[#0c111d]/15 bg-[#0c111d] text-[#f6f3ec]">
        <div className="mx-auto max-w-[1400px] px-6 py-3 text-center text-[11px] uppercase tracking-[0.3em]">
          Important Notice — Research compounds for laboratory & scientific use only. Not for human consumption.
        </div>
      </div>

      {/* HERO — magazine cover */}
      <section className="relative border-b border-[#0c111d]/15">
        <div className="mx-auto max-w-[1400px] px-6 pt-16 pb-24 lg:pt-24 lg:pb-32">
          <div className="grid grid-cols-12 gap-6">
            {/* vertical brand rail */}
            <div className="hidden lg:flex col-span-1 items-start justify-center">
              <div className="sticky top-24 [writing-mode:vertical-rl] rotate-180 text-[10px] uppercase tracking-[0.5em] text-[#0c111d]/50">
                № 01 — Premium Research Compounds
              </div>
            </div>

            <div className="col-span-12 lg:col-span-11">
              <p className="text-[11px] uppercase tracking-[0.4em] text-[#8a6a1f]">
                Issue 001 · Scientific Supply
              </p>
              <h1 className="mt-8 font-serif text-[2.75rem] leading-[0.98] sm:text-6xl md:text-7xl lg:text-[8.5rem] font-light tracking-[-0.02em] text-[#0c111d]">
                Premium
                <br />
                Research
                <br />
                <span className="italic text-[#8a6a1f]">Compounds.</span>
              </h1>

              <div className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-10 items-end">
                <p className="md:col-span-7 text-lg md:text-xl font-light leading-relaxed text-[#0c111d]/80">
                  High-purity research materials developed for professional
                  laboratory and scientific applications — supplied with
                  detailed documentation under controlled conditions in the
                  United Kingdom.
                </p>
                <div className="md:col-span-5 flex flex-col sm:flex-row gap-3">
                  <a
                    href="#documentation"
                    className="group inline-flex items-center justify-between gap-4 px-6 py-4 bg-[#0c111d] text-[#f6f3ec] text-[11px] uppercase tracking-[0.25em] font-medium transition-colors hover:bg-[#8a6a1f]"
                  >
                    Request Documentation <span>→</span>
                  </a>
                  <a
                    href="#standards"
                    className="inline-flex items-center justify-between gap-4 px-6 py-4 border border-[#0c111d]/30 text-[#0c111d] text-[11px] uppercase tracking-[0.25em] font-medium transition-colors hover:border-[#0c111d]"
                  >
                    Our Standards <span>→</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* full-bleed hero image */}
        <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden">
          <img
            src={editorialImg}
            alt=""
            aria-hidden="true"
            width={1600}
            height={900}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0c111d]/60 to-transparent p-6 sm:p-10">
            <div className="mx-auto max-w-[1400px] flex items-end justify-between gap-6">
              <p className="font-serif italic text-[#f6f3ec] text-sm sm:text-base max-w-md">
                Laboratory-grade supply, prepared under controlled conditions.
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#f6f3ec]/70">
                Plate I
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT WE OFFER — index table */}
      <section className="border-b border-[#0c111d]/15 py-24 sm:py-32">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="grid grid-cols-12 gap-6 mb-16">
            <div className="col-span-12 md:col-span-3">
              <p className="text-[11px] uppercase tracking-[0.4em] text-[#8a6a1f]">Chapter I</p>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="font-serif text-4xl md:text-6xl font-light tracking-tight text-[#0c111d]">
                What we offer.
              </h2>
              <p className="mt-8 max-w-2xl text-base md:text-lg font-light leading-relaxed text-[#0c111d]/75">
                We provide premium-grade research compounds intended strictly
                for laboratory research, analytical studies, and scientific
                applications. All materials are supplied with detailed
                documentation and meet high standards of quality and purity.
              </p>
            </div>
          </div>

          <ol className="border-t border-[#0c111d]/20">
            {[
              {
                k: "I",
                title: "Analytical Documentation",
                meta: "Per batch",
                body: "Detailed analytical records supporting reproducible laboratory workflows.",
              },
              {
                k: "II",
                title: "Verified Purity Standards",
                meta: "Quality benchmarks",
                body: "Materials evaluated against rigorous benchmarks established for advanced scientific research compounds.",
              },
              {
                k: "III",
                title: "Laboratory-Grade Supply",
                meta: "Controlled handling",
                body: "Premium laboratory research materials prepared, stored and dispatched under controlled conditions.",
              },
            ].map((c) => (
              <li
                key={c.k}
                className="group grid grid-cols-12 gap-6 items-baseline border-b border-[#0c111d]/20 py-8 md:py-10 transition-colors hover:bg-[#0c111d]/[0.03]"
              >
                <span className="col-span-2 md:col-span-1 font-serif text-2xl md:text-3xl italic text-[#8a6a1f]">
                  {c.k}.
                </span>
                <div className="col-span-10 md:col-span-5">
                  <h3 className="font-serif text-2xl md:text-3xl font-light text-[#0c111d]">
                    {c.title}
                  </h3>
                </div>
                <p className="col-span-12 md:col-span-5 text-sm md:text-base leading-relaxed text-[#0c111d]/70">
                  {c.body}
                </p>
                <span className="col-span-12 md:col-span-1 text-right text-[10px] uppercase tracking-[0.3em] text-[#0c111d]/50">
                  {c.meta}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* INTENDED USE — dark band with overlaid serif */}
      <section
        id="standards"
        className="relative bg-[#0c111d] text-[#f6f3ec] py-28 sm:py-40 overflow-hidden"
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
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c111d] via-[#0c111d]/80 to-[#0c111d]" />
        <div className="relative mx-auto max-w-[1400px] px-6 grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3">
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#d4af55]">Chapter II</p>
            <p className="mt-3 font-serif italic text-xl text-[#f6f3ec]/70">Intended Use</p>
          </div>
          <div className="col-span-12 md:col-span-9">
            <p className="font-serif text-3xl sm:text-4xl md:text-5xl font-light leading-[1.2] tracking-tight">
              All products are intended{" "}
              <span className="italic text-[#d4af55]">exclusively</span>{" "}
              for laboratory and scientific research purposes. They are not
              intended for human consumption, medical use, or any therapeutic
              applications.
            </p>
          </div>
        </div>
      </section>

      {/* DOCUMENTATION */}
      <section
        id="documentation"
        className="border-b border-[#0c111d]/15 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 md:col-span-3">
              <p className="text-[11px] uppercase tracking-[0.4em] text-[#8a6a1f]">Chapter III</p>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="font-serif text-4xl md:text-6xl font-light tracking-tight">
                Request research
                <br />
                <span className="italic text-[#8a6a1f]">documentation.</span>
              </h2>
              <p className="mt-8 max-w-2xl text-base md:text-lg font-light leading-relaxed text-[#0c111d]/75">
                Qualified researchers and institutions may request the detailed
                documentation accompanying our premium laboratory research
                materials.
              </p>
              <div className="mt-12 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-between gap-6 px-7 py-4 bg-[#0c111d] text-[#f6f3ec] text-[11px] uppercase tracking-[0.25em] font-medium transition-colors hover:bg-[#8a6a1f]"
                >
                  Contact Our Team <span>→</span>
                </Link>
                <Link
                  to="/quality-control"
                  className="inline-flex items-center justify-between gap-6 px-7 py-4 border border-[#0c111d]/30 text-[#0c111d] text-[11px] uppercase tracking-[0.25em] font-medium transition-colors hover:border-[#0c111d]"
                >
                  Quality Standards <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LEGAL */}
      <section className="bg-[#ebe6da] py-20">
        <div className="mx-auto max-w-[1400px] px-6 grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-3">
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#8a6a1f]">Colophon</p>
            <h2 className="mt-3 font-serif text-3xl font-light italic text-[#0c111d]">
              Legal Disclaimer
            </h2>
          </div>
          <div className="col-span-12 md:col-span-9 md:columns-2 md:gap-10 text-[13px] sm:text-sm leading-relaxed text-[#0c111d]/85">
            <p>
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

      {/* FOOTER */}
      <footer className="bg-[#0c111d] text-[#f6f3ec]/70 py-10">
        <div className="mx-auto max-w-[1400px] px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] uppercase tracking-[0.3em]">
          <span className="font-serif italic text-base normal-case tracking-normal text-[#f6f3ec]">PH Labs</span>
          <span>© {new Date().getFullYear()} · United Kingdom</span>
          <span>For Research Use Only</span>
        </div>
      </footer>
    </main>
  );
}
