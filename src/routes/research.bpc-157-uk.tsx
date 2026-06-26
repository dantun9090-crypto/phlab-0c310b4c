/**
 * BPC-157 UK pillar page — /research/bpc-157-uk
 *
 * Captures the high-volume "bpc 157 uk" / "bpc-157 uk" research queries.
 * Long-form, research-only, compliance-safe. Links inward to PDP, hub
 * category, related comparison pages, and the tissue-repair cluster.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/bpc-157-uk`;
const TITLE = "BPC-157 UK | Research Peptide Reference Hub | PH Labs";
const DESCRIPTION =
  "BPC-157 (Body Protection Compound) research reference for UK laboratories: structure, in-vitro pharmacology, HPLC QC, storage, citations. Research use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is BPC-157?",
    a: "BPC-157 (Body Protection Compound 157) is a synthetic 15-amino-acid pentadecapeptide derived from a partial sequence of human gastric juice protein BPC. Sequence: Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val. Molecular formula C62H98N16O22, monoisotopic mass ≈ 1419 Da.",
  },
  {
    q: "Where can UK research labs source BPC-157 reference material?",
    a: "PH Labs supplies BPC-157 as a lyophilised reference compound for in-vitro tissue-repair and angiogenesis research in UK laboratories. Every vial ships with a batch-specific Certificate of Analysis covering HPLC purity (≥99.0%), LC-MS identity, residual solvents, water content (Karl Fischer), and endotoxin (LAL).",
  },
  {
    q: "What in-vitro assays use BPC-157 as a reference?",
    a: "Scratch / wound-closure assays in HUVEC and L929 fibroblast monolayers; tube-formation assays on Matrigel for angiogenesis endpoints; VEGFR2 phosphorylation in HUVEC lysates by Western blot; nitric-oxide release assays via Griess reagent. Working concentrations typically span 1 nM–10 µM.",
  },
  {
    q: "How is BPC-157 stored and reconstituted in the laboratory?",
    a: "Store the sealed lyophilised vial at −20 °C or below, protected from light. Reconstitute in sterile bacteriostatic water or 0.9% saline. Aliquot into single-use volumes and refreeze at −20 °C; avoid more than three freeze-thaw cycles. Working solutions held at 2–8 °C should be used within 14 days.",
  },
  {
    q: "How does BPC-157 differ from TB-500 in tissue-repair assays?",
    a: "BPC-157 acts predominantly through nitric-oxide / VEGFR2 angiogenic signalling and growth-factor receptor modulation. TB-500 (thymosin β4 fragment) acts via G-actin sequestration and cell-migration regulation. The two are commonly used in parallel as orthogonal reference compounds in comparative wound-closure panels.",
  },
  {
    q: "Is BPC-157 stable in gastric / plasma stability assays?",
    a: "Published in-vitro stability data (Sikiric et al.) indicate BPC-157 is resistant to enzymatic degradation in simulated gastric juice for ≥24 hours at 37 °C — an unusual feature among small peptides and a driver of its use as a reference compound in oral-stability research.",
  },
  {
    q: "What antagonists are used alongside BPC-157?",
    a: "L-NAME (NOS inhibitor) and SU5416 (VEGFR2 inhibitor) are commonly co-administered in in-vitro angiogenesis panels to deconvolute the nitric-oxide and VEGFR2 contributions to the BPC-157 response.",
  },
  {
    q: "Is BPC-157 approved for human use?",
    a: "No. BPC-157 is an investigational compound. It is not approved by the MHRA, EMA, or FDA for any therapeutic indication. PH Labs supplies it strictly as a reference material for in-vitro research and analytical use. Not for human consumption.",
  },
];

const REFERENCES = [
  { citation: "Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des.", doi: "10.2174/1381612824666180510104516" },
  { citation: "Chang C.H. et al. (2011). The promoting effect of pentadecapeptide BPC 157 on tendon healing. J Appl Physiol.", doi: "10.1152/japplphysiol.00782.2010" },
  { citation: "Hsieh M.J. et al. (2017). Therapeutic potential of BPC-157 — Angiogenesis via VEGFR2-Akt-eNOS. Mol Med Reports.", doi: "10.3892/mmr.2017.7421" },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "BPC-157 UK — Research Reference Hub",
  description: DESCRIPTION,
  mainEntityOfPage: URL,
  inLanguage: "en-GB",
  author: { "@type": "Organization", name: "PH Labs UK", url: SITE_URL },
  publisher: {
    "@type": "Organization",
    name: "PH Labs UK",
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.jpg` },
  },
  datePublished: "2026-06-26",
  dateModified: "2026-06-26",
};

const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const BREADCRUMB_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Research", item: `${SITE_URL}/research` },
    { "@type": "ListItem", position: 3, name: "BPC-157 UK", item: URL },
  ],
};

export const Route = createFileRoute("/research/bpc-157-uk")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { name: "keywords", content: "bpc-157 uk, bpc 157 uk, body protection compound 157, bpc-157 research, pentadecapeptide, bpc-157 reference material" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(ARTICLE_LD) },
      { type: "application/ld+json", children: JSON.stringify(FAQ_LD) },
      { type: "application/ld+json", children: JSON.stringify(BREADCRUMB_LD) },
    ],
  }),
  component: Bpc157PillarPage,
});

function Bpc157PillarPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">BPC-157 UK</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Research Reference Hub
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            BPC-157 UK — Research Peptide Reference
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A UK-sourced reference compound for in-vitro tissue-repair and angiogenesis research. Synthetic pentadecapeptide derived from human gastric juice BPC. Every vial ships with a batch-specific Certificate of Analysis.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">At a glance</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-slate-500">Identifier</dt><dd className="font-mono text-slate-200">BPC-157 / PL 14736</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Class</dt><dd className="font-mono text-slate-200">Pentadecapeptide (15-mer)</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Molecular formula</dt><dd className="font-mono text-slate-200">C62H98N16O22</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Monoisotopic mass</dt><dd className="font-mono text-slate-200">≈ 1419 Da</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Sequence</dt><dd className="font-mono text-slate-200 text-xs">GEPPPGKPADDAGLV</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Pathways</dt><dd>NO · VEGFR2 · growth factor</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Storage</dt><dd>−20 °C, lyophilised</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Purity spec</dt><dd>≥ 99.0% HPLC</dd></div>
          </dl>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">What is BPC-157?</h2>
          <p className="text-slate-300">
            BPC-157 (Body Protection Compound 157) is a synthetic 15-amino-acid peptide whose sequence corresponds to a partial fragment of a human gastric juice protein originally characterised by Sikiric and colleagues. The molecule is unusually stable in simulated gastric juice for a small peptide, which has made it a frequent reference compound in oral-stability and tissue-repair in-vitro panels in UK research laboratories.
          </p>
          <p className="mt-3 text-slate-300">
            Within wound-healing and angiogenesis research, BPC-157 is used alongside <a className="text-emerald-400 hover:underline" href="/products/tb-500-thymosin-beta-4">TB-500</a> as an orthogonal reference peptide — TB-500 acts via G-actin sequestration, while BPC-157 acts via the nitric-oxide / VEGFR2 axis. Cellular and biochemical assays use both to dissect the mechanism of test compounds.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">In-vitro pharmacology</h2>
          <p className="text-slate-300">
            In HUVEC and fibroblast monolayer scratch assays, BPC-157 reproducibly accelerates wound closure across 1 nM–10 µM, with EC50 in the low-nanomolar range. Mechanistic work (Hsieh et al., 2017) demonstrates VEGFR2 → Akt → eNOS pathway activation, with downstream nitric-oxide release detectable by Griess reagent. Co-incubation with the VEGFR2 inhibitor SU5416 or the NOS inhibitor L-NAME blunts the response, supporting NO/VEGFR2 as the dominant in-vitro mechanism.
          </p>
          <p className="mt-3 text-slate-300">
            Tube-formation assays on growth-factor-reduced Matrigel show a concentration-dependent increase in branch points and total tube length over 6–18 hours. Parallel Western blots for phospho-VEGFR2 and phospho-eNOS provide a biochemical readout.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">QC, identity, and release testing</h2>
          <p className="text-slate-300">
            Release HPLC is run on a 4.6 × 250 mm, 5 µm C18 column thermostatted at 30 °C. Mobile phase A is 0.1% TFA in water; B is 0.1% TFA in acetonitrile. A typical analytical gradient ramps from 5% B to 45% B over 25 minutes at 1.0 mL/min, UV at 220 nm; BPC-157 elutes at approximately 12–14 minutes. Release specification: ≥99.0% main-peak area, no single related-substance peak above 0.5%.
          </p>
          <p className="mt-3 text-slate-300">
            Identity is confirmed by LC-MS (0.1% formic acid gradient, UPLC C18, ESI-Q-TOF); the observed mass must match the calculated monoisotopic value within 1 Da. Counter-ion (TFA) content is quantified by ion chromatography. Residual solvents are screened by headspace GC against ICH Q3C limits. Water content is measured by coulometric Karl Fischer titration. Endotoxin is quantified by kinetic-chromogenic LAL (limit &lt; 5 EU/mg). All data are compiled into the batch-specific Certificate of Analysis shipped with each vial.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Storage and handling</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-300">
            <li>Store the sealed lyophilised vial at −20 °C or below, protected from light.</li>
            <li>Reconstitute in sterile bacteriostatic water or 0.9% saline.</li>
            <li>Aliquot into single-use volumes immediately; refreeze at −20 °C.</li>
            <li>Avoid more than three freeze-thaw cycles.</li>
            <li>Working solutions held at 2–8 °C should be used within 14 days.</li>
          </ul>
          <p className="mt-3 text-sm text-slate-400">
            See the <a className="text-emerald-400 hover:underline" href="/storage-guide">peptide storage guide</a> for full handling protocols and the <a className="text-emerald-400 hover:underline" href="/products/bacteriostatic-water-research-compound">bacteriostatic water</a> reference compound.
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Source from a UK laboratory supplier</h2>
          <p className="text-slate-300">
            PH Labs is a UK-based supplier of research peptides for in-vitro work. Every BPC-157 lot is QC'd in-house with the protocols above, and each vial ships with a batch-specific Certificate of Analysis.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/bpc-157" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              View BPC-157 reference vials →
            </a>
            <a href="/products/category/bpc-157" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Browse the BPC-157 hub
            </a>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Related comparisons</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li><a href="/compare/bpc-157-vs-tb-500" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">BPC-157 vs TB-500</a></li>
            <li><a href="/compare/bpc-157-vs-ghk-cu" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">BPC-157 vs GHK-Cu</a></li>
            <li><a href="/compare/bpc-157-vs-kpv" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">BPC-157 vs KPV</a></li>
            <li><a href="/products/category/tissue-repair" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Tissue-repair research peptides</a></li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Frequently asked questions</h2>
          <dl className="space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
                <dt className="text-lg font-semibold text-slate-100">{f.q}</dt>
                <dd className="mt-2 text-slate-300">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">References</h2>
          <ol className="list-decimal space-y-2 pl-6 text-sm text-slate-400">
            {REFERENCES.map((r) => (
              <li key={r.citation}>
                {r.citation}
                {r.doi && (
                  <>
                    {" "}
                    <a className="text-emerald-400 hover:underline" href={`https://doi.org/${r.doi}`} rel="noopener nofollow" target="_blank">doi:{r.doi}</a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-12 border-t border-slate-800 pt-6 text-xs text-slate-500">
          <p>This page is a technical reference for UK research laboratories. PH Labs supplies BPC-157 strictly as a reference material for in-vitro work and analytical use. <strong>For Research Use Only. Not for Human Consumption.</strong></p>
        </footer>
      </article>
    </main>
  );
}
