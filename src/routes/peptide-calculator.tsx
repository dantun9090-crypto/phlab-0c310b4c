/**
 * /peptide-calculator — Research peptide reconstitution & dosing calculator.
 *
 * SEO target: "peptide calculator uk", "peptide reconstitution calculator",
 * "bac water peptide calculator" (Semrush UK gap analysis — competitor pages
 * rank top-3 with zero technical depth). Pure client-side math, no PII,
 * no user accounts, no medical claims — purely a laboratory utility.
 *
 * Compliance: every result block is framed as in-vitro reference math for
 * research use only. Internal-link booster surfaces TB-500, BPC-157,
 * Retatrutide PDPs for organic distribution.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

const TITLE = "Peptide Reconstitution Calculator UK | PH Labs";
const DESCRIPTION =
  "Free research peptide reconstitution calculator. Convert vial mg + BAC water mL into mg/mL, mcg/mL and U-100 syringe units. For in-vitro laboratory research only — not for human consumption.";
const URL_SELF = "https://phlabs.co.uk/peptide-calculator";

const APP_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PH Labs Peptide Reconstitution Calculator (UK)",
  applicationCategory: "ScientificCalculatorApplication",
  operatingSystem: "Any",
  url: URL_SELF,
  description: DESCRIPTION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
};

export const Route = createFileRoute("/peptide-calculator")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { name: "keywords", content: "peptide calculator uk, peptide reconstitution calculator, bac water peptide calculator, research peptide mg ml, peptide dosing calculator uk" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL_SELF },
    ],
    links: [{ rel: "canonical", href: URL_SELF }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(APP_LD) }],
  }),
  component: PeptideCalculatorPage,
});

function PeptideCalculatorPage() {
  const [vialMg, setVialMg] = useState<number>(10);
  const [bacMl, setBacMl] = useState<number>(2);
  const [desiredMcg, setDesiredMcg] = useState<number>(250);
  const [syringeUnits, setSyringeUnits] = useState<number>(100); // U-100 insulin syringe

  const { mgPerMl, mcgPerMl, mlForDose, unitsForDose } = useMemo(() => {
    const safeVialMg = Number.isFinite(vialMg) && vialMg > 0 ? vialMg : 0;
    const safeBacMl = Number.isFinite(bacMl) && bacMl > 0 ? bacMl : 0;
    const safeDesired = Number.isFinite(desiredMcg) && desiredMcg > 0 ? desiredMcg : 0;
    const concMgPerMl = safeBacMl > 0 ? safeVialMg / safeBacMl : 0;
    const concMcgPerMl = concMgPerMl * 1000;
    const ml = concMcgPerMl > 0 ? safeDesired / concMcgPerMl : 0;
    // U-100 syringe: 100 units = 1 mL → units = mL × 100.
    const units = ml * syringeUnits;
    return {
      mgPerMl: concMgPerMl,
      mcgPerMl: concMcgPerMl,
      mlForDose: ml,
      unitsForDose: units,
    };
  }, [vialMg, bacMl, desiredMcg, syringeUnits]);


  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-950 px-4 py-12 text-slate-100">


      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
          Research utility
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          Peptide Reconstitution Calculator (UK)
        </h1>
        <p className="mt-3 text-slate-300">
          Convert a lyophilised research-peptide vial (mg) and bacteriostatic water diluent (mL)
          into concentration, per-aliquot volume and U-100 syringe units. Math only — for
          in-vitro laboratory reference. <strong>Not for human consumption.</strong>
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block text-slate-300">Vial mass (mg)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={vialMg}
              onChange={(e) => setVialMg(parseFloat(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-300">Bacteriostatic water (mL)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={bacMl}
              onChange={(e) => setBacMl(parseFloat(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-300">Desired per-aliquot amount (mcg)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={desiredMcg}
              onChange={(e) => setDesiredMcg(parseFloat(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-slate-300">Syringe scale (units / mL)</span>
            <select
              value={syringeUnits}
              onChange={(e) => setSyringeUnits(parseInt(e.target.value, 10))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              <option value={100}>U-100 (100 units / mL — standard insulin syringe)</option>
              <option value={50}>U-50 (50 units / mL)</option>
              <option value={40}>U-40 (40 units / mL)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mb-10 grid gap-3 sm:grid-cols-2">
        <ResultCard label="Concentration" value={`${mgPerMl.toFixed(3)} mg/mL`} sub={`${mcgPerMl.toFixed(0)} mcg/mL`} />
        <ResultCard label="Per-aliquot volume" value={`${mlForDose.toFixed(3)} mL`} sub={`= ${unitsForDose.toFixed(1)} syringe units`} />
      </section>

      <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 text-xl font-semibold">Math reference</h2>
        <ul className="list-disc space-y-2 pl-6 text-slate-300">
          <li><strong>Concentration (mg/mL)</strong> = vial mass (mg) ÷ diluent volume (mL).</li>
          <li><strong>Per-aliquot volume (mL)</strong> = desired amount (mcg) ÷ concentration (mcg/mL).</li>
          <li><strong>U-100 syringe units</strong> = volume (mL) × 100. On a U-100 insulin syringe, every <em>full barrel</em> is 1 mL = 100 units.</li>
        </ul>
      </section>

      <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 text-xl font-semibold">Reference compounds</h2>
        <p className="text-slate-300">
          The calculator is provided alongside PH Labs' HPLC-verified analytical reference
          standards, including{" "}
          <a className="text-emerald-400 hover:underline" href="/products/tb-500-thymosin-beta-4">
            TB-500 (Thymosin Beta-4)
          </a>
          ,{" "}
          <a className="text-emerald-400 hover:underline" href="/products/bpc-157">
            BPC-157
          </a>
          {" "}and{" "}
          <a className="text-emerald-400 hover:underline" href="/products/retatrutide-research-peptide">
            Retatrutide
          </a>
          . Each batch ships with a matched Certificate of Analysis confirming ≥99% purity.
        </p>
      </section>

      <footer className="mt-12 border-t border-slate-800 pt-6 text-xs text-slate-500">
        Calculator is provided strictly as an in-vitro laboratory reference utility. PH Labs
        supplies research compounds for scientific research only — not for human consumption,
        dietary supplementation, or veterinary treatment.
      </footer>
    </main>
  );
}

function ResultCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{sub}</div>
    </div>
  );
}
