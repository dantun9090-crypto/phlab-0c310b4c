/**
 * PT-141 UK pillar page — /research/pt-141-uk
 *
 * Captures high-intent UK research queries for PT-141 (Bremelanotide),
 * an MC3R/MC4R melanocortin receptor agonist reference peptide.
 * Long-form, research-only, compliance-safe. Links inward to PDP,
 * hub category, and related melanocortin comparison pages.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/pt-141-uk`;
const TITLE = "PT-141 Research UK | Melanocortin MC4R Reference Hub | PH Labs";
const DESCRIPTION =
  "PT-141 (Bremelanotide) research reference for UK laboratories: MC3R/MC4R pharmacology, in-vitro assays, HPLC QC, storage, citations. Research use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is PT-141?",
    a: "PT-141 (Bremelanotide) is a synthetic cyclic heptapeptide analogue of alpha-melanocyte-stimulating hormone (α-MSH). Sequence: Ac-Nle-cyclo(Asp-His-D-Phe-Arg-Trp-Lys)-OH. It is a non-selective agonist at the melanocortin receptors MC1R, MC3R, MC4R and MC5R, with preferential functional activity at MC4R in central-signalling in-vitro models.",
  },
  {
    q: "Where can UK research labs source PT-141 reference material?",
    a: "PH Labs supplies PT-141 as a lyophilised reference compound for in-vitro melanocortin-receptor and neuropharmacology research in UK laboratories. Every vial ships with a batch-specific Certificate of Analysis covering HPLC purity (≥99.0%), LC-MS identity, residual solvents, water content (Karl Fischer), and endotoxin (LAL).",
  },
  {
    q: "What in-vitro assays use PT-141 as an MC4R reference agonist?",
    a: "cAMP accumulation assays (HTRF / AlphaScreen) in HEK293 cells stably expressing recombinant MC3R or MC4R; β-arrestin recruitment assays (PathHunter / NanoBiT); calcium mobilisation via FLIPR in engineered lines; radioligand competition binding against [125I]-NDP-α-MSH. Typical working concentrations span 0.1 nM–10 µM, with EC50 values in the low-nanomolar range at MC4R.",
  },
  {
    q: "How is PT-141 stored and reconstituted in the laboratory?",
    a: "Store the sealed lyophilised vial at −20 °C or below, protected from light. Reconstitute in sterile bacteriostatic water or 0.9% saline. Aliquot into single-use volumes and refreeze at −20 °C; avoid more than three freeze-thaw cycles. Working solutions held at 2–8 °C should be used within 14 days.",
  },
  {
    q: "How does PT-141 differ from Melanotan-II in melanocortin assays?",
    a: "Both are cyclic α-MSH analogues, but PT-141 (Bremelanotide) is the free-acid, deamidated metabolite of Melanotan-II and shows a shifted MC1R/MC4R selectivity profile with reduced pigmentation-linked MC1R activity relative to MC3R/MC4R central signalling. The two are commonly run in parallel as reference agonists in comparative melanocortin selectivity panels.",
  },
  {
    q: "What antagonists are used alongside PT-141?",
    a: "SHU9119 (mixed MC3R/MC4R antagonist), MCL0129 and ML00253764 (selective MC4R antagonists), and AgRP(83-132) fragment are commonly co-administered in in-vitro melanocortin panels to deconvolute MC3R vs MC4R contributions to the PT-141 response.",
  },
  {
    q: "Is PT-141 stable in plasma-stability assays?",
    a: "Published in-vitro stability data indicate PT-141 has extended plasma half-life relative to linear α-MSH analogues, driven by its cyclic backbone and N-terminal acetylation. Simulated-fluid stability studies commonly report >90% intact peptide after 4 hours at 37 °C in human plasma — a driver of its use as a reference compound in metabolic-stability panels.",
  },
  {
    q: "Is PT-141 approved for human use in the UK?",
    a: "No. PT-141 is not approved by the MHRA or EMA for any therapeutic indication in the UK. PH Labs supplies it strictly as a reference material for in-vitro research and analytical use. Not for human consumption.",
  },
];

const REFERENCES = [
  { citation: "Molinoff P.B. et al. (2003). PT-141: a melanocortin agonist for the treatment of sexual dysfunction. Ann N Y Acad Sci.", doi: "10.1196/annals.1290.019" },
  { citation: "Hadley M.E. (2005). Discovery that a melanocortin regulates sexual functions in male and female humans. Peptides.", doi: "10.1016/j.peptides.2005.03.032" },
  { citation: "Diamond L.E. et al. (2004). An effect on the subjective sexual response in premenopausal women with sexual arousal disorder by bremelanotide (PT-141). J Sex Med.", doi: "10.1111/j.1743-6109.2006.00429.x" },
  { citation: "Yang Y. et al. (2011). Molecular basis for the interaction of [Nle4,D-Phe7]melanocyte stimulating hormone with the human melanocortin-1 receptor. J Biol Chem.", doi: "10.1074/jbc.M111.303345" },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "PT-141 Research UK — Melanocortin MC4R Reference Hub",
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
  datePublished: "2026-07-16",
  dateModified: "2026-07-16",
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
    { "@type": "ListItem", position: 3, name: "PT-141 Research UK", item: URL },
  ],
};

export const Route = createFileRoute("/research/pt-141-uk")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { name: "keywords", content: "pt-141 research uk, pt-141 uk, bremelanotide research, mc4r agonist reference, melanocortin peptide, pt-141 reference material" },
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
  component: Pt141PillarPage,
});

function Pt141PillarPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">PT-141 Research UK</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Research Reference Hub
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            PT-141 Research UK — Melanocortin MC4R Reference
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A UK-sourced reference compound for in-vitro melanocortin-receptor pharmacology and neuropharmacology research. Cyclic heptapeptide α-MSH analogue with preferential MC4R activity. Every vial ships with a batch-specific Certificate of Analysis.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">At a glance</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-slate-500">Identifier</dt><dd className="font-mono text-slate-200">PT-141 / Bremelanotide</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Class</dt><dd className="font-mono text-slate-200">Cyclic heptapeptide (α-MSH analogue)</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Molecular formula</dt><dd className="font-mono text-slate-200">C50H68N14O10</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Monoisotopic mass</dt><dd className="font-mono text-slate-200">≈ 1024.5 Da</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Sequence</dt><dd className="font-mono text-slate-200 text-xs">Ac-Nle-cyclo(D-H-DPhe-R-W-K)-OH</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Targets</dt><dd>MC1R · MC3R · MC4R · MC5R</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Storage</dt><dd>−20 °C, lyophilised</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Purity spec</dt><dd>≥ 99.0% HPLC</dd></div>
          </dl>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">What is PT-141?</h2>
          <p className="text-slate-300">
            PT-141 (Bremelanotide) is a synthetic cyclic heptapeptide analogue of alpha-melanocyte-stimulating hormone (α-MSH), designed as the deamidated metabolite of Melanotan-II. It is a non-selective agonist across the melanocortin receptor family with preferential functional activity at the central MC3R and MC4R subtypes, which drives its use as a reference agonist in melanocortin neuropharmacology assays in UK research laboratories.
          </p>
          <p className="mt-3 text-slate-300">
            In receptor-selectivity panels, PT-141 is commonly paired with <a className="text-emerald-400 hover:underline" href="/products/melanotan-ii-research-peptide">Melanotan-II</a> as the deamidated counterpart, and with SHU9119 as the reference antagonist. The molecule's cyclic backbone confers extended plasma stability relative to linear α-MSH fragments, making it a useful positive control in metabolic-stability screens.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">In-vitro pharmacology</h2>
          <p className="text-slate-300">
            In HEK293 cells stably transfected with recombinant human MC4R, PT-141 elicits concentration-dependent cAMP accumulation with EC50 in the low-nanomolar range (typically 0.5–5 nM depending on assay format). Parallel measurements at MC3R show EC50 values within 3–10× of the MC4R response, while MC1R activation is markedly weaker than the parent Melanotan-II — the selectivity shift attributed to C-terminal deamidation.
          </p>
          <p className="mt-3 text-slate-300">
            β-arrestin recruitment (PathHunter) and calcium-mobilisation (FLIPR) readouts confirm full-agonist behaviour at MC4R. Co-incubation with SHU9119 or the MC4R-selective antagonist MCL0129 produces rightward Schild shifts consistent with competitive antagonism, supporting canonical Gα<sub>s</sub>-cAMP signalling as the dominant in-vitro mechanism.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">QC, identity, and release testing</h2>
          <p className="text-slate-300">
            Release HPLC is run on a 4.6 × 250 mm, 5 µm C18 column thermostatted at 30 °C. Mobile phase A is 0.1% TFA in water; B is 0.1% TFA in acetonitrile. A typical analytical gradient ramps from 5% B to 45% B over 25 minutes at 1.0 mL/min, UV at 220 nm; PT-141 elutes at approximately 10–12 minutes. Release specification: ≥99.0% main-peak area, no single related-substance peak above 0.5%.
          </p>
          <p className="mt-3 text-slate-300">
            Identity is confirmed by LC-MS (0.1% formic acid gradient, UPLC C18, ESI-Q-TOF); the observed mass must match the calculated monoisotopic value within 1 Da. Counter-ion (TFA / acetate) content is quantified by ion chromatography. Residual solvents are screened by headspace GC against ICH Q3C limits. Water content is measured by coulometric Karl Fischer titration. Endotoxin is quantified by kinetic-chromogenic LAL (limit &lt; 5 EU/mg). All data are compiled into the batch-specific Certificate of Analysis shipped with each vial.
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
            PH Labs is a UK-based supplier of research peptides for in-vitro work. Every PT-141 lot is QC'd in-house with the protocols above, and each vial ships with a batch-specific Certificate of Analysis.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/pt-141-research" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              View PT-141 reference vials →
            </a>
            <a href="/products/category/neurological" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Browse neurological reference peptides
            </a>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Related references</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li><a href="/products/melanotan-ii-research-peptide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Melanotan-II reference peptide</a></li>
            <li><a href="/products/kpv-research-peptide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">KPV — α-MSH tripeptide fragment</a></li>
            <li><a href="/research/bpc-157-uk" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">BPC-157 UK research hub</a></li>
            <li><a href="/products" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">All research peptides</a></li>
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
          <p>This page is a technical reference for UK research laboratories. PH Labs supplies PT-141 (Bremelanotide) strictly as a reference material for in-vitro work and analytical use. <strong>For Research Use Only. Not for Human Consumption.</strong></p>
        </footer>
      </article>
    </main>
  );
}
