/**
 * Retatrutide Comprehensive Research Guide — /research/retatrutide-comprehensive-guide
 *
 * Targets 'retatrutide uk buy' (currently pos 36) and 'retatrutide vs tirzepatide'
 * clusters with a technical, compliance-safe guide focused on the triple-agonist
 * (GIP / GLP-1 / Glucagon) mechanism of action and a receptor-level comparison
 * against tirzepatide.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/retatrutide-comprehensive-guide`;
const TITLE =
  "Retatrutide Comprehensive Research Guide | Triple Agonist Mechanism & Tirzepatide Comparison | PH Labs";
const DESCRIPTION =
  "Comprehensive UK research guide to retatrutide (LY3437943): triple-agonist mechanism at GLP-1, GIP and glucagon receptors, in-vitro pharmacology, QC, and a technical head-to-head against tirzepatide. Research use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What makes retatrutide a triple agonist?",
    a: "Retatrutide (LY3437943) is a single 39-residue acylated peptide engineered to activate three class-B GPCRs — the GLP-1 receptor (GLP-1R), the glucose-dependent insulinotropic polypeptide receptor (GIPR), and the glucagon receptor (GCGR) — with balanced potency in cAMP accumulation assays (approx. 0.05–0.30 nM EC50 at each receptor; Urva et al., Lancet 2022).",
  },
  {
    q: "How does the retatrutide mechanism differ from tirzepatide?",
    a: "Tirzepatide is a dual GIP/GLP-1 receptor agonist. Retatrutide adds a balanced glucagon-receptor (GCGR) component. In hepatocyte and HepG2 in-vitro assays the retained GCGR arm engages cAMP-driven hepatic-lipid-oxidation pathways not activated by tirzepatide, which is why retatrutide is used as the reference triagonist in mechanistic incretin panels.",
  },
  {
    q: "Which in-vitro assays characterise the triple-agonist profile?",
    a: "cAMP accumulation (cAMP Hunter, DiscoverX) in CHO-K1 or HEK293 lines stably expressing human GLP-1R, GIPR, or GCGR; β-arrestin-2 recruitment via PathHunter / Tango; radioligand competition against [125I]-GLP-1 or [125I]-glucagon in transfected membranes; and receptor-specific antagonism with exendin-9(39) (GLP-1R), GIP(3-30)NH2 (GIPR), and des-His1-[Glu9]-glucagon(1-29) (GCGR) to deconvolute individual contributions.",
  },
  {
    q: "Why is the C20 fatty-diacid pendant important?",
    a: "The γGlu-C20-diacid moiety attached at Lys17 drives non-covalent binding to serum albumin, extending the apparent plasma half-life to roughly six days in rodent PK models. Combined with Aib at position 2 and α-methyl-Lys at position 13, it also suppresses DPP-4 cleavage in plasma-stability assays.",
  },
  {
    q: "Where can UK labs buy retatrutide reference material?",
    a: "PH Labs supplies retatrutide as a lyophilised reference compound to UK research facilities. Every vial is QC'd in-house (≥99.0% HPLC, LC-MS identity, Karl Fischer, residual solvents, LAL endotoxin) and shipped with a batch-specific Certificate of Analysis.",
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
  { citation: "Coskun T. et al. (2018). LY3298176 (tirzepatide), a novel dual GIP/GLP-1 receptor agonist. Mol Metab.", doi: "10.1016/j.molmet.2018.09.009" },
  { citation: "Willard F.S. et al. (2020). Tirzepatide, a GIP/GLP-1 agonist with a novel mechanism of action. JCI Insight.", doi: "10.1172/jci.insight.140532" },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Retatrutide Comprehensive Research Guide — Triple Agonist Mechanism & Tirzepatide Comparison",
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
  datePublished: "2026-07-07",
  dateModified: "2026-07-07",
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
    { "@type": "ListItem", position: 3, name: "Retatrutide Comprehensive Guide", item: URL },
  ],
};

export const Route = createFileRoute("/research/retatrutide-comprehensive-guide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      {
        name: "keywords",
        content:
          "retatrutide uk buy, retatrutide vs tirzepatide, retatrutide mechanism of action, triple agonist GLP-1 GIP glucagon, LY3437943, retatrutide research guide, retatrutide receptor pharmacology",
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
  component: RetatrutideComprehensiveGuidePage,
});

function RetatrutideComprehensiveGuidePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">Retatrutide Comprehensive Guide</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Comprehensive Research Guide
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Retatrutide — Triple-Agonist Mechanism &amp; Tirzepatide Comparison
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A technical, UK-focused research guide to retatrutide (LY3437943): how a single 39-residue peptide balances agonism at the GLP-1, GIP, and glucagon receptors, how that mechanism differs from tirzepatide's dual GIP/GLP-1 profile, and how to characterise it in the in-vitro laboratory.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">In this guide</h2>
          <ol className="list-decimal space-y-1 pl-6 text-slate-300">
            <li><a href="#molecule" className="hover:text-emerald-400">The molecule at a glance</a></li>
            <li><a href="#mechanism" className="hover:text-emerald-400">Triple-agonist mechanism of action</a></li>
            <li><a href="#pharmacology" className="hover:text-emerald-400">Receptor pharmacology &amp; assay panel</a></li>
            <li><a href="#vs-tirzepatide" className="hover:text-emerald-400">Retatrutide vs tirzepatide — technical comparison</a></li>
            <li><a href="#qc" className="hover:text-emerald-400">QC, identity, and release testing</a></li>
            <li><a href="#storage" className="hover:text-emerald-400">Storage &amp; reconstitution</a></li>
            <li><a href="#buy-uk" className="hover:text-emerald-400">Sourcing retatrutide in the UK</a></li>
            <li><a href="#faq" className="hover:text-emerald-400">FAQ &amp; references</a></li>
          </ol>
        </section>

        <section id="molecule" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">1. The molecule at a glance</h2>
          <dl className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-slate-500">Identifier</dt><dd className="font-mono text-slate-200">LY3437943</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">CAS</dt><dd className="font-mono text-slate-200">2381089-83-2</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Molecular formula</dt><dd className="font-mono text-slate-200">C221H343N51O63</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Monoisotopic mass</dt><dd className="font-mono text-slate-200">≈ 4731 Da</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Length</dt><dd>39 residues</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Receptors</dt><dd>GLP-1R · GIPR · GCGR</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Lipid pendant</dt><dd>γGlu-C20 fatty diacid @ Lys17</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Non-canonical residues</dt><dd>Aib @ pos 2, α-methyl-Lys @ pos 13</dd></div>
          </dl>
          <p className="mt-4 text-slate-300">
            Retatrutide was disclosed by Coskun et al. in <em>Nature Metabolism</em> (2022) as the first structurally balanced synthetic triagonist of the GLP-1, GIP, and glucagon receptors. Every design choice — the Aib at position 2, the α-methyl-Lys at position 13, and the γGlu-C20 fatty-diacid pendant — is aimed at DPP-4 resistance, albumin binding, and preservation of glucagon-receptor efficacy that native GLP-1-family peptides lose during optimisation.
          </p>
        </section>

        <section id="mechanism" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">2. Triple-agonist mechanism of action</h2>
          <p className="text-slate-300">
            Retatrutide's mechanism spans three class-B GPCRs that share a Gαs-coupled cAMP output but drive distinct downstream biology:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-300">
            <li><strong className="text-slate-100">GLP-1R</strong> — expressed on pancreatic β-cells, enteroendocrine L-cells, and CNS nuclei. cAMP/PKA/EPAC2 signalling is the canonical incretin arm studied in in-vitro insulin-secretion models (INS-1 832/3, MIN6).</li>
            <li><strong className="text-slate-100">GIPR</strong> — expressed on β-cells, adipocytes, and osteoclasts. In-vitro cAMP accumulation in transfected CHO-K1 lines is the primary readout; adipocyte lipolysis and β-cell insulin secretion are the mechanistic endpoints of interest.</li>
            <li><strong className="text-slate-100">GCGR</strong> — expressed on hepatocytes. cAMP-driven glycogenolysis, gluconeogenesis, and — critically for the retatrutide research programme — hepatic lipid oxidation and lipolysis in cultured hepatocytes.</li>
          </ul>
          <p className="mt-3 text-slate-300">
            Because the three receptors are engaged by the same molecule with similar EC50, retatrutide behaves as a "balanced" triagonist rather than a biased one — meaning in mechanistic in-vitro panels the observed phenotype is the summed cAMP response across whichever receptors are expressed in the model system. Antagonist-deconvolution experiments (see §3) are the standard technique for isolating individual receptor contributions.
          </p>
        </section>

        <section id="pharmacology" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">3. Receptor pharmacology &amp; assay panel</h2>
          <p className="text-slate-300">
            The canonical in-vitro workflow for characterising a retatrutide reference lot uses three assay families in parallel:
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="p-3">Assay</th>
                  <th className="p-3">Cell system</th>
                  <th className="p-3">Readout</th>
                  <th className="p-3">Typical range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/60 text-slate-300">
                <tr>
                  <td className="p-3">cAMP accumulation</td>
                  <td className="p-3">CHO-K1 / HEK293 stably expressing hGLP-1R, hGIPR, hGCGR</td>
                  <td className="p-3">HTRF or cAMP Hunter</td>
                  <td className="p-3">1 pM – 100 nM</td>
                </tr>
                <tr>
                  <td className="p-3">β-arrestin-2 recruitment</td>
                  <td className="p-3">PathHunter EA-tag lines</td>
                  <td className="p-3">Enzyme complementation, luminescence</td>
                  <td className="p-3">10 pM – 1 µM</td>
                </tr>
                <tr>
                  <td className="p-3">Competition binding</td>
                  <td className="p-3">Membranes from transfected HEK293</td>
                  <td className="p-3">[125I]-GLP-1 / [125I]-glucagon displacement</td>
                  <td className="p-3">100 pM – 10 µM</td>
                </tr>
                <tr>
                  <td className="p-3">Antagonist deconvolution</td>
                  <td className="p-3">Mixed-receptor primary or CHO co-expression</td>
                  <td className="p-3">cAMP with exendin-9(39), GIP(3-30)NH2, des-His1-[Glu9]-glucagon(1-29)</td>
                  <td className="p-3">Fixed 30 nM retatrutide</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-slate-300">
            Reported EC50 values cluster around 0.05–0.30 nM at all three receptors (Urva et al., 2022). Working buffers for plasma-stability comparisons typically include 4% human serum albumin to model the albumin-bound fraction driven by the C20 lipid pendant.
          </p>
        </section>

        <section id="vs-tirzepatide" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">4. Retatrutide vs tirzepatide — technical comparison</h2>
          <p className="text-slate-300">
            Retatrutide and <a className="text-emerald-400 hover:underline" href="/products/tirzepatide-research-peptide">tirzepatide</a> are frequently benchmarked side-by-side because both are lipid-modified incretin-family peptides from the same discovery programme. The mechanistic difference reduces to one axis: glucagon-receptor engagement.
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="p-3">Property</th>
                  <th className="p-3">Retatrutide (LY3437943)</th>
                  <th className="p-3">Tirzepatide (LY3298176)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/60 text-slate-300">
                <tr><td className="p-3">Receptor profile</td><td className="p-3">GLP-1R + GIPR + GCGR (triple)</td><td className="p-3">GLP-1R + GIPR (dual)</td></tr>
                <tr><td className="p-3">Length</td><td className="p-3">39 residues</td><td className="p-3">39 residues</td></tr>
                <tr><td className="p-3">Backbone origin</td><td className="p-3">GIP-based scaffold, glucagon-tuned C-terminus</td><td className="p-3">GIP-based scaffold, GLP-1-tuned mid-region</td></tr>
                <tr><td className="p-3">Lipid pendant</td><td className="p-3">γGlu-C20 diacid @ Lys17</td><td className="p-3">γGlu-2×γGlu-C20 diacid @ Lys20</td></tr>
                <tr><td className="p-3">DPP-4 protection</td><td className="p-3">Aib @ pos 2, α-methyl-Lys @ pos 13</td><td className="p-3">Aib @ pos 2</td></tr>
                <tr><td className="p-3">Reported potency (cAMP, nM)</td><td className="p-3">≈ 0.05–0.30 at all three receptors</td><td className="p-3">≈ 0.03 GIPR, ≈ 0.6 GLP-1R, no GCGR activity</td></tr>
                <tr><td className="p-3">Plasma half-life (rodent PK)</td><td className="p-3">≈ 6 days</td><td className="p-3">≈ 5 days</td></tr>
                <tr><td className="p-3">Distinguishing in-vitro assay</td><td className="p-3">GCGR cAMP + hepatocyte lipolysis</td><td className="p-3">GIP-biased β-arrestin recruitment</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-slate-300">
            In practice this means comparative in-vitro panels typically pair the two compounds with a GCGR-specific antagonist (des-His1-[Glu9]-glucagon(1-29)) to isolate the glucagon arm of retatrutide's response, and with GIP(3-30)NH2 to compare their overlapping GIPR activity. For an extended comparison see the dedicated <a className="text-emerald-400 hover:underline" href="/research/tirzepatide-vs-retatrutide">tirzepatide vs retatrutide research page</a>.
          </p>
        </section>

        <section id="qc" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">5. QC, identity, and release testing</h2>
          <p className="text-slate-300">
            Release HPLC runs on a 4.6 × 250 mm, 5 µm C18 column at 30 °C. Mobile phase A: 0.1% TFA in water; B: 0.1% TFA in acetonitrile; a 25→55% B gradient over 30 min at 1.0 mL/min, UV 220 nm, elutes retatrutide at ~18–20 min. Release specification: ≥99.0% main-peak area, no single related-substance peak above 0.5%.
          </p>
          <p className="mt-3 text-slate-300">
            Identity is confirmed by LC-MS on a UPLC C18 column (0.1% formic acid gradient, ESI-Q-TOF), with the deconvoluted mass matching the calculated monoisotopic value within 1 Da. Counter-ion (TFA) content is quantified by ion chromatography (typically 4–10% w/w), residual solvents by headspace GC against ICH Q3C limits, water content by coulometric Karl Fischer, and endotoxin by kinetic-chromogenic LAL (&lt; 5 EU/mg). All release data are compiled into the batch-specific Certificate of Analysis shipped with each vial.
          </p>
        </section>

        <section id="storage" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">6. Storage &amp; reconstitution</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-300">
            <li>Store the sealed lyophilised vial at −20 °C or below, protected from light.</li>
            <li>Reconstitute in sterile <a className="text-emerald-400 hover:underline" href="/products/bacteriostatic-water-research-compound">bacteriostatic water</a> or 0.1% acetic acid.</li>
            <li>Aliquot into single-use volumes immediately; refreeze at −20 °C.</li>
            <li>Avoid more than three freeze-thaw cycles.</li>
            <li>Working solutions held at 2–8 °C should be used within 14 days.</li>
          </ul>
        </section>

        <section id="buy-uk" className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">7. Sourcing retatrutide reference material in the UK</h2>
          <p className="text-slate-300">
            PH Labs is a UK-based supplier of research peptides for in-vitro work. Every retatrutide lot is QC'd in-house using the release protocols above and each vial ships with a batch-specific Certificate of Analysis to a UK laboratory or institutional address.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/retatrutide-research-peptide" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              View Retatrutide reference vials →
            </a>
            <a href="/research/retatrutide-uk" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Retatrutide UK reference hub
            </a>
            <a href="/research/tirzepatide-vs-retatrutide" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Tirzepatide vs Retatrutide
            </a>
          </div>
        </section>

        <section id="faq" className="mb-10">
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
