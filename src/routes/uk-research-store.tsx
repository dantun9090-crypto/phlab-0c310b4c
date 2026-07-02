import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "UK Research Store | Lab-Grade Reference Materials | PH Labs";
const DESCRIPTION =
  "UK research store supplying high-purity reference materials to qualified laboratories. Per-batch analytical documentation, tracked UK dispatch, discreet packaging. For Research Use Only.";
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
    <main className="min-h-screen bg-[#f7f6f3] text-neutral-900 antialiased">
      {/* Compliance bar */}
      <div className="w-full bg-neutral-950 text-white text-center text-[11px] tracking-[0.25em] uppercase py-2 px-4">
        For Research Use Only · Not for Human Consumption · UK Laboratory Supply
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-14 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#8a6a2e] font-medium">
              UK Research Store · PH Labs
            </p>
            <h1 className="mt-5 font-serif text-4xl sm:text-5xl md:text-6xl font-light leading-[1.05] text-neutral-950">
              High-purity <em className="text-[#8a6a2e]">reference materials</em> for UK laboratories.
            </h1>
            <p className="mt-6 text-base md:text-lg text-neutral-700 leading-relaxed max-w-xl">
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
                <li key={b} className="flex items-start gap-2 text-neutral-800">
                  <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#b08a3e]" />
                  {b}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="inline-flex items-center px-8 py-4 rounded-full bg-neutral-950 text-white text-[12px] tracking-[0.2em] uppercase font-medium hover:bg-[#8a6a2e] transition-colors shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
              >
                Browse Catalogue →
              </Link>
              <Link
                to="/quality-control"
                className="inline-flex items-center px-8 py-4 rounded-full border-2 border-[#b08a3e] bg-white text-neutral-900 text-[12px] tracking-[0.2em] uppercase font-medium hover:bg-[#b08a3e]/5 transition-colors"
              >
                Quality Standards
              </Link>
            </div>

            <p className="mt-6 text-xs text-neutral-500">
              Free UK tracked shipping on orders over £75 · Discreet unbranded packaging
            </p>
          </div>

          <div className="relative">
            <div className="rounded-3xl border-2 border-[#b08a3e] bg-white/85 backdrop-blur p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)]">
              <p className="text-[10px] uppercase tracking-[0.4em] text-[#8a6a2e]">Order today</p>
              <p className="mt-3 font-serif text-2xl font-light">
                Order before <em>3pm</em> — dispatched today from our UK facility.
              </p>
              <div className="mt-6 h-px w-12 bg-[#b08a3e]" />
              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-neutral-500 text-[11px] uppercase tracking-wider">Dispatch</dt>
                  <dd className="mt-1 font-medium">Same-day (UK)</dd>
                </div>
                <div>
                  <dt className="text-neutral-500 text-[11px] uppercase tracking-wider">Shipping</dt>
                  <dd className="mt-1 font-medium">Tracked 24 / 48</dd>
                </div>
                <div>
                  <dt className="text-neutral-500 text-[11px] uppercase tracking-wider">Documentation</dt>
                  <dd className="mt-1 font-medium">Per-batch record</dd>
                </div>
                <div>
                  <dt className="text-neutral-500 text-[11px] uppercase tracking-wider">Payment</dt>
                  <dd className="mt-1 font-medium">Card · Open Banking</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="border-y border-[#b08a3e]/40 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { k: "UK", v: "Prepared & dispatched" },
            { k: "≥ 99%", v: "Analytical purity" },
            { k: "24 / 48", v: "Tracked delivery" },
            { k: "Per-batch", v: "Documentation" },
          ].map((s) => (
            <div key={s.k}>
              <p className="font-serif text-3xl md:text-4xl font-light text-neutral-950">{s.k}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-neutral-600">{s.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY PH LABS */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.5em] text-[#8a6a2e]">Why PH Labs</p>
          <h2 className="mt-4 font-serif text-3xl md:text-4xl font-light">
            A UK laboratory built for <em>reproducible research</em>.
          </h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-8">
          {[
            {
              t: "Verified purity",
              d: "Every batch is independently analysed and released against a documented purity threshold before it reaches your bench.",
            },
            {
              t: "Traceable provenance",
              d: "Per-batch records travel with every shipment, so results can be reproduced and audited by your institution.",
            },
            {
              t: "UK dispatch, discreetly packaged",
              d: "Prepared, stored and shipped from the United Kingdom in unbranded outer packaging via fully tracked services.",
            },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-neutral-200 bg-white p-7">
              <h3 className="font-serif text-xl font-light text-neutral-950">{c.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="bg-white border-y border-[#b08a3e]/40">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-[#8a6a2e]">Researcher feedback</p>
          <blockquote className="mt-6 font-serif text-2xl md:text-3xl font-light leading-snug text-neutral-950">
            <span className="text-[#b08a3e] text-4xl align-top">“</span>
            Documentation is thorough, dispatch is fast and the material has behaved
            consistently across repeat orders. Exactly what we want from a UK supplier.
            <span className="text-[#b08a3e] text-4xl align-top">”</span>
          </blockquote>
          <p className="mt-6 text-[11px] uppercase tracking-[0.3em] text-neutral-500">
            — Verified laboratory customer, England
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <p className="text-[11px] uppercase tracking-[0.5em] text-[#8a6a2e] text-center">Questions</p>
        <h2 className="mt-3 font-serif text-3xl md:text-4xl font-light text-center">
          Frequently asked
        </h2>
        <div className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex justify-between items-start cursor-pointer list-none">
                <span className="font-serif text-lg md:text-xl font-light text-neutral-950 pr-6">
                  {f.q}
                </span>
                <span className="text-[#b08a3e] text-2xl leading-none transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm md:text-[15px] leading-relaxed text-neutral-600">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA BAND */}
      <section className="bg-neutral-950 text-white">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-[#b08a3e]">Ready to order</p>
          <h2 className="mt-4 font-serif text-3xl md:text-5xl font-light">
            Browse the UK research catalogue.
          </h2>
          <p className="mt-4 text-sm md:text-base text-neutral-300 max-w-xl mx-auto">
            Same-day dispatch, per-batch documentation, tracked UK shipping. Supplied
            strictly for laboratory research.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/products"
              className="inline-flex items-center px-10 py-4 rounded-full bg-[#b08a3e] hover:bg-[#8a6a2e] text-white text-[12px] tracking-[0.2em] uppercase font-medium transition-colors"
            >
              View Catalogue →
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center px-10 py-4 rounded-full border border-white/40 hover:bg-white/10 text-white text-[12px] tracking-[0.2em] uppercase font-medium transition-colors"
            >
              Contact the Team
            </Link>
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="bg-[#f7f6f3] py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.5em] text-[#8a6a2e]">Legal</p>
          <h2 className="mt-3 font-serif text-2xl font-light">Research use disclaimer</h2>
          <p className="mt-5 text-sm leading-relaxed text-neutral-600">
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
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#b08a3e]/50 px-4 py-3 flex gap-2 shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.25)]">
        <Link
          to="/products"
          className="flex-1 inline-flex justify-center items-center px-4 py-3 rounded-full bg-neutral-950 text-white text-[11px] tracking-[0.2em] uppercase font-medium"
        >
          Shop catalogue →
        </Link>
        <Link
          to="/contact"
          className="inline-flex justify-center items-center px-4 py-3 rounded-full border-2 border-[#b08a3e] text-neutral-900 text-[11px] tracking-[0.2em] uppercase font-medium"
        >
          Contact
        </Link>
      </div>
    </main>
  );
}
