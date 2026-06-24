import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "Laboratory Research Compounds UK | PH Labs";
const DESCRIPTION =
  "UK supplier of high-purity research compounds for in-vitro laboratory research. HPLC-tested, batch-traceable, strictly for research use only.";
const URL = "https://phlabs.co.uk/research";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: TITLE,
          description: DESCRIPTION,
          url: URL,
          inLanguage: "en-GB",
          isFamilyFriendly: true,
        }),
      },
    ],
  }),
  component: ResearchLandingPage,
});

function ResearchLandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top disclaimer bar — visible above the fold for crawlers + users */}
      <div className="w-full bg-amber-500/10 border-b border-amber-500/30">
        <div className="max-w-5xl mx-auto px-6 py-3 text-center text-sm sm:text-base text-amber-200 font-medium">
          For Research Use Only. Not for Human Consumption.
        </div>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_60%)]"
        />
        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <p className="inline-block uppercase tracking-[0.2em] text-xs sm:text-sm text-emerald-400 font-semibold mb-6">
            UK Laboratory Supply
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight text-white mb-6">
            High-Purity Research Compounds for{" "}
            <span className="text-emerald-400">Laboratory Research</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            HPLC-tested, batch-traceable research materials supplied to UK
            laboratories and academic researchers. Strictly for in-vitro
            research use only.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#offer"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-base transition-colors"
            >
              What we offer
            </a>
            <a
              href="#intended-use"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-100 font-semibold text-base transition-colors"
            >
              Intended use
            </a>
          </div>
        </div>
      </section>

      {/* WHAT WE OFFER */}
      <section id="offer" className="py-20 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-center">
            What we offer
          </h2>
          <p className="text-slate-400 text-center max-w-2xl mx-auto mb-14">
            A focused catalogue of research-grade compounds supplied to
            qualified UK laboratories and research institutions.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "HPLC-Tested Purity",
                body: "Every batch is verified by High-Performance Liquid Chromatography with a Certificate of Analysis available on request.",
              },
              {
                title: "Batch Traceability",
                body: "Each unit is assigned a batch identifier so researchers can match material to its corresponding analytical record.",
              },
              {
                title: "Research-Grade Materials",
                body: "General research compounds intended exclusively for in-vitro laboratory investigation and method development.",
              },
              {
                title: "UK Dispatch",
                body: "Stocked and dispatched from the United Kingdom with tracked delivery to laboratories and research facilities.",
              },
              {
                title: "Cold-Chain Awareness",
                body: "Guidance on storage, handling and reconstitution provided to support reproducible laboratory workflows.",
              },
              {
                title: "Discreet Packaging",
                body: "Compounds are shipped in secure, temperature-aware packaging suitable for laboratory delivery.",
              },
            ].map((card) => (
              <article
                key={card.title}
                className="rounded-xl bg-slate-900 border border-slate-800 p-6 hover:border-emerald-500/40 transition-colors"
              >
                <h3 className="text-lg font-semibold text-white mb-2">
                  {card.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* INTENDED USE */}
      <section
        id="intended-use"
        className="py-20 border-t border-slate-800 bg-slate-900/40"
      >
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 text-center">
            Intended Use
          </h2>
          <div className="space-y-5 text-slate-300 text-base sm:text-lg leading-relaxed">
            <p>
              All materials supplied by PH Labs are intended{" "}
              <strong className="text-white">
                exclusively for in-vitro laboratory research
              </strong>{" "}
              by qualified researchers, scientific professionals and academic
              institutions.
            </p>
            <p>
              Our products are{" "}
              <strong className="text-white">not medicines</strong> and are{" "}
              <strong className="text-white">
                not intended for human or veterinary consumption, diagnostic
                use, therapeutic use, or any form of clinical application
              </strong>
              .
            </p>
            <p>
              By purchasing from PH Labs, you confirm that you are a qualified
              professional acquiring research materials solely for legitimate
              scientific investigation within an appropriately equipped
              laboratory environment.
            </p>
          </div>
        </div>
      </section>

      {/* LEGAL DISCLAIMER (bottom, strong) */}
      <section className="py-16 border-t border-slate-800">
        <div className="max-w-4xl mx-auto px-6">
          <div className="rounded-2xl border-2 border-amber-500/50 bg-amber-500/5 p-8 sm:p-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-amber-300 mb-4 text-center">
              Legal Disclaimer
            </h2>
            <div className="space-y-4 text-amber-100/90 text-sm sm:text-base leading-relaxed">
              <p>
                <strong>For Research Use Only. Not for Human Consumption.</strong>{" "}
                All compounds offered by PH Labs are sold strictly as research
                materials for in-vitro laboratory use by qualified researchers.
              </p>
              <p>
                These products are not drugs, not food, not cosmetics and not
                supplements. They are not intended to diagnose, treat, cure or
                prevent any disease or medical condition, and they must not be
                administered to humans or animals under any circumstances.
              </p>
              <p>
                It is the sole responsibility of the purchaser to ensure that
                all materials are handled in accordance with applicable laws,
                regulations and laboratory safety standards within their
                jurisdiction. Misuse of research materials is strictly
                prohibited.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* BACK TO HOME */}
      <section className="py-16 border-t border-slate-800 bg-slate-900/40">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-4">
            Visit the main PH Labs website
          </h2>
          <p className="text-slate-400 mb-8">
            Explore the full PH Labs catalogue and learn more about our UK
            laboratory supply service.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center px-8 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-base transition-colors"
          >
            Back to homepage
          </Link>
        </div>
      </section>

      <footer className="py-10 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs sm:text-sm text-slate-400">
          © {new Date().getFullYear()} PH Labs · United Kingdom · For Research
          Use Only. Not for Human Consumption.
        </div>
      </footer>
    </main>
  );
}
