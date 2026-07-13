import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "UK Research Store | Lab-Grade Reference Materials | PH Labs";
const DESCRIPTION =
  "UK laboratory supply of high-purity reference materials. Per-batch documentation, tracked dispatch. For Research Use Only.";
const URL = "https://phlabs.co.uk/uk-research-store";
const OG_IMAGE = "https://phlabs.co.uk/og/compound.jpg";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Who can order from PH Labs?",
    a: "Orders are accepted from qualified researchers, academic institutions and analytical laboratories based in the United Kingdom. All materials are supplied strictly for laboratory research.",
  },
  {
    q: "What documentation is provided with each order?",
    a: "Every shipment includes per-batch analytical records so results can be reproduced and audited under standard laboratory conditions.",
  },
  {
    q: "How quickly are orders dispatched?",
    a: "UK orders placed before 3pm on working days are prepared and dispatched the same day via a fully tracked service. Discreet, unbranded outer packaging.",
  },
  {
    q: "Are the materials intended for human use?",
    a: "No. All items listed are strictly For Research Use Only and are not intended for human or veterinary use, nor for any non-research application.",
  },
];

export const Route = createFileRoute("/uk-research-store")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "640" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
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
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://phlabs.co.uk/" },
            { "@type": "ListItem", position: 2, name: "UK Research Store", item: URL },
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: UkResearchStore,
});

