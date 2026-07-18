/**
 * GHK-Cu Comprehensive Research Guide — /research/ghk-cu-guide
 *
 * Targets the 'ghk-cu research peptide' cluster with a technical, compliance-safe
 * guide focused on copper(II) binding, matrix-remodelling biochemistry, and
 * in-vitro characterisation. Follows the same structure as the retatrutide
 * and BPC-157 guides.
 *
 * For Research Use Only. Not for Human Consumption.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo-meta";

const URL = `${SITE_URL}/research/ghk-cu-guide`;
const TITLE =
  "GHK-Cu Research Peptide Guide | Copper Binding, Mechanism & Tissue-Remodelling Assays | PH Labs";
const DESCRIPTION =
  "Comprehensive UK research guide to GHK-Cu (glycyl-L-histidyl-L-lysine:copper(II)): copper coordination chemistry, mechanism of action at MMP/TIMP and collagen pathways, in-vitro assay panels, and QC release testing. Research use only.";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is GHK-Cu and how is it different from GHK?",
    a: "GHK is the endogenous tripeptide glycyl-L-histidyl-L-lysine (Gly-His-Lys), first isolated from human plasma by Pickart in the early 1970s. GHK-Cu is the 1:1 complex of GHK with copper(II), in which the imidazole nitrogen of histidine, the amide nitrogen of the Gly-His bond, and the α-amino group of glycine form a square-planar coordination sphere around Cu(II). The copper-bound form is the biologically active species used in matrix-remodelling and antioxidant-response in-vitro research; the free peptide is generally regarded as a copper carrier.",
  },
  {
    q: "What is the accepted mechanism of action for GHK-Cu in research systems?",
    a: "In cultured fibroblast and keratinocyte systems, GHK-Cu modulates transcription of extracellular-matrix genes: it upregulates type I and type III collagen, decorin, and TIMP-1/TIMP-2, while downregulating MMP-2 and (in some models) MMP-9. It also acts as a Cu(II) chaperone for enzymes such as lysyl oxidase and Cu/Zn-SOD, and buffers Fenton-driven hydroxyl-radical chemistry by keeping Cu(II) tightly chelated. In-vitro readouts converge on collagen deposition, matrix stiffness, and Nrf2/antioxidant-response gene panels.",
  },
  {
    q: "How is copper binding characterised in the laboratory?",
    a: "Cu(II) coordination to GHK is characterised by UV-Vis (d-d band near 525 nm, ligand-to-metal charge transfer near 240 nm), EPR (axial gII ≈ 2.20, AII ≈ 195 × 10⁻⁴ cm⁻¹), and ITC or potentiometric titration to derive the conditional log K near 16 at physiological pH. Circular dichroism in the 300–800 nm range confirms the ATCUN-like square-planar geometry.",
  },
  {
    q: "Which in-vitro assays are used to profile a GHK-Cu reference lot?",
    a: "Standard readouts include: hydroxyproline / Sirius Red collagen deposition in human dermal fibroblasts, ELISA quantification of MMP-2/MMP-9 and TIMP-1/TIMP-2, qPCR of COL1A1/COL3A1/DCN, DPPH and ORAC free-radical-scavenging assays for the antioxidant arm, and Cu(II) ionophore controls (e.g. neocuproine) to confirm that observed effects are copper-dependent rather than a peptide-only phenotype.",
  },
  {
    q: "Where can UK laboratories buy GHK-Cu reference material?",
    a: "PH Labs supplies GHK-Cu as a lyophilised reference compound to UK research facilities. Every vial is QC'd in-house (≥99.0% HPLC, LC-MS identity confirming the Cu(II) adduct, Karl Fischer water, residual solvents, LAL endotoxin) and shipped with a batch-specific Certificate of Analysis.",
  },
  {
    q: "Is GHK-Cu approved for human use?",
    a: "No. PH Labs supplies GHK-Cu strictly as a reference material for in-vitro research and analytical use. It is not a medicine and is not authorised for human consumption or clinical application.",
  },
];

const REFERENCES = [
  { citation: "Pickart L. & Thaler M.M. (1973). Tripeptide in human serum which prolongs survival of normal liver cells. Nature New Biology.", doi: "10.1038/newbio243085a0" },
  { citation: "Pickart L. et al. (2015). GHK peptide as a natural modulator of multiple cellular pathways. Oxid Med Cell Longev.", doi: "10.1155/2015/648108" },
  { citation: "Maquart F.X. et al. (1988). Stimulation of collagen synthesis in fibroblast cultures by the tripeptide-copper complex glycyl-L-histidyl-L-lysine-Cu2+. FEBS Lett.", doi: "10.1016/0014-5793(88)80832-9" },
  { citation: "Simeon A. et al. (2000). Expression of glycosaminoglycans and small proteoglycans in wounds: modulation by the tripeptide-copper complex GHK-Cu. J Invest Dermatol.", doi: "10.1046/j.1523-1747.2000.00889.x" },
  { citation: "Hureau C. et al. (2011). Coordination chemistry of copper with peptides: revisiting the ATCUN motif. Coord Chem Rev.", doi: "10.1016/j.ccr.2011.05.007" },
];

const ARTICLE_LD = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "GHK-Cu Comprehensive Research Guide — Copper Binding, Mechanism & Tissue-Remodelling Assays",
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
  datePublished: "2026-07-18",
  dateModified: "2026-07-18",
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
    { "@type": "ListItem", position: 3, name: "GHK-Cu Research Guide", item: URL },
  ],
};

export const Route = createFileRoute("/research/ghk-cu-guide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      {
        name: "keywords",
        content:
          "ghk-cu research peptide, ghk-cu uk, ghk copper peptide, glycyl-histidyl-lysine copper, ghk-cu mechanism of action, ghk-cu collagen research, ghk-cu tissue remodelling",
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
  component: GhkCuGuidePage,
});

function GhkCuGuidePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-400">
          <a href="/" className="hover:text-emerald-400">Home</a>
          <span className="mx-2">/</span>
          <a href="/research" className="hover:text-emerald-400">Research</a>
          <span className="mx-2">/</span>
          <span className="text-slate-300">GHK-Cu Research Guide</span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 inline-block rounded-full bg-emerald-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Comprehensive Research Guide
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            GHK-Cu — Copper Coordination Chemistry &amp; Tissue-Remodelling Research
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            A technical, UK-focused research guide to the glycyl-L-histidyl-L-lysine:copper(II) complex (GHK-Cu): how the tripeptide chelates Cu(II) with ATCUN-like geometry, how that copper-bound species modulates MMP/TIMP balance and collagen deposition in cultured fibroblasts, and how a UK laboratory characterises a GHK-Cu reference lot in-vitro.
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-amber-400">
            For Research Use Only. Not for Human Consumption.
          </p>
        </header>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">In this guide</h2>
          <ol className="list-decimal space-y-1 pl-6 text-slate-300">
            <li><a href="#molecule" className="hover:text-emerald-400">The molecule at a glance</a></li>
            <li><a href="#copper-binding" className="hover:text-emerald-400">Copper(II) binding &amp; coordination chemistry</a></li>
            <li><a href="#mechanism" className="hover:text-emerald-400">Mechanism of action in tissue-remodelling research</a></li>
            <li><a href="#assays" className="hover:text-emerald-400">In-vitro assay panel</a></li>
            <li><a href="#qc" className="hover:text-emerald-400">QC, identity, and release testing</a></li>
            <li><a href="#storage" className="hover:text-emerald-400">Storage &amp; reconstitution</a></li>
            <li><a href="#buy-uk" className="hover:text-emerald-400">Sourcing GHK-Cu in the UK</a></li>
            <li><a href="#faq" className="hover:text-emerald-400">FAQ &amp; references</a></li>
          </ol>
        </section>

        <section id="molecule" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">1. The molecule at a glance</h2>
          <dl className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-slate-500">Peptide</dt><dd className="font-mono text-slate-200">Gly-L-His-L-Lys</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Complex</dt><dd className="font-mono text-slate-200">[Cu(GHK)]<sup>+</sup> · 1:1 Cu(II)</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">CAS (GHK-Cu)</dt><dd className="font-mono text-slate-200">89030-95-5</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">CAS (free GHK)</dt><dd className="font-mono text-slate-200">49557-75-7</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Peptide formula</dt><dd className="font-mono text-slate-200">C<sub>14</sub>H<sub>24</sub>N<sub>6</sub>O<sub>4</sub></dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Peptide MW</dt><dd className="font-mono text-slate-200">340.4 Da</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Complex MW</dt><dd className="font-mono text-slate-200">≈ 402 Da (Cu(II) adduct)</dd></div>
            <div><dt className="text-xs uppercase text-slate-500">Coordination geometry</dt><dd>Square-planar, ATCUN-like</dd></div>
          </dl>
          <p className="mt-4 text-slate-300">
            GHK was originally isolated by Pickart from human plasma as a fraction that extended the survival of primary hepatocytes in culture (Pickart &amp; Thaler, 1973). The tripeptide's affinity for Cu(II) is high enough that under physiological conditions it exists almost exclusively as the 1:1 copper complex — meaning nearly all mechanistic in-vitro work references the copper-bound species GHK-Cu rather than the free peptide.
          </p>
        </section>

        <section id="copper-binding" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">2. Copper(II) binding &amp; coordination chemistry</h2>
          <p className="text-slate-300">
            GHK is a classic ATCUN-motif analogue. Three nitrogen donors from the peptide plus one exogenous oxygen or water molecule complete a square-planar Cu(II) coordination sphere:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-300">
            <li><strong className="text-slate-100">N1</strong> — the α-amino group of the N-terminal glycine.</li>
            <li><strong className="text-slate-100">N2</strong> — the deprotonated amide nitrogen of the Gly–His peptide bond.</li>
            <li><strong className="text-slate-100">N3</strong> — the Nπ imidazole nitrogen of histidine.</li>
            <li><strong className="text-slate-100">O4</strong> — an axial water / carboxylate oxygen completing the plane.</li>
          </ul>
          <p className="mt-3 text-slate-300">
            Conditional stability constants at physiological pH have been reported around log K ≈ 16, comparable to the human-serum-albumin ATCUN site. Diagnostic spectroscopic signatures of the bound complex are a d-d absorption band centred near 525 nm, an EPR signal with axial g<sub>II</sub> ≈ 2.20 and A<sub>II</sub> ≈ 195 × 10⁻⁴ cm⁻¹, and a positive Cotton effect in the 500–600 nm region by CD. These readouts distinguish authentic Cu(II)-loaded reference material from apo-peptide or partially loaded lots and are recommended as an identity check on any received GHK-Cu batch.
          </p>
        </section>

        <section id="mechanism" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">3. Mechanism of action in tissue-remodelling research</h2>
          <p className="text-slate-300">
            In cultured dermal fibroblasts and keratinocytes, GHK-Cu converges on three mechanistic arms that are consistently reproduced across research groups:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-slate-300">
            <li><strong className="text-slate-100">Extracellular-matrix synthesis.</strong> Upregulation of <em>COL1A1</em>, <em>COL3A1</em>, decorin (<em>DCN</em>), and fibronectin at the mRNA and protein level, with a measurable increase in Sirius Red-stained collagen and hydroxyproline in fibroblast supernatants (Maquart et al., 1988; Simeon et al., 2000).</li>
            <li><strong className="text-slate-100">MMP / TIMP rebalancing.</strong> Increased TIMP-1 and TIMP-2 secretion with concurrent suppression of MMP-2 in fibroblast conditioned medium, shifting the net matrix balance towards deposition rather than degradation.</li>
            <li><strong className="text-slate-100">Copper-dependent redox and enzyme-loading effects.</strong> GHK-Cu acts as a physiological Cu(II) chaperone for Cu/Zn-SOD and lysyl oxidase, and buffers Fenton-driven hydroxyl-radical chemistry by keeping Cu(II) tightly chelated. This is measurable as reduced DPPH signal and increased Nrf2-response element activity in reporter assays.</li>
          </ul>
          <p className="mt-3 text-slate-300">
            Because the biological activity is tightly coupled to Cu(II), mechanistic experiments should always be paralleled with a free-GHK control and an ionophore control (e.g. neocuproine) to confirm that observed phenotypes require the intact copper complex rather than the peptide backbone alone.
          </p>
        </section>

        <section id="assays" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">4. In-vitro assay panel</h2>
          <p className="text-slate-300">
            A representative assay panel for characterising a GHK-Cu reference lot in a UK laboratory:
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
                  <td className="p-3">Collagen deposition</td>
                  <td className="p-3">Primary human dermal fibroblasts (HDFa)</td>
                  <td className="p-3">Hydroxyproline / Sirius Red</td>
                  <td className="p-3">1 nM – 10 µM</td>
                </tr>
                <tr>
                  <td className="p-3">MMP / TIMP profile</td>
                  <td className="p-3">Fibroblast conditioned medium</td>
                  <td className="p-3">ELISA (MMP-2, MMP-9, TIMP-1/2)</td>
                  <td className="p-3">1 nM – 1 µM</td>
                </tr>
                <tr>
                  <td className="p-3">Copper coordination</td>
                  <td className="p-3">Cell-free buffer, pH 7.4</td>
                  <td className="p-3">UV-Vis 525 nm, EPR, CD</td>
                  <td className="p-3">10 µM – 1 mM</td>
                </tr>
                <tr>
                  <td className="p-3">Antioxidant / Nrf2</td>
                  <td className="p-3">HaCaT keratinocytes, ARE-luciferase</td>
                  <td className="p-3">Luminescence, DPPH, ORAC</td>
                  <td className="p-3">100 nM – 10 µM</td>
                </tr>
                <tr>
                  <td className="p-3">Copper-dependence control</td>
                  <td className="p-3">Fibroblast + neocuproine / apo-GHK</td>
                  <td className="p-3">Collagen &amp; MMP-2 readouts</td>
                  <td className="p-3">Fixed 1 µM GHK-Cu</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-slate-300">
            Working buffers should be low in reductants (avoid DTT / TCEP at concentrations that reduce Cu(II) to Cu(I)) and free of competing chelators such as EDTA. Serum-containing media are acceptable but should be characterised for background copper before subtle Nrf2 or SOD-loading effects are interpreted.
          </p>
        </section>

        <section id="qc" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">5. QC, identity, and release testing</h2>
          <p className="text-slate-300">
            Release HPLC is run on a 4.6 × 250 mm, 5 µm C18 column at 30 °C. Mobile phase A: 0.1% TFA in water; B: 0.1% TFA in acetonitrile; a 2→30% B gradient over 25 min at 1.0 mL/min, UV 220 nm, elutes GHK-Cu at ~6–8 min. Release specification: ≥99.0% main-peak area, no single related-substance peak above 0.5%.
          </p>
          <p className="mt-3 text-slate-300">
            Identity is confirmed by LC-MS on a UPLC C18 column (0.1% formic acid gradient, ESI-Q-TOF), with observation of both the protonated peptide ([M+H]<sup>+</sup> = 341) and the copper-adduct ion cluster consistent with a 1:1 Cu(II) complex and the characteristic <sup>63</sup>Cu / <sup>65</sup>Cu isotope pattern. Copper content is quantified by ICP-MS against a NIST-traceable Cu standard and compared against the theoretical 15.8 % w/w of the 1:1 complex. Counter-ion (typically acetate or TFA) is quantified by ion chromatography, water content by coulometric Karl Fischer, residual solvents by headspace GC against ICH Q3C limits, and endotoxin by kinetic-chromogenic LAL (&lt; 5 EU/mg). All release data are compiled into the batch-specific Certificate of Analysis shipped with each vial.
          </p>
        </section>

        <section id="storage" className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">6. Storage &amp; reconstitution</h2>
          <ul className="list-disc space-y-2 pl-6 text-slate-300">
            <li>Store the sealed lyophilised vial at −20 °C or below, protected from light.</li>
            <li>Reconstitute in sterile <a className="text-emerald-400 hover:underline" href="/products/bacteriostatic-water-research-compound">bacteriostatic water</a> for stock solutions used in short-term in-vitro work.</li>
            <li>Avoid buffers containing strong chelators (EDTA, DTPA) or high-concentration thiol reductants that reduce Cu(II) to Cu(I) and destabilise the complex.</li>
            <li>Aliquot into single-use volumes immediately; refreeze at −20 °C.</li>
            <li>Avoid more than three freeze-thaw cycles.</li>
            <li>Working solutions held at 2–8 °C should be used within 14 days and re-verified by UV-Vis at 525 nm before critical experiments.</li>
          </ul>
        </section>

        <section id="buy-uk" className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-2xl font-semibold">7. Sourcing GHK-Cu reference material in the UK</h2>
          <p className="text-slate-300">
            PH Labs is a UK-based supplier of research peptides for in-vitro work. Every GHK-Cu lot is QC'd in-house using the release protocols above — including Cu(II) quantification by ICP-MS and UV-Vis identity at 525 nm — and each vial ships with a batch-specific Certificate of Analysis to a UK laboratory or institutional address.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/products/ghk-cu-research-peptide" className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500">
              View GHK-Cu reference vials →
            </a>
            <a href="/research" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              All research guides
            </a>
            <a href="/storage-guide" className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
              Storage &amp; reconstitution guide
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
          For Research Use Only. Not for Human Consumption. GHK-Cu is supplied by PH Labs strictly as a reference material for in-vitro research and analytical use. It is not a medicine and is not authorised for human or veterinary application.
        </footer>
      </article>
    </main>
  );
}
