/**
 * BPC-157 and TB-500 synergy guide — /research/bpc-157-tb-500-synergy
 *
 * Captures "bpc-157 tb-500 stack research", "peptide synergy" and
 * "UK research peptides" high-intent queries from laboratories studying
 * combined tissue-repair reference protocols. Compliance-safe,
 * research-use-only, grounded in preclinical mechanism-of-action literature.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/bpc-157-tb-500-synergy`;
const TITLE =
  "BPC-157 & TB-500 Synergy Stack | UK Tissue-Repair Research Guide | PH Labs";
const DESCRIPTION =
  "How UK laboratories study BPC-157 and TB-500 together: complementary angiogenesis (VEGFR2/NO) and cell-migration (G-actin) mechanisms in combined tissue-repair research panels. Research-use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Why do UK laboratories study BPC-157 and TB-500 together in the same panel?",
    a: "BPC-157 and TB-500 act on orthogonal arms of the tissue-repair cascade. BPC-157 drives angiogenesis via the VEGFR2 → Akt → eNOS axis and nitric-oxide release, while TB-500 (Thymosin Beta-4 fragment) drives cell migration via G-actin sequestration and cytoskeletal remodelling. When both are present in a comparative panel, researchers can deconvolute whether a novel test compound acts primarily through angiogenic, migratory, or dual mechanisms.",
  },
  {
    q: "What is the mechanistic rationale for combining BPC-157 and TB-500 in research?",
    a: "The rationale is complementary pathway coverage. BPC-157 produces concentration-dependent tube formation in HUVEC Matrigel assays (1 nM–10 µM) that is blunted by VEGFR2 inhibition (SU5416). TB-500 produces directional cell migration in scratch and transwell assays that is blunted by latrunculin A. A combined panel therefore spans both extracellular-matrix vascularisation and intracellular cytoskeletal dynamics — the two dominant preclinical readouts in tissue-repair research.",
  },
  {
    q: "How are BPC-157 and TB-500 typically co-administered in in-vitro research?",
    a: "In combined panels both compounds are run as independent reference standards at matched concentrations (commonly 1 nM–1 µM) alongside the test compound. Data are normalised to vehicle, to BPC-157 alone, to TB-500 alone, and to the combination. This four-arm design isolates additive versus synergistic signalling contributions. Both are lyophilised, stored at −20 °C, and reconstituted in sterile bacteriostatic water or 0.1% acetic acid immediately before assay setup.",
  },
  {
    q: "Are there published preclinical studies that use BPC-157 and TB-500 together?",
    a: "The published literature predominantly reports each compound in isolation, which is why combined-panel research is an active area in UK contract laboratories. Sikiric et al. (2018) and Hsieh et al. (2017) characterise BPC-157 angiogenesis; Goldstein et al. (2005) and Malinda et al. (1999) characterise TB-500 migration. Laboratories designing novel synergy panels use these mechanistic anchors as positive controls for each pathway.",
  },
  {
    q: "What assays are most informative when both compounds are used as reference standards?",
    a: "The most common combined-panel design includes: (1) HUVEC tube formation on growth-factor-reduced Matrigel for angiogenesis readout; (2) fibroblast scratch or transwell migration for cytoskeletal readout; (3) Griess nitrite quantification for NO output; and (4) phalloidin staining for F-actin polymerisation. Running BPC-157 and TB-500 as parallel positive controls gives researchers a two-axis mechanistic map against which to position a novel test peptide.",
  },
  {
    q: "What concentration ranges are used when BPC-157 and TB-500 are studied together?",
    a: "Both compounds are typically titrated across 1 nM–10 µM (BPC-157) and 1 nM–1 µM (TB-500) in combined panels. The overlapping range (1 nM–1 µM) is where most comparative data are collected. Laboratories often select a single matched concentration — commonly 100 nM or 1 µM — for the combination arm, then verify that each compound alone produces the expected pathway-specific response at that concentration before adding the test compound.",
  },
  {
    q: "Are BPC-157 and TB-500 approved for human use in the UK?",
    a: "No. Neither compound is approved by the MHRA, EMA or FDA for any therapeutic indication. PH Labs supplies both strictly as reference materials for in-vitro laboratory research and analytical characterisation. Not for human consumption.",
  },
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
  {
    citation:
      "Xiong Y. et al. (2021). Thymosin β4 promotes angiogenesis and wound repair through PI3K/Akt and ERK pathways. Cell Mol Biol Lett.",
    doi: "10.1186/s11658-021-00276-2",
  },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "BPC-157 & TB-500 Synergy Stack — UK Tissue-Repair Research Guide",
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
  datePublished: "2026-07-04",
  dateModified: "2026-07-04",
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
    { "@type": "ListItem", position: 3, name: "BPC-157 & TB-500 Synergy", item: URL },
  ],
};

export const Route = createFileRoute("/research/bpc-157-tb-500-synergy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      {
        name: "keywords",
        content:
          "bpc-157 tb-500 stack research, peptide synergy, UK research peptides, bpc 157 tb 500 combination, tissue repair peptide stack, angiogenesis cell migration research, bpc tb-500 together",
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
  component: BpcTbSynergyPage,
});

function BpcTbSynergyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">BPC-157 &amp; TB-500 Synergy</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Synergy Research Guide
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            BPC-157 &amp; TB-500 Synergy Stack — UK Tissue-Repair Research Guide
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            How UK laboratories study BPC-157 and TB-500 together in combined
            tissue-repair panels. BPC-157 drives angiogenesis via the VEGFR2 / NO
            axis; TB-500 drives cell migration via G-actin sequestration. Together
            they cover the two dominant preclinical readouts in wound-healing research.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">At a glance — combined panel design</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-lg font-semibold text-emerald-400">BPC-157 — angiogenesis arm</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                <li>Pathway: VEGFR2 → Akt → eNOS → NO release</li>
                <li>Readout: Tube formation, VEGFR2 phosphorylation</li>
                <li>Working range: 1 nM – 10 µM</li>
                <li>Antagonist: SU5416 (VEGFR2), L-NAME (NOS)</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-lg font-semibold text-emerald-400">TB-500 — migration arm</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                <li>Pathway: G-actin sequestration → cytoskeletal remodelling</li>
                <li>Readout: Scratch, transwell, Boyden migration</li>
                <li>Working range: 1 nM – 1 µM</li>
                <li>Antagonist: Latrunculin A (actin polymerisation)</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Why study them together?</h2>
          <p className="text-slate-300">
            In preclinical tissue-repair research, angiogenesis and cell migration
            are distinct but interdependent processes. BPC-157 primarily addresses
            the vascularisation axis through VEGFR2-driven nitric-oxide signalling
            (Hsieh et al., 2017), whereas TB-500 addresses the cellular-motility axis
            through actin-cytoskeletal dynamics (Malinda et al., 1999). A laboratory
            that runs both as parallel positive controls gains a two-axis mechanistic
            map: any novel test compound can be positioned as angiogenic, migratory,
            dual, or neither.
          </p>
          <p className="mt-3 text-slate-300">
            This is particularly valuable in UK contract-research settings where
            characterising a new synthetic peptide requires rapid mechanistic
            triage. Rather than running sequential single-pathway screens, a
            combined BPC-157 / TB-500 reference panel delivers both readouts
            in a single experimental design.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Typical combined-panel protocol</h2>
          <p className="text-slate-300">
            A standard four-arm design used in UK research laboratories looks like this:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-slate-300">
            <li><strong className="text-slate-100">Vehicle control:</strong> Sterile bacteriostatic water or 0.1% acetic acid in the same solvent ratio as the test compound.</li>
            <li><strong className="text-slate-100">BPC-157 reference:</strong> 100 nM or 1 µM — concentration selected to produce a sub-maximal but robust angiogenic response in tube-formation assays.</li>
            <li><strong className="text-slate-100">TB-500 reference:</strong> 100 nM or 1 µM — concentration selected to produce a sub-maximal but robust migratory response in scratch assays.</li>
            <li><strong className="text-slate-100">Test compound:</strong> Run at the same matched concentration alongside the two references. Normalise all data to the vehicle control and express as percentage of the relevant reference response.</li>
          </ol>
          <p className="mt-3 text-slate-300">
            Data collection typically includes HUVEC tube formation (angiogenesis),
            fibroblast scratch closure (migration), Griess nitrite (NO output),
            and phalloidin F-actin staining (cytoskeletal reorganisation). Each
            endpoint is read against the corresponding BPC-157 or TB-500 positive
            control to assign mechanism.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Mechanistic deconvolution in practice</h2>
          <p className="text-slate-300">
            When a novel test peptide is screened against the combined panel,
            the observed response pattern falls into one of four mechanistic
            categories:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-300">
            <li><strong className="text-slate-100">Angiogenic profile:</strong> Mimics BPC-157 (tube formation ↑, migration minimal). VEGFR2/NO mechanism is dominant. Blunted by SU5416 or L-NAME.</li>
            <li><strong className="text-slate-100">Migratory profile:</strong> Mimics TB-500 (migration ↑, tube formation minimal). Actin-cytoskeletal mechanism is dominant. Blunted by latrunculin A.</li>
            <li><strong className="text-slate-100">Dual profile:</strong> Elevates both endpoints. Suggests either dual-pathway activity or a downstream signalling node shared by both arms. Further receptor-specific antagonist deconvolution is required.</li>
            <li><strong className="text-slate-100">Novel profile:</strong> Does not align with either reference. Indicates a distinct mechanism — valuable for follow-up target-identification work.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Storage, handling and reconstitution</h2>
          <p className="text-slate-300">
            Both BPC-157 and TB-500 are supplied as lyophilised powders. For combined-panel
            consistency, both should be reconstituted from the same solvent batch
            (sterile bacteriostatic water or 0.1% acetic acid) on the day of assay setup.
            Aliquot immediately after reconstitution to avoid repeated freeze-thaw cycles.
            Store lyophilised vials at −20 °C; discard any vial that has undergone more
            than three freeze-thaw cycles. Use batch-matched COAs to confirm purity
            (HPLC ≥ 99.0%) and identity (LC-MS) before assay inclusion.
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Source both reference peptides for your combined panel</h2>
          <p className="text-slate-300">
            PH Labs supplies BPC-157 and TB-500 as HPLC-verified lyophilised reference
            compounds for UK in-vitro tissue-repair research. Every batch ships with a
            Certificate of Analysis (HPLC ≥ 99.0%, LC-MS identity, residual solvents, water
            content, endotoxin) so you can include them as rigorously characterised positive
            controls in combined-panel designs.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/bpc-157" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              BPC-157 reference vials →
            </a>
            <a href="/products/tb-500-thymosin-beta-4" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              TB-500 reference vials →
            </a>
            <a href="/research/bpc-157-vs-tb-500" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              BPC-157 vs TB-500 comparison
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
          <p>
            This page is a technical research guide for UK laboratories. PH Labs supplies
            BPC-157 and TB-500 strictly as reference materials for in-vitro work and
            analytical use. <strong>For Research Use Only. Not for Human Consumption.</strong>
          </p>
        </footer>
      </article>
    </main>
  );
}