function UkResearchStore() {
  return (
    <main className="min-h-screen bg-slate-950 text-white antialiased pb-24 md:pb-0">
      {/* Compliance bar */}
      <div className="w-full bg-black text-emerald-400 text-center text-[11px] tracking-[0.25em] uppercase py-2 px-4 border-b border-emerald-500/20">
        For Research Use Only · Not for Human Consumption · UK Laboratory Supply
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* ambient gradients */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
          <div className="absolute top-20 right-0 h-[400px] w-[400px] rounded-full bg-emerald-400/5 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-14 md:pt-20 md:pb-24 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              UK Research Store · PH Labs
            </span>
            <h1 className="mt-6 font-sans text-4xl sm:text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight text-white">
              High-purity{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
                reference materials
              </span>{" "}
              for UK laboratories.
            </h1>
            <p className="mt-6 text-base md:text-lg text-slate-300 leading-relaxed max-w-xl">
              Per-batch analytical documentation, same-day UK dispatch and discreet
              tracked shipping — trusted by researchers and institutions across the
              United Kingdom.
            </p>

            <ul className="mt-7 grid grid-cols-2 gap-3 max-w-lg text-sm">
              {[
                "≥ 99% analytical purity",
                "Per-batch documentation",
                "Same-day UK dispatch",
                "Fully tracked shipping",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2 text-slate-200">
                  <svg
                    className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-all shadow-[0_20px_50px_-15px_rgba(16,185,129,0.6)] hover:shadow-[0_25px_60px_-15px_rgba(16,185,129,0.8)] hover:-translate-y-0.5"
              >
                Browse Catalogue
                <span aria-hidden>→</span>
              </Link>
              <Link
                to="/quality-control"
                className="inline-flex items-center px-7 py-4 rounded-xl border border-slate-700 bg-slate-900/60 backdrop-blur hover:border-emerald-500/50 hover:bg-slate-900 text-white text-sm font-semibold transition-colors"
              >
                Quality Standards
              </Link>
            </div>

            <p className="mt-6 text-xs text-slate-400">
              Free UK tracked shipping on orders over £75 · Discreet unbranded packaging
            </p>
          </div>

          <div className="relative">
            <div className="relative rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-xl p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-emerald-500/30 via-transparent to-transparent pointer-events-none opacity-60" />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-300 font-medium">
                    Dispatching now
                  </p>
                </div>
                <p className="mt-4 text-2xl font-semibold text-white leading-snug">
                  Order before{" "}
                  <span className="text-emerald-400">3&nbsp;PM</span> — dispatched
                  today from our UK facility.
                </p>
                <div className="mt-6 h-px w-full bg-gradient-to-r from-emerald-500/40 via-slate-700 to-transparent" />
                <dl className="mt-6 grid grid-cols-2 gap-5 text-sm">
                  {[
                    { k: "Dispatch", v: "Same-day (UK)" },
                    { k: "Shipping", v: "Tracked 24 / 48" },
                    { k: "Documentation", v: "Per-batch record" },
                    { k: "Payment", v: "Card · Open Banking" },
                  ].map((d) => (
                    <div key={d.k}>
                      <dt className="text-slate-400 text-[10px] uppercase tracking-[0.2em]">
                        {d.k}
                      </dt>
                      <dd className="mt-2 font-medium text-white">{d.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 md:py-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { k: "UK", v: "Prepared & dispatched" },
            { k: "≥ 99%", v: "Analytical purity" },
            { k: "24 / 48", v: "Tracked delivery" },
            { k: "Per-batch", v: "Documentation" },
          ].map((s) => (
            <div key={s.k}>
              <p className="text-3xl md:text-4xl font-semibold bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
                {s.k}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                {s.v}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY PH LABS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 md:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.5em] text-emerald-400">
            Why PH Labs
          </p>
          <h2 className="mt-4 font-sans text-3xl md:text-4xl font-semibold tracking-tight text-white">
            A UK laboratory built for{" "}
            <span className="text-emerald-400">reproducible research</span>.
          </h2>
        </div>
        <div className="mt-10 md:mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              t: "Verified purity",
              d: "Every batch is independently analysed and released against a documented purity threshold before it reaches your bench.",
              i: (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              ),
            },
            {
              t: "Traceable provenance",
              d: "Per-batch records travel with every shipment, so results can be reproduced and audited by your institution.",
              i: (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              ),
            },
            {
              t: "UK dispatch, discreet",
              d: "Prepared, stored and shipped from the United Kingdom in unbranded outer packaging via fully tracked services.",
              i: (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              ),
            },
          ].map((c) => (
            <div
              key={c.t}
              className="group relative rounded-2xl border border-slate-800 bg-slate-900/60 p-7 transition-all hover:border-emerald-500/40 hover:bg-slate-900 hover:-translate-y-1"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  {c.i}
                </svg>
              </div>
              <h3 className="mt-5 font-sans text-xl font-semibold text-white">{c.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="border-y border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 md:py-20 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-emerald-400">
            Researcher feedback
          </p>
          <blockquote className="mt-6 text-2xl md:text-3xl font-medium leading-snug text-white">
            <span className="text-emerald-400 text-4xl align-top leading-none">“</span>
            Documentation is thorough, dispatch is fast and the material has behaved
            consistently across repeat orders. Exactly what we want from a UK supplier.
            <span className="text-emerald-400 text-4xl align-top leading-none">”</span>
          </blockquote>
          <p className="mt-6 text-[11px] uppercase tracking-[0.3em] text-slate-400">
            — Verified laboratory customer, England
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-14 md:py-20">
        <p className="text-[11px] uppercase tracking-[0.5em] text-emerald-400 text-center">
          Questions
        </p>
        <h2 className="mt-4 font-sans text-3xl md:text-4xl font-semibold text-center text-white tracking-tight">
          Frequently asked
        </h2>
        <div className="mt-10 md:mt-12 space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors"
            >
              <summary className="flex justify-between items-start cursor-pointer list-none p-5">
                <span className="text-base md:text-lg font-semibold text-white pr-6">
                  {f.q}
                </span>
                <span className="text-emerald-400 text-2xl leading-none transition-transform group-open:rotate-45 flex-shrink-0">
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-sm md:text-[15px] leading-relaxed text-slate-400">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA BAND */}
      <section className="relative overflow-hidden border-y border-emerald-500/20">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-slate-950 to-slate-950" />
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-14 md:py-20 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-emerald-400">
            Ready to order
          </p>
          <h2 className="mt-4 font-sans text-3xl md:text-5xl font-semibold text-white tracking-tight">
            Browse the UK research catalogue.
          </h2>
          <p className="mt-4 text-sm md:text-base text-slate-300 max-w-xl mx-auto">
            Same-day dispatch, per-batch documentation, tracked UK shipping. Supplied
            strictly for laboratory research.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-all shadow-[0_20px_50px_-15px_rgba(16,185,129,0.6)] hover:-translate-y-0.5"
            >
              View Catalogue <span aria-hidden>→</span>
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center px-8 py-4 rounded-xl border border-slate-700 bg-slate-900/60 backdrop-blur hover:border-emerald-500/50 hover:bg-slate-900 text-white text-sm font-semibold transition-colors"
            >
              Contact the Team
            </Link>
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-emerald-400">Legal</p>
          <h2 className="mt-3 font-sans text-2xl font-semibold text-white">
            Research use disclaimer
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            All items supplied via this website are intended solely for laboratory
            research and scientific purposes. They are not intended for human or
            veterinary use, nor for any non-research application. By accessing this
            website or placing an order, you confirm that you are a qualified
            researcher or institution and that you will comply with all applicable
            laws and regulations regarding the handling and use of research
            materials. For Research Use Only. Not for Human Consumption.
          </p>
        </div>
      </section>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-emerald-500/30 px-4 py-3 flex gap-2 shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.6)]">
        <Link
          to="/products"
          className="flex-1 inline-flex justify-center items-center px-4 py-3 rounded-xl bg-emerald-500 text-slate-950 text-sm font-semibold"
        >
          Shop catalogue →
        </Link>
        <Link
          to="/contact"
          className="inline-flex justify-center items-center px-5 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white text-sm font-semibold"
        >
          Contact
        </Link>
      </div>
    </main>
  );
}
