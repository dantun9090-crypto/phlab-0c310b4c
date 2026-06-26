/**
 * Retatrutide UK pillar page — /research/retatrutide-uk
 *
 * Captures the 22,200/mo "retatrutide uk" query currently ranking #70.
 * Long-form, research-only, compliance-safe. Links inward to PDP, hub
 * category, the four misspelling variants, and related /compare/* pages.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/retatrutide-uk`;
const TITLE = "Retatrutide UK | Research Peptide Reference Hub | PH Labs";
const DESCRIPTION =
  "Retatrutide (LY3437943) research reference for UK laboratories: structure, receptor pharmacology, HPLC QC, storage, citations. Research use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is retatrutide?",
    a: "Retatrutide (LY3437943) is a 39-residue synthetic acylated peptide acting as a balanced triple agonist at the GIP, GLP-1, and glucagon receptors. Molecular formula C221H343N51O63, monoisotopic mass ≈ 4731 Da; CAS 2381089-83-2. Disclosed by Coskun et al., Nat Metab (2022).",
  },
  {
    q: "Where can UK research labs source retatrutide reference material?",
    a: "PH Labs supplies retatrutide as a lyophilised reference compound for in-vitro receptor-pharmacology work in UK research facilities. Every vial ships with a batch-specific Certificate of Analysis covering HPLC purity (≥99.0%), LC-MS identity, residual solvents, water content (Karl Fischer), and endotoxin (LAL).",
  },
  {
    q: "What in-vitro assays use retatrutide as a reference?",
    a: "cAMP accumulation assays in CHO-K1 / HEK293 lines stably expressing human GIPR, GLP-1R, or GCGR; β-arrestin-2 recruitment via DiscoverX PathHunter / Tango; competition binding against [125I]-GLP-1 in transfected membranes. Working concentrations span 1 pM–100 nM.",
  },
  {
    q: "How is retatrutide stored and reconstituted in the laboratory?",
    a: "Store the sealed lyophilised vial at −20 °C or below. Reconstitute in sterile bacteriostatic water or 0.1% acetic acid, aliquot into single-use volumes, and refreeze at −20 °C; avoid more than three freeze-thaw cycles. Working solutions kept at 2–8 °C should be used within 14 days.",
  },
  {
    q: "How does retatrutide differ from tirzepatide in receptor assays?",
    a: "Tirzepatide is a GIP/GLP-1 dual agonist; retatrutide adds a balanced glucagon-receptor (GCGR) component. In primary hepatocyte and HepG2 cultures, the retained GCGR activity differentiates retatrutide in mechanistic in-vitro experiments probing hepatic-lipid-metabolism endpoints.",
  },
  {
    q: "Which antagonists are used alongside retatrutide?",
    a: "Exendin-9(39) for GLP-1R, GIP(3-30)NH2 for GIPR, and des-His1-[Glu9]-glucagon(1-29) for GCGR — used to deconvolute individual receptor contributions in mixed populations.",
  },
  {
    q: "What is the half-life of retatrutide in plasma-stability assays?",
    a: "The C20 fatty-diacid pendant at Lys17 drives non-covalent serum-albumin association, extending the apparent in-vitro half-life to roughly six days in rodent pharmacokinetic models (Coskun et al., 2022). The α-methyl-Lys and Aib residues suppress DPP-4 cleavage in plasma-stability assays.",
  },
  {
    q: "Is retatrutide approved for human use?",
    a: "No. Retatrutide is an investigational compound. PH Labs supplies it strictly as a reference material for in-vitro research and analytical use. Not for human consumption.",
  },
];

const REFERENCES = [
  { citation: "Coskun T. et al. (2022). LY3437943, a novel triple GIP/GLP-1/glucagon receptor agonist. Nat Metab.", doi: "10.1038/s42255-022-00688-5" },
  { citation: "Urva S. et al. (2022). LY3437943, a novel triple receptor agonist — Phase 1. Lancet.", doi: "10.1016/S0140-6736(22)01617-7" },
  { citation: "Jastreboff A.M. et al. (2023). Triple-Hormone-Receptor Agonist Retatrutide for Obesity — Phase 2 Trial. NEJM.", doi: "10.1056/NEJMoa2301972" },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Retatrutide UK — Research Reference Hub",
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
    { "@type": "ListItem", position: 3, name: "Retatrutide UK", item: URL },
  ],
};

export const Route = createFileRoute("/research/retatrutide-uk")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { name: "keywords", content: "retatrutide uk, reta peptide uk, retatrutide research, LY3437943, GIP GLP-1 glucagon triagonist, retatrutide reference material" },
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
  component: RetatrutidePillarPage,
});

function RetatrutidePillarPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">Retatrutide UK</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Research Reference Hub
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Retatrutide UK — Research Peptide Reference
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A UK-sourced reference compound for in-vitro receptor-pharmacology research. Triple agonist at the GIP, GLP-1, and glucagon receptors (LY3437943). Every vial ships with a batch-specific Certificate of Analysis.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">At a glance</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-slate-500">Identifier</dt><dd className="font-mono text-slate-200">LY3437943</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">CAS</dt><dd className="font-mono text-slate-200">2381089-83-2</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Molecular formula</dt><dd className="font-mono text-slate-200">C221H343N51O63</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Monoisotopic mass</dt><dd className="font-mono text-slate-200">≈ 4731 Da</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Receptors</dt><dd>GIPR · GLP-1R · GCGR</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Length</dt><dd>39 residues</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Storage</dt><dd>−20 °C, lyophilised</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Purity spec</dt><dd>≥ 99.0% HPLC</dd></div>
          </dl>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">What is retatrutide?</h2>
          <p className="text-slate-300">
            Retatrutide is a 39-residue synthetic acylated peptide engineered as a balanced triple agonist at the human GIP, GLP-1, and glucagon receptors. The chemistry was first disclosed by Coskun et al. in <em>Nature Metabolism</em> (2022). A C20 fatty-diacid pendant at Lys17 mediates non-covalent serum-albumin association, extending in-vitro half-life in plasma-stability assays. Non-canonical residues α-methyl-Lys at position 13 and 2-aminoisobutyric acid (Aib) at position 2 suppress dipeptidyl-peptidase-4 (DPP-4) cleavage.
          </p>
          <p className="mt-3 text-slate-300">
            Within UK research laboratories retatrutide is used as the reference triagonist in comparative incretin-receptor assay panels alongside <a className="text-emerald-400 hover:underline" href="/products/tirzepatide-research-peptide">tirzepatide</a> (GIP/GLP-1 dual agonist), semaglutide (selective GLP-1R), and native glucagon. The retained glucagon-receptor activity is what differentiates it from tirzepatide in mechanistic in-vitro experiments.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Receptor pharmacology</h2>
          <p className="text-slate-300">
            In CHO-K1 and HEK293 lines stably expressing human GIPR, GLP-1R, or GCGR coupled to a cAMP biosensor (e.g. cAMP Hunter, DiscoverX), retatrutide produces concentration-dependent cAMP accumulation with reported EC50 values of approximately 0.05–0.30 nM at all three receptors (Urva et al., <em>Lancet</em> 2022). β-arrestin-2 recruitment assays (PathHunter, Tango) show a partial-bias profile at GLP-1R relative to native GLP-1 — a feature that has driven mechanistic in-vitro research into signalling-pathway compartmentalisation.
          </p>
          <p className="mt-3 text-slate-300">
            Companion antagonists deconvolute individual receptor contributions: exendin-9(39) blocks GLP-1R, GIP(3-30)NH2 blocks GIPR, and des-His1-[Glu9]-glucagon(1-29) blocks GCGR. For plasma-stability work, the albumin-bound fraction is modelled with 4% human serum albumin in the incubation buffer.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">QC, identity, and release testing</h2>
          <p className="text-slate-300">
            Release HPLC is run on a 4.6 × 250 mm, 5 µm C18 column thermostatted at 30 °C. Mobile phase A is 0.1% TFA in water; B is 0.1% TFA in acetonitrile. A typical analytical gradient ramps from 25% B to 55% B over 30 minutes at 1.0 mL/min, UV at 220 nm; retatrutide elutes at approximately 18–20 minutes. Release specification: ≥99.0% main-peak area, no single related-substance peak above 0.5%.
          </p>
          <p className="mt-3 text-slate-300">
            Identity is confirmed in a parallel LC-MS run (0.1% formic acid gradient, UPLC C18, ESI-Q-TOF). The deconvoluted mass must match the calculated monoisotopic value within 1 Da. Counter-ion content (TFA) is quantified by ion chromatography (typically 4–10% w/w). Residual solvents are screened by headspace GC against ICH Q3C limits. Water content is measured by coulometric Karl Fischer titration. Endotoxin is quantified by kinetic-chromogenic LAL (limit &lt; 5 EU/mg). All release data are compiled into the batch-specific Certificate of Analysis shipped with each vial.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Storage and handling</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-300">
            <li>Store the sealed lyophilised vial at −20 °C or below, protected from light.</li>
            <li>Reconstitute in sterile bacteriostatic water or 0.1% acetic acid.</li>
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
            PH Labs is a UK-based supplier of research peptides for in-vitro work. Every retatrutide lot is QC'd in-house with the protocols above, and each vial ships with a batch-specific Certificate of Analysis.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/retatrutide-research-peptide" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              View Retatrutide reference vials →
            </a>
            <a href="/products/category/retatrutide" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Browse the retatrutide hub
            </a>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Related comparisons</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li><a href="/compare/retatrutide-vs-tirzepatide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Retatrutide vs Tirzepatide</a></li>
            <li><a href="/compare/retatrutide-vs-semaglutide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Retatrutide vs Semaglutide</a></li>
            <li><a href="/compare/retatrutide-vs-cagrilintide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Retatrutide vs Cagrilintide</a></li>
            <li><a href="/compare/retatrutide-vs-survodutide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Retatrutide vs Survodutide</a></li>
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
          <p>This page is a technical reference for UK research laboratories. PH Labs supplies retatrutide strictly as a reference material for in-vitro work and analytical use. <strong>For Research Use Only. Not for Human Consumption.</strong></p>
        </footer>
      </article>
    </main>
  );
}
