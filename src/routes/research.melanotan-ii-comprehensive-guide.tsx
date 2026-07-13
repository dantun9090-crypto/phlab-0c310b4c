/**
 * Melanotan II UK research guide — /research/melanotan-ii-comprehensive-guide
 *
 * Long-form scientific reference for the "melanotan 2 research" / "melanotan ii
 * study" query cluster (Semrush suggestion). Focus: MC1R/MC4R pharmacology,
 * photoprotection and melanin-synthesis in-vitro assays, QC, storage, citations.
 * Research-only, compliance-safe. Links inward to PDP, research hub, and
 * related peptides.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/melanotan-ii-comprehensive-guide`;
const TITLE = "Melanotan II Research Guide UK | MC1R/MC4R Reference | PH Labs";
const DESCRIPTION =
  "Melanotan II (MT-II) comprehensive research reference for UK laboratories: MC1R/MC4R pharmacology, in-vitro photoprotection and melanin-synthesis assays, HPLC QC, storage, citations. Research use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is Melanotan II?",
    a: "Melanotan II (MT-II) is a cyclic 7-amino-acid synthetic analogue of α-melanocyte-stimulating hormone (α-MSH). Sequence: Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2. Molecular formula C50H69N15O9, monoisotopic mass ≈ 1024.5 Da; CAS 121062-08-6. It is a non-selective agonist at the melanocortin receptors MC1R, MC3R, MC4R and MC5R.",
  },
  {
    q: "Which melanocortin receptors does Melanotan II activate in vitro?",
    a: "In CHO-K1 or HEK293 lines stably expressing human MC1R, MC3R, MC4R or MC5R coupled to a cAMP reporter, MT-II produces concentration-dependent cAMP accumulation with sub-nanomolar EC50 values at MC1R and MC4R and low-nanomolar potency at MC3R/MC5R (Hruby et al., J Med Chem 1995; Schiöth et al.). Native α-MSH is the standard reference agonist; SHU-9119 and agouti-related peptide (AgRP) are used as antagonist controls.",
  },
  {
    q: "What in-vitro assays commonly use Melanotan II as a reference?",
    a: "cAMP accumulation (cAMP Hunter, DiscoverX; GloSensor, Promega) in MC1R- or MC4R-transfected CHO-K1 / HEK293; β-arrestin-2 recruitment (PathHunter, Tango); melanin-content assays in B16-F10 murine melanoma monolayers with L-DOPA oxidation; tyrosinase-activity assays via dopachrome absorbance at 475 nm. Working concentrations typically span 0.1 nM – 1 µM.",
  },
  {
    q: "Which photoprotection endpoints are studied in vitro?",
    a: "UVB-induced pyrimidine-dimer formation and cyclobutane-pyrimidine-dimer (CPD) repair kinetics in primary human melanocytes; MITF and TYR transcript induction by qPCR; eumelanin vs pheomelanin partitioning by HPLC of soluble melanin fractions; oxidative-stress markers (ROS by DCFDA, 8-OHdG immunostaining) following UVA/UVB exposure of pigmented and non-pigmented keratinocyte co-cultures.",
  },
  {
    q: "How does Melanotan II differ from afamelanotide (Melanotan I)?",
    a: "Afamelanotide (Nle4-D-Phe7-α-MSH, 'Melanotan I') is a linear 13-residue analogue with high MC1R selectivity, whereas Melanotan II is a shorter cyclic peptide with broad melanocortin activity — including strong MC4R agonism. In parallel MC1R vs MC4R cAMP panels, MT-II is the standard tool for probing MC4R-driven signalling in the melanocortin system.",
  },
  {
    q: "How is Melanotan II stored and reconstituted for laboratory use?",
    a: "Store the sealed lyophilised vial at −20 °C or below, protected from light. Reconstitute in sterile bacteriostatic water; aliquot into single-use volumes and refreeze at −20 °C. Avoid more than three freeze-thaw cycles. Working solutions kept at 2–8 °C should be used within 14 days.",
  },
  {
    q: "What QC is run on each Melanotan II lot?",
    a: "HPLC purity ≥ 99.0% (C18, 0.1% TFA / acetonitrile gradient, UV 220 nm); LC-MS identity with deconvoluted mass within 1 Da of the calculated monoisotopic value; residual solvents by headspace GC to ICH Q3C limits; water content by coulometric Karl Fischer; endotoxin by kinetic-chromogenic LAL (< 5 EU/mg). Results are compiled on the batch-specific Certificate of Analysis.",
  },
  {
    q: "Where can UK research labs source Melanotan II reference material?",
    a: "PH Labs supplies Melanotan II as a lyophilised reference compound for in-vitro melanocortin-receptor and photoprotection research in UK laboratories. Every vial ships with a batch-specific Certificate of Analysis. Not for human consumption.",
  },
  {
    q: "Is Melanotan II approved for human use in the UK?",
    a: "No. Melanotan II is not authorised as a medicine by the MHRA. PH Labs supplies it strictly as a reference material for in-vitro research and analytical use.",
  },
];

const REFERENCES = [
  { citation: "Hruby V.J. et al. (1995). Cyclic lactam α-melanotropin analogues of Ac-Nle4-cyclo[Asp5,D-Phe7,Lys10]α-MSH(4–10)-NH2 with bulky aromatic amino acids at position 7 show high antagonist potency and selectivity at specific melanocortin receptors. J Med Chem 38(18):3454-3461.", doi: "10.1021/jm00018a005" },
  { citation: "Schiöth H.B. et al. (1997). Selectivity of cyclic [D-Nal7] and [D-Phe7] substituted MSH analogues for the melanocortin receptor subtypes. Peptides 18(7):1009-1013.", doi: "10.1016/S0196-9781(97)00079-X" },
  { citation: "Dorr R.T. et al. (1996). Evaluation of Melanotan-II, a superpotent cyclic melanotropic peptide in a pilot phase-I clinical study. Life Sci 58(20):1777-1784.", doi: "10.1016/0024-3205(96)00160-9" },
  { citation: "Abdel-Malek Z.A. et al. (2006). The melanocortin 1 receptor and the UV response of human melanocytes — a shift in paradigm. Photochem Photobiol 82(2):405-412.", doi: "10.1562/2005-11-23-IR-739" },
  { citation: "Wolf Horrell E.M. et al. (2016). Melanocortin 1 receptor: structure, function, and regulation. Front Genet 7:95.", doi: "10.3389/fgene.2016.00095" },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Melanotan II Comprehensive Research Guide",
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
  datePublished: "2026-07-13",
  dateModified: "2026-07-13",
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
    { "@type": "ListItem", position: 3, name: "Melanotan II Guide", item: URL },
  ],
};

export const Route = createFileRoute("/research/melanotan-ii-comprehensive-guide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { name: "keywords", content: "melanotan ii research, melanotan 2 study, MT-II reference, MC1R agonist research, MC4R agonist reference, melanocortin peptide UK" },
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
  component: MelanotanIIGuide,
});

function MelanotanIIGuide() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">Melanotan II Comprehensive Guide</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Research Reference Hub
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Melanotan II — Comprehensive Research Guide
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A UK-sourced reference for in-vitro melanocortin-receptor pharmacology, photoprotection, and melanin-synthesis studies. Non-selective agonist at MC1R / MC3R / MC4R / MC5R. Every vial ships with a batch-specific Certificate of Analysis.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">At a glance</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-slate-500">Identifier</dt><dd className="font-mono text-slate-200">Melanotan II (MT-II)</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">CAS</dt><dd className="font-mono text-slate-200">121062-08-6</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Molecular formula</dt><dd className="font-mono text-slate-200">C50H69N15O9</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Monoisotopic mass</dt><dd className="font-mono text-slate-200">≈ 1024.5 Da</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Receptors</dt><dd>MC1R · MC3R · MC4R · MC5R</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Structure</dt><dd>Cyclic heptapeptide, lactam bridge</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Storage</dt><dd>−20 °C, lyophilised, dark</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Purity spec</dt><dd>≥ 99.0% HPLC</dd></div>
          </dl>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">What is Melanotan II?</h2>
          <p className="text-slate-300">
            Melanotan II is a cyclic seven-residue synthetic analogue of α-melanocyte-stimulating hormone (α-MSH). Its lactam-bridged backbone (Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2) enforces a β-turn around the D-Phe-Arg-Trp pharmacophore and dramatically boosts potency at the melanocortin receptors relative to linear α-MSH. First reported by Hruby and colleagues in the mid-1990s, MT-II remains the standard research tool for probing broad melanocortin-receptor pharmacology in vitro.
          </p>
          <p className="mt-3 text-slate-300">
            In UK research laboratories MT-II is used as the reference non-selective agonist alongside native α-MSH, the MC1R-selective analogue <a className="text-emerald-400 hover:underline" href="/products/bpc-157-research-peptide">BPC-157</a> (for orthogonal tissue-repair panels), and antagonist controls SHU-9119 and agouti-related peptide (AgRP).
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Receptor pharmacology (in vitro)</h2>
          <p className="text-slate-300">
            In CHO-K1 or HEK293 lines stably expressing individual human melanocortin receptors coupled to a cAMP biosensor, MT-II drives concentration-dependent cAMP accumulation with sub-nanomolar EC50 at MC1R (~0.05–0.3 nM) and MC4R (~0.1–0.5 nM), and low-nanomolar potency at MC3R and MC5R. β-arrestin-2 recruitment assays (PathHunter, Tango) reveal a modestly biased profile relative to native α-MSH — a property exploited in mechanistic in-vitro work on receptor internalisation and signalling compartmentalisation.
          </p>
          <p className="mt-3 text-slate-300">
            Standard antagonist controls are SHU-9119 (MC3R/MC4R) and AgRP(83–132) (MC3R/MC4R inverse agonist). For MC1R-selective work, the endogenous inverse agonist agouti-signalling protein (ASIP) is the reference antagonist. Schild-plot experiments with these tools confirm competitive antagonism of MT-II across the receptor subtypes.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Photoprotection and melanin-synthesis assays</h2>
          <p className="text-slate-300">
            The MC1R arm of the melanocortin system is the pigmentation and UV-response node in melanocytes. In-vitro protocols using MT-II as the reference agonist typically read out three endpoint classes:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-300">
            <li><strong>Melanin content and composition.</strong> B16-F10 murine melanoma monolayers or primary human melanocytes are incubated with MT-II (1 nM – 1 µM, 48–72 h). Total soluble melanin is measured at 405 nm after NaOH lysis; eumelanin vs pheomelanin partitioning is quantified by HPLC of pyrrole-2,3,5-tricarboxylic acid (PTCA) and 4-amino-3-hydroxyphenylalanine (4-AHP) markers.</li>
            <li><strong>Tyrosinase activity.</strong> Dopachrome formation from L-DOPA is monitored kinetically at 475 nm in lysates from MT-II-treated melanocytes. MITF and TYR transcript induction is read out in parallel by RT-qPCR.</li>
            <li><strong>UV-response endpoints.</strong> UVB-induced cyclobutane-pyrimidine-dimer (CPD) formation and repair kinetics in MT-II-pretreated melanocytes are quantified by CPD-specific ELISA or immunostaining. Oxidative-stress markers (ROS by DCFDA, 8-OHdG by immunostain) are measured after UVA/UVB dosing of pigmented vs non-pigmented keratinocyte co-cultures.</li>
          </ul>
          <p className="mt-3 text-slate-300">
            These endpoints together support mechanistic in-vitro research on the MC1R–α-MSH axis in melanin synthesis and DNA-damage response. MT-II is the tool compound; native α-MSH is the physiological reference; afamelanotide is the MC1R-selective comparator.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">QC, identity, and release testing</h2>
          <p className="text-slate-300">
            Release HPLC is run on a 4.6 × 250 mm, 5 µm C18 column at 30 °C. Mobile phase A is 0.1% TFA in water; B is 0.1% TFA in acetonitrile. A typical gradient ramps 15% B → 45% B over 30 min at 1.0 mL/min, UV at 220 nm; MT-II elutes at approximately 12–14 minutes. Release specification: ≥ 99.0% main-peak area, no single related-substance peak above 0.5%.
          </p>
          <p className="mt-3 text-slate-300">
            Identity is confirmed by orthogonal LC-MS (0.1% formic acid gradient, UPLC C18, ESI-Q-TOF); deconvoluted mass must match the calculated monoisotopic value within 1 Da. Counter-ion content (TFA) is quantified by ion chromatography (typically 4–10% w/w). Residual solvents are screened by headspace GC against ICH Q3C limits. Water content is measured by coulometric Karl Fischer titration. Endotoxin is quantified by kinetic-chromogenic LAL (limit &lt; 5 EU/mg). All release data are compiled into the batch-specific Certificate of Analysis shipped with each vial.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Storage and handling</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-300">
            <li>Store the sealed lyophilised vial at −20 °C or below, protected from light.</li>
            <li>Reconstitute in sterile bacteriostatic water; the D-Phe residue provides some stability to enzymatic degradation but the cyclic backbone remains light-sensitive in solution.</li>
            <li>Aliquot into single-use volumes immediately; refreeze at −20 °C.</li>
            <li>Avoid more than three freeze-thaw cycles.</li>
            <li>Working solutions held at 2–8 °C in amber vials should be used within 14 days.</li>
          </ul>
          <p className="mt-3 text-sm text-slate-400">
            See the <a className="text-emerald-400 hover:underline" href="/storage-guide">peptide storage guide</a> for full handling protocols and the <a className="text-emerald-400 hover:underline" href="/products/bacteriostatic-water-research-compound">bacteriostatic water</a> reference compound.
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">Source from a UK laboratory supplier</h2>
          <p className="text-slate-300">
            PH Labs is a UK-based supplier of research peptides for in-vitro work. Every Melanotan II lot is QC'd in-house against the protocols above, and each vial ships with a batch-specific Certificate of Analysis.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/melanotan-ii-research-peptide" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              View Melanotan II reference vials →
            </a>
            <a href="/research" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Browse the research hub
            </a>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">Related references</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <li><a href="/products/pt-141-research-peptide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">PT-141 (bremelanotide) — MC3R/MC4R reference</a></li>
            <li><a href="/products/ghk-cu-research-peptide" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">GHK-Cu — copper-tripeptide skin-biology reference</a></li>
            <li><a href="/research/bpc-157-uk" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">BPC-157 UK research hub</a></li>
            <li><a href="/products" className="block rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500">All research peptide references</a></li>
          </ul>
          <p className="mt-3 text-sm text-slate-400">
            Laboratories studying the melanocortin system frequently pair Melanotan II with <a href="/products/pt-141-research-peptide" className="text-emerald-400 hover:underline">PT-141 (bremelanotide)</a> as the MC3R/MC4R-biased comparator in cAMP and β-arrestin panels.
          </p>
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
          <p>This page is a technical reference for UK research laboratories. PH Labs supplies Melanotan II strictly as a reference material for in-vitro work and analytical use. <strong>For Research Use Only. Not for Human Consumption.</strong></p>
        </footer>
      </article>
    </main>
  );
}
