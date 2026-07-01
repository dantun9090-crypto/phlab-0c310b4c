/**
 * BPC-157 vs TB-500 comparison — /research/bpc-157-vs-tb-500
 *
 * Captures "bpc 157 vs tb-500" and "bpc 157 research" triage queries from
 * researchers evaluating tissue-repair reference compounds. Compliance-safe,
 * research-use-only, grounded in preclinical mechanism-of-action literature.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/bpc-157-vs-tb-500`;
const TITLE =
  "BPC-157 vs TB-500 | Mechanism Comparison for Tissue-Repair Research | PH Labs";
const DESCRIPTION =
  "Side-by-side comparison of BPC-157 and TB-500 in preclinical tissue-repair research: BPC-157 angiogenesis via VEGFR2/NO vs TB-500 (Tβ4 fragment) cell migration via G-actin sequestration. UK research-use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is the core mechanistic difference between BPC-157 and TB-500?",
    a: "BPC-157 (Body Protection Compound, gastric pentadecapeptide) drives in-vitro angiogenesis through VEGFR2 → Akt → eNOS signalling and nitric-oxide release. TB-500 (a synthetic Thymosin Beta-4 fragment containing the LKKTETQ actin-binding motif) drives cell migration primarily through G-actin sequestration and cytoskeletal remodelling. The two act on orthogonal arms of the wound-healing cascade in preclinical models.",
  },
  {
    q: "Which compound is the better reference for angiogenesis assays?",
    a: "BPC-157 is the more commonly cited angiogenic reference. Tube-formation assays on growth-factor-reduced Matrigel and HUVEC scratch panels show concentration-dependent responses (1 nM–10 µM) that can be blunted by VEGFR2 inhibition (SU5416) or NOS inhibition (L-NAME), giving a clean mechanistic readout. TB-500 also produces angiogenic outputs but as a downstream consequence of migration/proliferation rather than direct VEGFR2 signalling.",
  },
  {
    q: "Which compound is the better reference for cell-migration assays?",
    a: "TB-500 is the canonical G-actin sequestration reference. The LKKTETQ heptapeptide within Tβ4 binds monomeric actin and regulates the G/F-actin equilibrium; in scratch, Boyden-chamber and transwell assays this manifests as accelerated directional migration of fibroblasts, keratinocytes and endothelial cells at low-nanomolar concentrations.",
  },
  {
    q: "Can BPC-157 and TB-500 be used in parallel in the same in-vitro panel?",
    a: "Yes — and this is a common design in comparative tissue-repair research. Using both allows a laboratory to deconvolute angiogenic (VEGFR2/NO) from migratory (actin-cytoskeletal) contributions when characterising a novel test compound. Data are typically normalised to vehicle and to each reference compound at a matched concentration.",
  },
  {
    q: "How do the structures and physical properties differ?",
    a: "BPC-157 is a 15-mer pentadecapeptide (sequence GEPPPGKPADDAGLV, C62H98N16O22, monoisotopic mass ≈ 1419 Da) derived from a partial fragment of human gastric juice BPC. TB-500 is a synthetic 7-mer (LKKTETQ) representing the actin-binding fragment of the 43-residue endogenous Thymosin Beta-4 protein. Both are lyophilised, stored at −20 °C, and reconstituted in sterile bacteriostatic water or 0.9% saline.",
  },
  {
    q: "How does in-vitro stability compare?",
    a: "Published stability work (Sikiric et al.) indicates BPC-157 is unusually resistant to enzymatic degradation in simulated gastric juice for ≥24 h at 37 °C. TB-500 as a short synthetic fragment has typical peptide protease sensitivity in serum-containing assays and is usually delivered fresh from single-use aliquots to minimise proteolytic loss.",
  },
  {
    q: "Are either compound approved for human use in the UK?",
    a: "No. Neither BPC-157 nor TB-500 is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for in-vitro laboratory research and analytical use. Not for human consumption.",
  },
];

const COMPARISON: Array<{ attr: string; bpc: string; tb: string }> = [
  { attr: "Class", bpc: "Synthetic pentadecapeptide (15-mer)", tb: "Synthetic Tβ4 fragment (7-mer)" },
  { attr: "Sequence", bpc: "GEPPPGKPADDAGLV", tb: "LKKTETQ (actin-binding motif of Thymosin β4)" },
  { attr: "Primary in-vitro pathway", bpc: "VEGFR2 → Akt → eNOS; NO release", tb: "G-actin sequestration; cytoskeletal remodelling" },
  { attr: "Dominant readout", bpc: "Angiogenesis (tube formation, VEGFR2 phos.)", tb: "Cell migration (scratch, transwell, Boyden)" },
  { attr: "Typical working range", bpc: "1 nM – 10 µM", tb: "1 nM – 1 µM" },
  { attr: "Mechanistic antagonists", bpc: "SU5416 (VEGFR2), L-NAME (NOS)", tb: "Latrunculin A (actin polymerisation)" },
  { attr: "In-vitro gastric stability", bpc: "≥ 24 h at 37 °C (unusual for a peptide)", tb: "Typical short-peptide protease sensitivity" },
  { attr: "Storage", bpc: "−20 °C lyophilised, avoid > 3 F/T cycles", tb: "−20 °C lyophilised, avoid > 3 F/T cycles" },
];

const REFERENCES = [
  {
    citation:
      "Sikiric P. et al. (2018). Stable gastric pentadecapeptide BPC 157 — Therapy effect and mechanism review. Curr Pharm Des.",
    doi: "10.2174/1381612824666180510104516",
  },
  {
    citation:
      "Hsieh M.J. et al. (2017). Therapeutic potential of BPC-157 — Angiogenesis via VEGFR2-Akt-eNOS. Mol Med Reports.",
    doi: "10.3892/mmr.2017.7421",
  },
  {
    citation:
      "Goldstein A.L. et al. (2005). Thymosin β4: actin-sequestering protein moonlights to repair injured tissues. Trends Mol Med.",
    doi: "10.1016/j.molmed.2005.07.007",
  },
  {
    citation:
      "Malinda K.M. et al. (1999). Thymosin β4 accelerates wound healing. J Invest Dermatol.",
    doi: "10.1046/j.1523-1747.1999.00608.x",
  },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "BPC-157 vs TB-500 — Mechanism Comparison for Tissue-Repair Research",
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
  datePublished: "2026-07-01",
  dateModified: "2026-07-01",
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
    { "@type": "ListItem", position: 3, name: "BPC-157 vs TB-500", item: URL },
  ],
};

export const Route = createFileRoute("/research/bpc-157-vs-tb-500")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      {
        name: "keywords",
        content:
          "bpc 157 vs tb-500, bpc-157 vs tb-500, bpc 157 research, tb-500 research, thymosin beta 4 fragment, tissue repair peptide comparison, angiogenesis reference peptide",
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
  component: Bpc157VsTb500Page,
});

function Bpc157VsTb500Page() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">BPC-157 vs TB-500</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Comparative Research Reference
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            BPC-157 vs TB-500 — Mechanism Comparison for Tissue-Repair Research
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A side-by-side reference for UK laboratories triaging tissue-repair
            peptides. BPC-157 acts predominantly through the VEGFR2 / nitric-oxide
            axis to drive in-vitro angiogenesis; TB-500 (a Thymosin Beta-4
            fragment) acts through G-actin sequestration to drive cell migration
            and cytoskeletal remodelling.
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
                  <th className="py-2 pr-4">BPC-157</th>
                  <th className="py-2">TB-500</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {COMPARISON.map((row) => (
                  <tr key={row.attr} className="align-top">
                    <td className="py-3 pr-4 font-semibold text-slate-200">{row.attr}</td>
                    <td className="py-3 pr-4 text-slate-300">{row.bpc}</td>
                    <td className="py-3 text-slate-300">{row.tb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">BPC-157 — angiogenesis-driven repair</h2>
          <p className="text-slate-300">
            BPC-157 (Body Protection Compound, sequence GEPPPGKPADDAGLV) is a
            synthetic 15-amino-acid pentadecapeptide derived from a partial
            fragment of human gastric juice BPC. In HUVEC scratch and Matrigel
            tube-formation assays it produces a concentration-dependent
            pro-angiogenic response across 1 nM–10 µM, with low-nanomolar EC50.
            Mechanistic work (Hsieh et al., 2017) attributes the effect to
            activation of the VEGFR2 → Akt → eNOS axis and downstream
            nitric-oxide release, quantifiable by Griess reagent. Co-incubation
            with the VEGFR2 inhibitor SU5416 or the NOS inhibitor L-NAME blunts
            the response — supporting VEGFR2/NO as the dominant in-vitro
            mechanism in comparative panels.
          </p>
          <p className="mt-3 text-slate-300">
            See the <a className="text-emerald-400 hover:underline" href="/research/bpc-157-uk">BPC-157 UK research hub</a> for full QC method, storage and reference material.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">TB-500 — migration-driven repair</h2>
          <p className="text-slate-300">
            TB-500 is a synthetic peptide corresponding to the LKKTETQ actin-binding
            heptapeptide of the 43-residue endogenous protein Thymosin Beta-4
            (Tβ4). Its dominant preclinical mechanism is G-actin sequestration:
            the LKKTETQ motif binds monomeric actin and regulates the G/F-actin
            equilibrium, translating in cellular assays to accelerated directional
            migration of fibroblasts, keratinocytes and endothelial cells at
            low-nanomolar concentrations (Malinda et al., 1999). Scratch,
            transwell and Boyden-chamber assays are the standard readouts;
            latrunculin A serves as the mechanistic antagonist for
            actin-polymerisation-dependent effects.
          </p>
          <p className="mt-3 text-slate-300">
            Downstream, TB-500 also produces angiogenic and anti-inflammatory
            outputs in preclinical models, but these are typically interpreted as
            secondary consequences of cytoskeletal reorganisation rather than
            direct VEGFR2 receptor engagement.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Choosing a reference compound for your assay</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-300">
            <li><strong className="text-slate-100">Angiogenesis / tube formation / VEGFR2 signalling:</strong> BPC-157 gives the cleanest mechanistic readout.</li>
            <li><strong className="text-slate-100">Scratch / migration / cytoskeletal remodelling:</strong> TB-500 is the canonical G-actin sequestration reference.</li>
            <li><strong className="text-slate-100">Comparative tissue-repair panels:</strong> Run BPC-157 and TB-500 in parallel to deconvolute angiogenic from migratory contributions of a novel test compound.</li>
            <li><strong className="text-slate-100">Oral-stability / gastric-juice work:</strong> BPC-157 is the standard due to its unusual protease resistance in simulated gastric juice.</li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Source both reference peptides from a UK laboratory supplier</h2>
          <p className="text-slate-300">
            PH Labs supplies BPC-157 and TB-500 as lyophilised reference
            compounds for UK in-vitro research. Every vial ships with a
            batch-specific Certificate of Analysis (HPLC ≥ 99.0%, LC-MS identity,
            residual solvents, water content, endotoxin).
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/bpc-157" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              BPC-157 reference vials →
            </a>
            <a href="/products/tb-500-thymosin-beta-4" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              TB-500 reference vials →
            </a>
            <a href="/research/bpc-157-uk" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              BPC-157 hub
            </a>
          </div>
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
          <p>This page is a technical comparison for UK research laboratories. PH Labs supplies BPC-157 and TB-500 strictly as reference materials for in-vitro work and analytical use. <strong>For Research Use Only. Not for Human Consumption.</strong></p>
        </footer>
      </article>
    </main>
  );
}
