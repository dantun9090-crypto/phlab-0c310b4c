/**
 * Tirzepatide vs Retatrutide comparison — /research/tirzepatide-vs-retatrutide
 *
 * Captures high-intent researchers comparing dual-agonist (GIP/GLP-1)
 * and triple-agonist (GIP/GLP-1/GCGR) incretin-mimetic reference compounds.
 * Compliance-safe, research-use-only, grounded in preclinical receptor
 * pharmacology literature.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/tirzepatide-vs-retatrutide`;
const TITLE =
  "Tirzepatide vs Retatrutide | Dual vs Triple Agonist Research Comparison | PH Labs";
const DESCRIPTION =
  "Side-by-side comparison of Tirzepatide (dual GIP/GLP-1 agonist) and Retatrutide (triple GIP/GLP-1/glucagon agonist) for preclinical metabolic research. UK research-use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is the fundamental pharmacological difference between Tirzepatide and Retatrutide?",
    a: "Tirzepatide is a balanced dual agonist at the glucose-dependent insulinotropic polypeptide (GIP) and glucagon-like peptide-1 (GLP-1) receptors. Retatrutide adds a third, balanced glucagon-receptor (GCGR) component, making it a triple agonist at GIPR, GLP-1R, and GCGR. In cAMP accumulation assays using CHO-K1 or HEK293 lines stably expressing each receptor, retatrutide shows comparable EC50 values at all three targets, whereas tirzepatide is inactive or only weakly active at GCGR.",
  },
  {
    q: "Which compound is the better reference for GIP/GLP-1 dual-receptor panels?",
    a: "Tirzepatide is the canonical dual-agonist reference. Its pharmacology was characterised as a GIP-based sequence with appended GLP-1R activity (Rosenstock et al., 2021). In mixed-population cAMP assays it produces a bell-shaped concentration-response that can be deconvoluted with GIP(3-30)NH2 (GIPR antagonist) and exendin-9(39) (GLP-1R antagonist), giving clean mechanistic readouts for each receptor contribution.",
  },
  {
    q: "Which compound is the better reference for triple-receptor incretin panels?",
    a: "Retatrutide is the standard triple-agonist reference. Its 39-residue acylated peptide scaffold activates GIPR, GLP-1R, and GCGR with approximately equimolar potency (EC50 ~0.05–0.30 nM per receptor; Coskun et al., 2022). Companion antagonists deconvolute each arm: exendin-9(39) for GLP-1R, GIP(3-30)NH2 for GIPR, and des-His1-[Glu9]-glucagon(1-29) for GCGR. The retained GCGR activity differentiates it from tirzepatide in hepatocyte and HepG2 lipid-metabolism assays.",
  },
  {
    q: "Can Tirzepatide and Retatrutide be used in parallel in the same in-vitro panel?",
    a: "Yes — running both as reference compounds allows a laboratory to deconvolute dual-receptor (GIP/GLP-1) from triple-receptor (GIP/GLP-1/glucagon) signalling contributions when characterising a novel test compound. Data are typically normalised to vehicle and to each reference at matched concentrations across 1 pM–100 nM.",
  },
  {
    q: "How do the structures and physical properties differ?",
    a: "Tirzepatide is a 39-amino-acid linear peptide based on the native GIP sequence with a C20 fatty-diacid side chain at Lys20 and non-canonical residues to suppress DPP-4 cleavage. Retatrutide is also a 39-residue acylated peptide (LY3437943) with a C20 fatty-diacid pendant at Lys17, α-methyl-Lys at position 13, and Aib at position 2. Both are lyophilised, stored at −20 °C, and reconstituted in sterile bacteriostatic water or 0.1% acetic acid.",
  },
  {
    q: "How does in-vitro plasma stability compare?",
    a: "Both tirzepatide and retatrutide rely on non-covalent serum-albumin association via their C20 fatty-diacid pendants to extend apparent half-life in plasma-stability assays. The albumin-bound fraction is typically modelled with 4% human serum albumin in the incubation buffer. Retatrutide's α-methyl-Lys and Aib residues confer additional DPP-4 resistance, giving a marginal stability advantage in extended in-vitro pharmacokinetic models.",
  },
  {
    q: "Are either compound approved for human use in the UK?",
    a: "No. Neither tirzepatide nor retatrutide is approved by the MHRA, EMA, or FDA for any therapeutic indication in the context of reference-material supply. PH Labs supplies both strictly as reference materials for in-vitro laboratory research and analytical use. Not for human consumption.",
  },
];

const COMPARISON: Array<{ attr: string; tir: string; ret: string }> = [
  { attr: "Receptor profile", tir: "Dual — GIPR + GLP-1R", ret: "Triple — GIPR + GLP-1R + GCGR" },
  { attr: "Molecular class", tir: "Synthetic 39-mer acylated peptide", ret: "Synthetic 39-mer acylated peptide" },
  { attr: "Developer code", tir: "LY3298176", ret: "LY3437943" },
  { attr: "Fatty-acid pendant", tir: "C20 diacid at Lys20", ret: "C20 diacid at Lys17" },
  { attr: "Primary in-vitro readout", tir: "GIP/GLP-1 cAMP (dual-receptor panels)", ret: "GIP/GLP-1/glucagon cAMP (triple-receptor panels)" },
  { attr: "Typical working range", tir: "1 pM – 100 nM", ret: "1 pM – 100 nM" },
  { attr: "GCGR activity", tir: "Inactive / weak", ret: "Balanced agonism (EC50 ~0.05–0.30 nM)" },
  { attr: "Hepatocyte lipid readout", tir: "Minimal (no GCGR component)", ret: "Active via retained GCGR signalling" },
  { attr: "Storage", tir: "−20 °C lyophilised, avoid > 3 F/T cycles", ret: "−20 °C lyophilised, avoid > 3 F/T cycles" },
];

const REFERENCES = [
  {
    citation:
      "Rosenstock J. et al. (2021). Triple hormone receptor agonist Tirzepatide — Dual GIP and GLP-1 receptor agonist. Lancet.",
    doi: "10.1016/S0140-6736(21)02438-0",
  },
  {
    citation:
      "Coskun T. et al. (2022). LY3437943, a novel triple GIP/GLP-1/glucagon receptor agonist. Nat Metab.",
    doi: "10.1038/s42255-022-00688-5",
  },
  {
    citation:
      "Urva S. et al. (2022). LY3437943, a novel triple receptor agonist — Phase 1. Lancet.",
    doi: "10.1016/S0140-6736(22)01617-7",
  },
  {
    citation:
      "Jastreboff A.M. et al. (2023). Triple-Hormone-Receptor Agonist Retatrutide for Obesity — Phase 2 Trial. NEJM.",
    doi: "10.1056/NEJMoa2301972",
  },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Tirzepatide vs Retatrutide — Dual vs Triple Agonist Research Comparison",
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
  datePublished: "2026-07-03",
  dateModified: "2026-07-03",
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
    { "@type": "ListItem", position: 3, name: "Tirzepatide vs Retatrutide", item: URL },
  ],
};

export const Route = createFileRoute("/research/tirzepatide-vs-retatrutide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      {
        name: "keywords",
        content:
          "tirzepatide vs retatrutide, dual agonist vs triple agonist, GIP GLP-1 glucagon receptor, tirzepatide research, retatrutide research, incretin mimetic research, metabolic peptide comparison",
      },
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
  component: TirzepatideVsRetatrutidePage,
});

function TirzepatideVsRetatrutidePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">Tirzepatide vs Retatrutide</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Comparative Research Reference
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Tirzepatide vs Retatrutide — Dual vs Triple Receptor Agonist Research
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A side-by-side reference for UK laboratories comparing incretin-mimetic research compounds.
            Tirzepatide is a balanced dual agonist at GIP and GLP-1 receptors; Retatrutide adds a third,
            balanced glucagon-receptor component. Both are used in preclinical metabolic and receptor-pharmacology panels.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">At a glance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Attribute</th>
                  <th className="py-2 pr-4">Tirzepatide</th>
                  <th className="py-2">Retatrutide</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {COMPARISON.map((row) => (
                  <tr key={row.attr} className="align-top">
                    <td className="py-3 pr-4 font-semibold text-slate-200">{row.attr}</td>
                    <td className="py-3 pr-4 text-slate-300">{row.tir}</td>
                    <td className="py-3 text-slate-300">{row.ret}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Tirzepatide — dual GIP/GLP-1 agonist</h2>
          <p className="text-slate-300">
            Tirzepatide (LY3298176) is a 39-amino-acid synthetic peptide engineered as a balanced dual agonist
            at the human glucose-dependent insulinotropic polypeptide (GIP) and glucagon-like peptide-1 (GLP-1)
            receptors. Its sequence is based on native GIP with structural modifications that confer GLP-1R activity,
            including a C20 fatty-diacid side chain at Lys20 that drives non-covalent serum-albumin association
            and extends apparent half-life in plasma-stability assays (Rosenstock et al., 2021).
          </p>
          <p className="mt-3 text-slate-300">
            In cAMP accumulation assays using CHO-K1 or HEK293 lines stably expressing human GIPR or GLP-1R,
            tirzepatide produces concentration-dependent responses with low-nanomolar EC50 values.
            β-arrestin-2 recruitment assays (PathHunter, DiscoverX) show a distinct bias profile relative to
            native GIP and GLP-1, making tirzepatide a valuable mechanistic reference in signalling-pathway
            compartmentalisation research. Companion antagonists — GIP(3-30)NH2 for GIPR and exendin-9(39)
            for GLP-1R — cleanly deconvolute the dual-receptor contributions in mixed-population assays.
          </p>
          <p className="mt-3 text-slate-300">
            Tirzepatide lacks meaningful glucagon-receptor (GCGR) activity; in GCGR-transfected cell lines
            it is typically inactive at concentrations up to 100 nM. This absence of GCGR signalling is the
            key differentiator from retatrutide in comparative hepatocyte and HepG2 lipid-metabolism panels.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Retatrutide — triple GIP/GLP-1/glucagon agonist</h2>
          <p className="text-slate-300">
            Retatrutide (LY3437943) is a 39-residue synthetic acylated peptide disclosed by Coskun et al. in
            <em> Nature Metabolism </em> (2022). It acts as a balanced triple agonist at GIPR, GLP-1R, and GCGR,
            with reported EC50 values of approximately 0.05–0.30 nM at all three receptors in cAMP accumulation
            assays (Coskun et al., 2022; Urva et al., 2022). A C20 fatty-diacid pendant at Lys17 mediates
            serum-albumin association, while α-methyl-Lys at position 13 and 2-aminoisobutyric acid (Aib)
            at position 2 suppress dipeptidyl-peptidase-4 (DPP-4) cleavage in plasma-stability assays.
          </p>
          <p className="mt-3 text-slate-300">
            The retained GCGR activity is what distinguishes retatrutide from tirzepatide in mechanistic
            in-vitro experiments. In primary hepatocyte cultures and HepG2 cell lines, the glucagon-receptor
            component drives distinct lipid-metabolism endpoints that are absent in tirzepatide-treated controls.
            This makes retatrutide the reference compound of choice for triple-receptor incretin panels and for
            research into hepatic lipid handling via GCGR signalling.
          </p>
          <p className="mt-3 text-slate-300">
            Companion antagonists deconvolute each receptor arm: exendin-9(39) for GLP-1R, GIP(3-30)NH2 for GIPR,
            and des-His1-[Glu9]-glucagon(1-29) for GCGR. In mixed-population assays, sequential blockade with
            these antagonists allows researchers to attribute observed effects to individual receptor contributions.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Receptor pharmacology in comparative panels</h2>
          <p className="text-slate-300">
            When both compounds are run in parallel as reference standards, the differential GCGR activity becomes
            the clearest discriminating variable. In cAMP Hunter or GloSensor assays normalised to forskolin,
            tirzepatide and retatrutide overlap closely at GIPR and GLP-1R, but diverge sharply at GCGR:
            retatrutide produces a full concentration-response curve, whereas tirzepatide remains at baseline.
          </p>
          <p className="mt-3 text-slate-300">
            β-arrestin recruitment profiles also differ. Tirzepatide shows a partial-bias signature at GLP-1R
            relative to native GLP-1. Retatrutide retains this partial bias while adding a GCGR β-arrestin
            component — a feature that has driven research into multi-receptor signalling compartmentalisation
            and biased agonism in incretin-mimetic scaffolds.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Choosing a reference compound for your assay</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-300">
            <li><strong className="text-slate-100">Dual-receptor GIP/GLP-1 panels:</strong> Tirzepatide is the canonical reference for deconvoluting GIPR and GLP-1R contributions.</li>
            <li><strong className="text-slate-100">Triple-receptor GIP/GLP-1/glucagon panels:</strong> Retatrutide is the standard for assays requiring simultaneous engagement of all three incretin targets.</li>
            <li><strong className="text-slate-100">Hepatocyte / HepG2 lipid-metabolism assays:</strong> Retatrutide is preferred because the retained GCGR activity drives distinct lipid endpoints absent in tirzepatide controls.</li>
            <li><strong className="text-slate-100">Comparative incretin research:</strong> Run both in parallel to isolate the GCGR-specific component of a novel test compound by subtraction.</li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Source both reference peptides from a UK laboratory supplier</h2>
          <p className="text-slate-300">
            PH Labs supplies Tirzepatide and Retatrutide as lyophilised reference compounds for UK in-vitro
            metabolic research. Every vial ships with a batch-specific Certificate of Analysis (HPLC ≥ 99.0%,
            LC-MS identity, residual solvents, water content, endotoxin).
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/tirzepatide-research-peptide" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              Tirzepatide reference vials →
            </a>
            <a href="/products/retatrutide-research-peptide" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              Retatrutide reference vials →
            </a>
            <a href="/research/retatrutide-uk" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Retatrutide research hub
            </a>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Related comparisons</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li><a href="/compare/retatrutide-vs-tirzepatide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Retatrutide vs Tirzepatide (programmatic compare)</a></li>
            <li><a href="/compare/retatrutide-vs-semaglutide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Retatrutide vs Semaglutide</a></li>
            <li><a href="/compare/tirzepatide-vs-semaglutide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Tirzepatide vs Semaglutide</a></li>
            <li><a href="/products/category/metabolic-research" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">Metabolic research peptides</a></li>
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
          <p>This page is a technical comparison for UK research laboratories. PH Labs supplies Tirzepatide and Retatrutide strictly as reference materials for in-vitro work and analytical use. <strong>For Research Use Only. Not for Human Consumption.</strong></p>
        </footer>
      </article>
    </main>
  );
}
