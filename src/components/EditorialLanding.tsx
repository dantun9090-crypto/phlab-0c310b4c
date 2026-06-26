import { Link } from "@tanstack/react-router";
import heroImg from "@/assets/lab-luxury-hero.jpg";
import detailImg from "@/assets/lab-luxury-detail.jpg";
import wideImg from "@/assets/lab-luxury-wide.jpg";
import { LandingPromoStrip } from "@/components/LandingPromoStrip";

/**
 * /landing/phlabs — Moser-inspired editorial luxury layout.
 * Full-bleed laboratory cover, magazine grid, gold detailing.
 */
export function EditorialLanding({ eyebrow }: { eyebrow?: string }) {
  const headlineWords = ["Precision.", "Purity.", "Provenance."];
  return (
    <main className="min-h-screen bg-[#f7f6f3] text-neutral-900 antialiased selection:bg-[#b08a3e] selection:text-white">
      <style>{`
        @keyframes edRise {
          0% { opacity: 0; transform: translateY(36px) skewY(2deg); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0) skewY(0); filter: blur(0); }
        }
        @keyframes edFade { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes edScale {
          0% { opacity: 0; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes edLine { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        @keyframes edDrift {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes edKen {
          0% { transform: scale(1.05); }
          100% { transform: scale(1.18); }
        }
        .ed-rise { opacity: 0; display: inline-block; animation: edRise 1.1s cubic-bezier(.2,.7,.2,1) forwards; }
        .ed-fade { opacity: 0; animation: edFade 1.4s ease forwards; }
        .ed-scale { opacity: 0; animation: edScale 1.6s cubic-bezier(.2,.7,.2,1) forwards; }
        .ed-line { transform-origin: left; animation: edLine 1.2s cubic-bezier(.7,.2,.2,1) forwards; }
        .ed-drift { animation: edDrift 7s ease-in-out infinite; }
        .ed-ken { animation: edKen 20s ease-in-out infinite alternate; }
        .ed-d1 { animation-delay: .1s; } .ed-d2 { animation-delay: .25s; }
        .ed-d3 { animation-delay: .4s; } .ed-d4 { animation-delay: .55s; }
        .ed-d5 { animation-delay: .7s; } .ed-d6 { animation-delay: .9s; }
        .ed-d7 { animation-delay: 1.1s; }
        .gold { color: #b08a3e; }
        .gold-bg { background-color: #b08a3e; }
        .gold-border { border-color: #b08a3e; }
      `}</style>

      {/* MASTHEAD */}
      <header className="border-b gold-border bg-white/85 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between text-[11px] uppercase tracking-[0.35em] text-neutral-700">
          <span className="ed-fade ed-d1 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full gold-bg" />
            PH Labs
          </span>
          <span className="ed-fade ed-d2 hidden md:inline gold">№ 01 · Volume MMXXVI</span>
          <span className="ed-fade ed-d3">For Research Use Only</span>
        </div>
      </header>

      {/* HERO — full-bleed magazine cover */}
      <section className="relative overflow-hidden min-h-[92vh] flex items-end">
        <img
          src={heroImg}
          alt=""
          aria-hidden="true"
          width={1920}
          height={1280}
          className="ed-ken absolute inset-0 h-full w-full object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#f7f6f3]/30 via-transparent to-[#f7f6f3]" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#f7f6f3]/70 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-7xl px-6 pt-32 pb-20 lg:pt-40 lg:pb-28 grid grid-cols-12 gap-6 lg:gap-10 items-end w-full">
          <div className="col-span-12 lg:col-span-8">
            {eyebrow ? (
              <div className="ed-fade ed-d1 mb-8 inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.4em] text-neutral-700">
                <span className="ed-line block h-px w-12 gold-bg" />
                {eyebrow}
              </div>
            ) : null}

            <h1 className="font-serif font-light tracking-tight text-neutral-950 text-[3rem] leading-[0.95] sm:text-[4.5rem] md:text-[6rem] lg:text-[7.5rem]">
              {headlineWords.map((w, i) => (
                <span
                  key={w}
                  className="ed-rise block italic"
                  style={{
                    animationDelay: `${0.15 + i * 0.18}s`,
                    color: i === 1 ? '#8a6a2e' : undefined,
                  }}
                >
                  {w}
                </span>
              ))}
            </h1>

            <p className="ed-fade ed-d6 mt-10 max-w-xl text-base sm:text-lg font-light leading-relaxed text-neutral-800">
              A United Kingdom laboratory supplying high-purity research
              materials for scientific institutions and qualified researchers.
            </p>

            <div className="ed-fade ed-d7 mt-10 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="group inline-flex items-center px-8 py-3.5 rounded-full bg-neutral-950 text-white text-[11px] tracking-[0.2em] uppercase font-medium transition-all hover:bg-[#8a6a2e] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
              >
                Request Documentation
                <span className="ml-3 transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link
                to="/quality-control"
                className="inline-flex items-center px-8 py-3.5 rounded-full border gold-border bg-white/80 backdrop-blur text-neutral-900 text-[11px] tracking-[0.2em] uppercase font-medium transition-colors hover:bg-white"
              >
                Quality Standards
              </Link>
            </div>
          </div>

          {/* cover plate label */}
          <div className="col-span-12 lg:col-span-4 lg:justify-self-end">
            <div className="ed-scale ed-d4 ed-drift rounded-2xl border gold-border bg-white/85 backdrop-blur px-7 py-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.4)] max-w-xs">
              <p className="text-[10px] uppercase tracking-[0.4em] gold">Plate 01</p>
              <p className="mt-3 font-serif text-2xl font-light text-neutral-950 leading-tight">
                Laboratory <em>interior</em>, United Kingdom.
              </p>
              <div className="mt-5 h-px w-10 gold-bg" />
              <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-neutral-600">Controlled conditions</p>
            </div>
          </div>
        </div>
      </section>

      {/* INDEX TABLE — over subtle lab backdrop */}
      <section className="relative border-y gold-border bg-white overflow-hidden">
        <img
          src={wideImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.08]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white via-white/95 to-white" />
        <div className="relative mx-auto max-w-7xl px-6 py-20">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 md:col-span-3">
              <p className="text-[11px] uppercase tracking-[0.5em] gold">The Index</p>
              <h2 className="mt-4 font-serif text-3xl md:text-4xl font-light text-neutral-950">
                Inside this <em>volume</em>
              </h2>
              <div className="mt-6 h-px w-12 gold-bg" />
            </div>
            <ol className="col-span-12 md:col-span-9 divide-y divide-neutral-200 border-t border-neutral-200">
              {[
                { n: "I", title: "Analytical Documentation", body: "Detailed batch records supporting reproducible laboratory workflows." },
                { n: "II", title: "Verified Purity Standards", body: "Rigorous quality benchmarks for advanced research compounds." },
                { n: "III", title: "Laboratory-Grade Supply", body: "Prepared, stored and dispatched under controlled UK conditions." },
                { n: "IV", title: "Per-Batch Provenance", body: "Traceable records accompany every shipment to qualified institutions." },
              ].map((row) => (
                <li key={row.n} className="grid grid-cols-12 gap-6 py-8 group">
                  <div className="col-span-2 md:col-span-1 font-serif text-2xl font-light gold transition-colors">{row.n}</div>
                  <div className="col-span-10 md:col-span-7">
                    <h3 className="font-serif text-xl md:text-2xl font-light text-neutral-950 group-hover:italic transition-all">{row.title}</h3>
                  </div>
                  <p className="col-span-12 md:col-span-4 text-sm leading-relaxed text-neutral-600">{row.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* PULL QUOTE — vial photography */}
      <section className="relative overflow-hidden py-32 sm:py-44">
        <img
          src={detailImg}
          alt=""
          aria-hidden="true"
          loading="lazy"
          width={1600}
          height={1200}
          className="ed-ken absolute inset-0 h-full w-full object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-[#f7f6f3]/85 via-[#f7f6f3]/55 to-[#f7f6f3]/95" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] gold">A note on intent</p>
          <blockquote className="mt-10 font-serif text-[1.75rem] sm:text-4xl md:text-5xl font-light leading-[1.2] text-neutral-950">
            <span className="gold text-5xl">“</span>
            For laboratory and scientific research purposes only. Not for human
            consumption, medical use, or therapeutic application.
            <span className="gold text-5xl">”</span>
          </blockquote>
          <div className="mx-auto mt-10 h-px w-12 gold-bg" />
          <p className="mt-6 text-[11px] uppercase tracking-[0.4em] text-neutral-600">— PH Labs Editorial Standard</p>
        </div>
      </section>

      {/* COLOPHON */}
      <section className="border-t gold-border bg-white py-20">
        <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 md:grid-cols-4 gap-10">
          {[
            { k: "Origin", t: "United Kingdom", s: "Prepared, stored and dispatched." },
            { k: "Standard", t: "Verified Purity", s: "Per-batch analytical records." },
            { k: "Audience", t: "Qualified Researchers", s: "Institutions & scientific professionals." },
          ].map((c) => (
            <div key={c.k}>
              <p className="text-[10px] uppercase tracking-[0.4em] gold">{c.k}</p>
              <p className="mt-3 font-serif text-2xl font-light text-neutral-950">{c.t}</p>
              <p className="mt-2 text-sm text-neutral-600">{c.s}</p>
            </div>
          ))}
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] gold">Contact</p>
            <Link to="/contact" className="mt-3 inline-block font-serif text-2xl font-light text-neutral-950 underline-offset-4 hover:underline decoration-[#b08a3e]">
              Reach the team →
            </Link>
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="bg-[#f7f6f3] py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
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
      </section>

      <footer className="border-t gold-border bg-white py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-neutral-500 text-center">
          <span>© {new Date().getFullYear()} PH Labs · United Kingdom</span>
          <span className="gold">For Research Use Only · Not for Human Consumption</span>
        </div>
      </footer>
    </main>
  );
}
