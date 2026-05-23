import { useState, useMemo, useEffect } from 'react';
import { FlaskConical, RotateCcw, Info, ChevronDown, ChevronUp, Lock, UserPlus, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import { auth, onAuthStateChanged } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PeptidePreset {
  name: string;
  dose: number; // mcg
}

type TabType = 'reconstitution' | 'dose' | 'pen';

// ─── Constants ────────────────────────────────────────────────────────────────
const PEPTIDE_PRESETS: PeptidePreset[] = [
  { name: 'BPC-157', dose: 250 },
  { name: 'TB-500', dose: 2500 },
  { name: 'Semaglutide', dose: 250 },
  { name: 'Tirzepatide', dose: 2500 },
  { name: 'Ipamorelin', dose: 200 },
  { name: 'CJC-1295', dose: 100 },
  { name: 'PT-141', dose: 1000 },
  { name: 'Melanotan II', dose: 500 },
  { name: 'Retatrutide', dose: 2000 },
];

// Standard insulin pens: 1 IU = 0.01 ml (U-100 standard)
// 1 ml pen = 100 IU | 2 ml pen = 200 IU | 3 ml pen = 300 IU
const PEN_SIZES = [
  { label: '1 ml (100 IU)', totalMl: 1, totalIU: 100 },
  { label: '2 ml (200 IU)', totalMl: 2, totalIU: 200 },
  { label: '3 ml (300 IU)', totalMl: 3, totalIU: 300 },
];

// Example scenarios shown in the pen tab
const PEN_EXAMPLES = [
  {
    label: '3 mg Semaglutide — 3 ml pen',
    vialMg: 3, unit: 'mg' as const, penIdx: 2,
    note: '1 IU = 0.01 ml = 10 mcg · Typical starting dose 25 IU (250 mcg / 0.25 ml)',
  },
  {
    label: '2 mg Retatrutide — 3 ml pen',
    vialMg: 2, unit: 'mg' as const, penIdx: 2,
    note: '1 IU = 0.01 ml ≈ 6.67 mcg · 2 mg over 300 IU total',
  },
  {
    label: '5 mg Tirzepatide — 3 ml pen',
    vialMg: 5, unit: 'mg' as const, penIdx: 2,
    note: '1 IU = 0.01 ml ≈ 16.67 mcg · 30 IU ≈ 500 mcg (0.5 ml)',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format mcg value: shows mg when ≥ 1000 mcg */
function formatMcg(mcg: number): string {
  if (mcg >= 1000) return `${(mcg / 1000).toFixed(3).replace(/\.?0+$/, '')} mg`;
  return `${mcg % 1 === 0 ? mcg : mcg.toFixed(1)} mcg`;
}

/** Generate IU reference table rows at regular steps */
function generatePenTable(totalMl: number, totalIU: number, mcgPerMl?: number) {
  const rows: { iu: number; ml: string; mcg: string | null }[] = [];
  const step = totalIU <= 100 ? 5 : 10;
  for (let iu = step; iu <= totalIU; iu += step) {
    // Formula: ml = IU × (totalMl / totalIU) = IU × 0.01 for U-100
    const ml = iu * (totalMl / totalIU);
    const mcg = mcgPerMl != null ? ml * mcgPerMl : null;
    rows.push({
      iu,
      ml: ml.toFixed(2),
      mcg: mcg !== null ? formatMcg(mcg) : null,
    });
  }
  return rows;
}

// ─── Tooltip component ───────────────────────────────────────────────────────
function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(o => !o)}
        className="text-gray-500 hover:text-blue-400 transition-colors align-middle"
        aria-label="Info"
        type="button"
      >
        <Info className="w-3.5 h-3.5 inline" />
      </button>
      {open && (
        <span className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-gray-700 border border-white/10 text-gray-200 text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

// ─── InputRow ─────────────────────────────────────────────────────────────────
function InputRow({
  label, hint, unit, value, onChange, min = 0, step = 1, placeholder,
}: {
  label: string; hint: string; unit: string; value: number;
  onChange: (v: number) => void; min?: number; step?: number; placeholder?: string;
}) {
  const inputId = `calc-input-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={inputId} className="flex items-center gap-1.5 text-sm text-gray-300 mb-2 font-medium">
        {label} <Hint text={hint} />
      </label>
      <div className="flex items-center bg-gray-900 border border-white/10 rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors">
        <input
          id={inputId}
          type="number"
          min={min}
          step={step}
          value={value || ''}
          placeholder={placeholder ?? '0'}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 px-4 py-3 bg-transparent text-white text-base focus:outline-none"
        />
        <span className="px-4 text-gray-500 text-sm font-mono border-l border-white/10 py-3 bg-gray-800/50">
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────
function ResultCard({
  label, value, sub, color = 'blue',
}: {
  label: string; value: string; sub?: string; color?: 'blue' | 'green' | 'purple';
}) {
  const colors = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-xl sm:text-2xl font-bold">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Calculator() {
  const [activeTab, setActiveTab] = useState<TabType>('reconstitution');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setIsLoggedIn(!!user);
    });
    return unsub;
  }, []);

  // Reconstitution state
  const [vialMg, setVialMg] = useState<number>(5);
  const [bacWaterMl, setBacWaterMl] = useState<number>(2);
  const [desiredDoseMcg, setDesiredDoseMcg] = useState<number>(250);

  // Dose calculator state
  const [concentrationMcgMl, setConcentrationMcgMl] = useState<number>(2500);
  const [doseDoseMcg, setDoseDoseMcg] = useState<number>(250);
  const [syringeType, setSyringeType] = useState<'100' | '50'>('100');

  // Pen state
  const [selectedPenIdx, setSelectedPenIdx] = useState(2); // default 3ml
  const [penDoseIU, setPenDoseIU] = useState<number>(25);
  const [vialContentValue, setVialContentValue] = useState<number>(3);
  const [vialContentUnit, setVialContentUnit] = useState<'mg' | 'mcg'>('mg');
  const [showExamples, setShowExamples] = useState(false);

  // ── Reconstitution calculation ─────────────────────────────────────────────
  // Formula: concentration (mcg/ml) = vial_mg × 1000 / bac_water_ml
  //          dose_volume (ml)        = desired_dose_mcg / concentration
  //          syringe_units           = dose_volume × 100  (for 100-unit / 1ml syringe)
  //          doses_per_vial          = (vial_mg × 1000) / desired_dose_mcg
  const reconstitutionResults = useMemo(() => {
    if (!vialMg || !bacWaterMl || !desiredDoseMcg) return null;
    const concentration = (vialMg * 1000) / bacWaterMl;           // mcg/ml
    const doseVolumeMl = desiredDoseMcg / concentration;           // ml
    const syringeUnits = doseVolumeMl * 100;                       // units on 100IU syringe
    const dosesPerVial = (vialMg * 1000) / desiredDoseMcg;        // number of doses
    return {
      concentration: concentration.toFixed(2),
      doseVolume: doseVolumeMl.toFixed(3),
      syringeUnits: syringeUnits.toFixed(1),
      dosesPerVial: dosesPerVial.toFixed(1),
    };
  }, [vialMg, bacWaterMl, desiredDoseMcg]);

  // ── Dose calculator ────────────────────────────────────────────────────────
  // Formula: dose_volume (ml) = desired_dose_mcg / concentration_mcg_per_ml
  //          units_to_draw    = dose_volume × syringe_multiplier
  const doseCalculatorResults = useMemo(() => {
    if (!concentrationMcgMl || !doseDoseMcg) return null;
    const doseVolumeMl = doseDoseMcg / concentrationMcgMl;
    const syringeMultiplier = syringeType === '100' ? 100 : 50;
    const unitsToDraw = doseVolumeMl * syringeMultiplier;
    return {
      doseVolume: doseVolumeMl.toFixed(3),
      unitsToDraw: unitsToDraw.toFixed(1),
    };
  }, [concentrationMcgMl, doseDoseMcg, syringeType]);

  // ── Pen calculation ────────────────────────────────────────────────────────
  // Formula: ml_per_IU   = totalMl / totalIU  (= 0.01 for U-100 pens)
  //          dose_ml     = penDoseIU × ml_per_IU
  //          mcg_per_IU  = totalMcg / totalIU
  //          dose_mcg    = penDoseIU × mcg_per_IU
  const penResults = useMemo(() => {
    const pen = PEN_SIZES[selectedPenIdx];
    if (!penDoseIU || penDoseIU <= 0) return null;
    const mlPerIU = pen.totalMl / pen.totalIU;     // always 0.01 for U-100
    const doseInMl = penDoseIU * mlPerIU;

    let mcgPerMl: number | undefined;
    let mcgPerIU: number | undefined;
    let doseInMcg: number | undefined;

    if (vialContentValue > 0) {
      const totalMcg = vialContentUnit === 'mg'
        ? vialContentValue * 1000
        : vialContentValue;
      mcgPerMl = totalMcg / pen.totalMl;
      mcgPerIU = totalMcg / pen.totalIU;
      doseInMcg = penDoseIU * mcgPerIU;
    }

    const table = generatePenTable(pen.totalMl, pen.totalIU, mcgPerMl);
    return { doseInMl: doseInMl.toFixed(3), mlPerIU, table, pen, mcgPerIU, doseInMcg, mcgPerMl };
  }, [selectedPenIdx, penDoseIU, vialContentValue, vialContentUnit]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handlePresetClick = (dose: number) => {
    setDesiredDoseMcg(dose);
    setDoseDoseMcg(dose);
  };

  const applyPenExample = (ex: typeof PEN_EXAMPLES[0]) => {
    setSelectedPenIdx(ex.penIdx);
    setVialContentValue(ex.vialMg);
    setVialContentUnit(ex.unit);
    setShowExamples(false);
  };

  const handleResetReconstitution = () => {
    setVialMg(5); setBacWaterMl(2); setDesiredDoseMcg(250);
  };
  const handleResetDose = () => {
    setConcentrationMcgMl(2500); setDoseDoseMcg(250); setSyringeType('100');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  // Loading state
  if (isLoggedIn === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--theme-bg)' }}>
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Members-only gate
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--theme-bg)' }}>

        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none opacity-[0.06]"
          style={{ background: 'radial-gradient(ellipse, #2563eb 0%, transparent 70%)' }} />

        <div className="relative w-full max-w-sm text-center">
          {/* Top glow line */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-blue-500/50 to-transparent mb-px" />

          <div className="border border-white/[0.08] rounded-2xl p-10 shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
            style={{ backgroundColor: 'var(--theme-surface)' }}>

            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
              <Lock className="w-7 h-7 text-blue-400" />
            </div>

            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-blue-400/60 mb-2">Members Only</p>
            <h1 className="text-2xl font-bold text-[#f0f6ff] leading-tight mb-3">
              Peptide Calculator
            </h1>
            <p className="text-[#3a5a82] text-sm leading-relaxed mb-8">
              The dosing &amp; reconstitution calculator is available exclusively to registered members.
              Create a free account to get access.
            </p>

            {/* Feature preview */}
            <div className="border border-white/[0.06] rounded-xl p-4 mb-8 text-left space-y-2.5"
              style={{ backgroundColor: 'var(--theme-bg)' }}>
              {[
                'Reconstitution calculator',
                'Dose &amp; volume calculator',
                'Insulin pen IU converter',
              ].map(feature => (
                <div key={feature} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  </div>
                  <span className="text-[#6b8fba] text-xs" dangerouslySetInnerHTML={{ __html: feature }} />
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              <Link
                to="/register"
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(37,99,235,0.35)] hover:shadow-[0_4px_28px_rgba(37,99,235,0.5)]"
              >
                <UserPlus className="w-4 h-4" />
                Create Free Account
              </Link>
              <Link
                to="/login"
                className="w-full py-3 text-[#4a7aaa] hover:text-[#8caad4] font-medium rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Sign in to existing account
              </Link>
            </div>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-blue-500/20 to-transparent mt-px" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white px-4 py-6 sm:p-8" style={{ backgroundColor: 'var(--theme-bg)' }}>

      {/* ── Header ── */}
      <div className="max-w-4xl mx-auto mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500 shrink-0" />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">Peptide Calculator</h1>
        </div>
        <p className="text-gray-400 text-sm sm:text-base">
          Calculate reconstitution ratios, research concentrations, and insulin pen measurements
        </p>
      </div>

      {/* ── Quick Presets ── */}
      <div className="max-w-4xl mx-auto mb-6 sm:mb-8">
        <p className="text-gray-400 text-xs sm:text-sm mb-3 flex items-center gap-1.5">
          Quick presets
          <Hint text="Click a preset to auto-fill the desired concentration for Reconstitution and Concentration tabs." />
        </p>
        <div className="flex flex-wrap gap-2">
          {PEPTIDE_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handlePresetClick(preset.dose)}
              className="px-3 py-1.5 sm:py-2 bg-blue-600/80 hover:bg-blue-500 rounded-lg text-xs sm:text-sm font-medium transition-colors"
            >
              {preset.name}
              <span className="ml-1.5 opacity-70">{preset.dose >= 1000 ? `${preset.dose / 1000}mg` : `${preset.dose}mcg`}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="max-w-4xl mx-auto mb-6 sm:mb-8">
        <div className="flex gap-1 sm:gap-2 border-b border-white/10 overflow-x-auto">
          {([
            { id: 'reconstitution', label: 'Reconstitution' },
            { id: 'dose', label: 'Concentration Calculator' },
            { id: 'pen', label: 'Insulin Pen' },
          ] as { id: TabType; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 sm:px-5 py-2.5 sm:py-3 text-sm sm:text-base font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="max-w-4xl mx-auto">

        {/* ════ RECONSTITUTION TAB ════ */}
        {activeTab === 'reconstitution' && (
          <div className="space-y-5 sm:space-y-6">
            {/* Inputs card */}
            <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base sm:text-lg font-semibold">Reconstitution Calculator</h2>
                <button onClick={handleResetReconstitution} className="text-gray-500 hover:text-gray-300 transition-colors" title="Reset" aria-label="Reset">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InputRow
                  label="Peptide in vial"
                  hint="Total amount of lyophilised (freeze-dried) peptide powder in the vial."
                  unit="mg"
                  value={vialMg}
                  onChange={setVialMg}
                  min={0.1}
                  step={0.5}
                  placeholder="e.g. 5"
                />
                <InputRow
                  label="BAC water added"
                  hint="Volume of Bacteriostatic Water (BAC) you inject into the vial to dissolve the peptide."
                  unit="ml"
                  value={bacWaterMl}
                  onChange={setBacWaterMl}
                  min={0.1}
                  step={0.5}
                  placeholder="e.g. 2"
                />
                <InputRow
                  label="Desired concentration"
                  hint="The concentration you want to use per administration, in micrograms (mcg). 1 mg = 1000 mcg."
                  unit="mcg"
                  value={desiredDoseMcg}
                  onChange={setDesiredDoseMcg}
                  min={1}
                  step={10}
                  placeholder="e.g. 250"
                />
              </div>

              {/* Example hint */}
              <p className="mt-4 text-xs text-gray-600">
                Example: 5 mg vial + 2 ml BAC water → 2500 mcg/ml concentration. For 250 mcg dose, draw 0.10 ml (10 units on a 100-unit syringe).
              </p>
            </div>

            {/* Results */}
            {reconstitutionResults && (
              <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Results</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <ResultCard
                    label="Concentration"
                    value={`${reconstitutionResults.concentration} mcg/ml`}
                    sub={`${(Number(reconstitutionResults.concentration) / 1000).toFixed(2)} mg/ml`}
                    color="blue"
                  />
                  <ResultCard
                    label="Volume to inject"
                    value={`${reconstitutionResults.doseVolume} ml`}
                    color="green"
                  />
                  <ResultCard
                    label="Syringe units"
                    value={`${reconstitutionResults.syringeUnits} units`}
                    sub="on a 100-unit / 1 ml syringe"
                    color="purple"
                  />
                  <ResultCard
                    label="Doses per vial"
                    value={reconstitutionResults.dosesPerVial}
                    sub="total injections"
                    color="blue"
                  />
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  Draw to the <span className="text-white font-mono font-semibold">{reconstitutionResults.syringeUnits}</span> mark on a 100-unit insulin syringe.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════ DOSE CALCULATOR TAB ════ */}
        {activeTab === 'dose' && (
          <div className="space-y-5 sm:space-y-6">
            <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base sm:text-lg font-semibold">Concentration Calculator</h2>
                <button onClick={handleResetDose} className="text-gray-500 hover:text-gray-300 transition-colors" title="Reset" aria-label="Reset">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <InputRow
                  label="Concentration"
                  hint="Concentration of your reconstituted solution in mcg per ml. E.g. if you added 2 ml BAC to a 5 mg vial: 5000 mcg ÷ 2 ml = 2500 mcg/ml."
                  unit="mcg/ml"
                  value={concentrationMcgMl}
                  onChange={setConcentrationMcgMl}
                  min={1}
                  step={100}
                  placeholder="e.g. 2500"
                />
                <InputRow
                  label="Desired concentration"
                  hint="The concentration you want to administer in micrograms. Use the Quick Presets above for common peptide concentrations."
                  unit="mcg"
                  value={doseDoseMcg}
                  onChange={setDoseDoseMcg}
                  min={1}
                  step={10}
                  placeholder="e.g. 250"
                />
              </div>

              {/* Syringe selector */}
              <div>
                <label className="flex items-center gap-1.5 text-sm text-gray-300 mb-2 font-medium">
                  Syringe type <Hint text="100-unit syringes hold 1 ml total. 50-unit syringes hold 0.5 ml. Both are standard insulin syringes." />
                </label>
                <div className="flex rounded-xl overflow-hidden border border-white/10 w-fit">
                  {(['100', '50'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setSyringeType(type)}
                      className={`px-5 py-2.5 text-sm font-semibold transition-colors ${
                        syringeType === type ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      {type}-unit / {type === '100' ? '1' : '0.5'} ml
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-4 text-xs text-gray-600">
                Example: concentration 2500 mcg/ml, desired dose 250 mcg → draw 0.100 ml (10 units on 100-unit syringe).
              </p>
            </div>

            {doseCalculatorResults && (
              <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-5 sm:p-6">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Results</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ResultCard
                    label="Volume to draw"
                    value={`${doseCalculatorResults.doseVolume} ml`}
                    color="green"
                  />
                  <ResultCard
                    label="Syringe units"
                    value={`${doseCalculatorResults.unitsToDraw} units`}
                    sub={`on a ${syringeType}-unit syringe`}
                    color="purple"
                  />
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  Draw to the <span className="text-white font-mono font-semibold">{doseCalculatorResults.unitsToDraw}</span> mark on a {syringeType}-unit syringe.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════ INSULIN PEN TAB ════ */}
        {activeTab === 'pen' && (
          <div className="space-y-5 sm:space-y-6">

            {/* Main input card */}
            <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  💉 Insulin Pen Calculator
                </h2>
                {/* Examples toggle */}
                <button
                  onClick={() => setShowExamples(o => !o)}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-1.5"
                >
                  Examples {showExamples ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Examples panel */}
              {showExamples && (
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {PEN_EXAMPLES.map(ex => (
                    <button
                      key={ex.label}
                      onClick={() => applyPenExample(ex)}
                      className="text-left p-3 sm:p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/40 transition-all"
                    >
                      <p className="text-sm font-semibold text-white mb-1">{ex.label}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{ex.note}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Pen size */}
              <div className="mb-5">
                <p className="flex items-center gap-1.5 text-sm text-gray-300 mb-3 font-medium">
                  Pen size
                  <Hint text="Standard U-100 insulin pens: 1 IU always equals 0.01 ml, regardless of pen volume." />
                </p>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {PEN_SIZES.map((pen, idx) => (
                    <button
                      key={pen.label}
                      onClick={() => setSelectedPenIdx(idx)}
                      className={`p-3 sm:p-4 rounded-xl border text-left transition-all ${
                        selectedPenIdx === idx
                          ? 'border-blue-500 bg-blue-500/15 text-white'
                          : 'border-white/10 bg-gray-900/50 text-gray-400 hover:border-white/20'
                      }`}
                    >
                      <p className="font-semibold text-xs sm:text-sm">{pen.label}</p>
                      <p className="text-xs mt-1 opacity-60">1 IU = 0.01 ml</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vial content */}
              <div className="mb-5">
                <label htmlFor="calc-vial-content" className="flex items-center gap-1.5 text-sm text-gray-300 mb-3 font-medium">
                  Vial content
                  <Hint text="Total peptide dissolved in the pen/vial. Enter in mg or mcg to see the peptide dose per IU. Leave 0 for IU→ml only." />
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-gray-900 border border-white/10 rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors">
                    <input
                      id="calc-vial-content"
                      type="number"
                      min={0}
                      step={0.1}
                      value={vialContentValue || ''}
                      placeholder="e.g. 3"
                      onChange={e => setVialContentValue(Number(e.target.value))}
                      className="w-24 sm:w-32 px-4 py-3 bg-transparent text-white text-base focus:outline-none"
                    />
                    <div className="flex border-l border-white/10">
                      {(['mg', 'mcg'] as const).map(unit => (
                        <button
                          key={unit}
                          onClick={() => setVialContentUnit(unit)}
                          className={`px-3 sm:px-4 py-3 text-sm font-semibold transition-colors ${
                            vialContentUnit === unit
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  </div>
                  {penResults?.mcgPerMl !== undefined && (
                    <div className="text-xs text-gray-400 leading-relaxed">
                      <span className="text-white font-semibold">{penResults.mcgPerMl.toFixed(1)} mcg/ml</span>
                      <span className="mx-1.5 text-gray-600">·</span>
                      <span className="text-white font-semibold">{penResults.mcgPerIU?.toFixed(2)} mcg/IU</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Dose input */}
              <div>
                <label htmlFor="calc-pen-dose" className="flex items-center gap-1.5 text-sm text-gray-300 mb-3 font-medium">
                  Your dose
                  <Hint text="The number of IU units to dial on the pen. 1 IU = 0.01 ml on all U-100 pens." />
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div className="flex items-center bg-gray-900 border border-white/10 rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors">
                    <input
                      id="calc-pen-dose"
                      type="number"
                      min={1}
                      value={penDoseIU || ''}
                      placeholder="e.g. 25"
                      onChange={e => setPenDoseIU(Number(e.target.value))}
                      className="w-28 sm:w-36 px-4 py-3 bg-transparent text-white text-lg focus:outline-none"
                    />
                    <span className="px-4 text-gray-500 text-sm font-mono border-l border-white/10 py-3 bg-gray-800/50">IU</span>
                  </div>
                  {penResults && (
                    <div className="flex flex-wrap gap-3 flex-1">
                      <ResultCard
                        label="Volume to inject"
                        value={`${penResults.doseInMl} ml`}
                        color="blue"
                      />
                      {penResults.doseInMcg !== undefined && (
                        <ResultCard
                          label="Peptide dose"
                          value={formatMcg(penResults.doseInMcg)}
                          sub={`${penResults.doseInMcg.toFixed(1)} mcg`}
                          color="green"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Reference table */}
            {penResults && (
              <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-gray-300 mb-1">
                  IU reference table — {penResults.pen.label}
                  {penResults.mcgPerMl !== undefined && (
                    <span className="text-gray-500 font-normal ml-2 text-xs">
                      ({vialContentValue} {vialContentUnit} in vial)
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-600 mb-4">
                  Your selected dose ({penDoseIU} IU) is highlighted in blue.
                </p>

                {/* Column headers */}
                <div className={`grid gap-2 mb-2 px-3 text-xs text-gray-500 ${penResults.mcgPerMl !== undefined ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <span>IU</span><span>ml</span>
                  {penResults.mcgPerMl !== undefined && <span>Dose</span>}
                </div>

                {/* Rows */}
                <div className="space-y-1 max-h-64 sm:max-h-72 overflow-y-auto pr-1">
                  {penResults.table.map(row => (
                    <div
                      key={row.iu}
                      className={`grid gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        penResults.mcgPerMl !== undefined ? 'grid-cols-3' : 'grid-cols-2'
                      } ${
                        row.iu === penDoseIU
                          ? 'bg-blue-500/20 border-blue-500/60 text-white font-semibold'
                          : 'bg-gray-900/50 border-white/5 text-gray-400'
                      }`}
                    >
                      <span className="font-mono">{row.iu} IU</span>
                      <span className="font-mono">{row.ml} ml</span>
                      {row.mcg !== null && (
                        <span className="font-mono text-green-400">{row.mcg}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Scale bar */}
                <div className="mt-5 pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500 mb-2">Pen fill level</p>
                  <div className="relative h-7 sm:h-8 bg-gray-900 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((penDoseIU / penResults.pen.totalIU) * 100, 100)}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white drop-shadow px-2 text-center">
                        {penDoseIU} IU = {penResults.doseInMl} ml
                        {penResults.doseInMcg !== undefined && ` = ${formatMcg(penResults.doseInMcg)}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between mt-1 px-1">
                    {[0, 25, 50, 75, 100].map(pct => (
                      <span key={pct} className="text-gray-600 text-xs">
                        {Math.round((pct / 100) * penResults.pen.totalIU)} IU
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Disclaimer ── */}
      <div className="max-w-4xl mx-auto mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-white/10">
        <p className="text-center text-gray-500 text-xs sm:text-sm">
          ⚠️ For research purposes only. Not for human use. Always verify calculations with a qualified professional.
        </p>
      </div>
    </div>
  );
}
