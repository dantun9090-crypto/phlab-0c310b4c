import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Thermometer, Snowflake, Sun, AlertTriangle, Lightbulb, Clock, Droplets, PackageCheck, ChevronRight, FlaskConical, Shield } from 'lucide-react';

export default function StorageGuide() {
  useEffect(() => {
    document.title = 'Peptide Storage Guide UK | PH Labs';
    const setMeta = (name: string, content: string, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        if (prop) el.setAttribute('property', name); else el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const metaDesc = 'Complete guide to peptide storage for UK researchers. Proper temperature, reconstitution, and shelf life protocols for BPC-157, TB-500, and GLP-1 peptides.';
    setMeta('description', metaDesc);
    setMeta('keywords', 'peptide storage guide UK, how to store research peptides, peptide reconstitution, BPC-157 storage, TB-500 storage, GLP-1 peptide storage, peptide shelf life, lyophilised peptide handling');
    setMeta('og:title', 'Peptide Storage Guide UK: How to Store Research Peptides (Temperature & Shelf Life)', true);
    setMeta('og:description', metaDesc, true);
    setMeta('og:url', 'https://www.phlabs.co.uk/storage-guide', true);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', 'https://www.phlabs.co.uk/storage-guide');
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#010608' }}>
      {/* MHRA Compliance Strip */}
      <div style={{
        background: 'linear-gradient(90deg, #060f08 0%, #08140a 50%, #060f08 100%)',
        borderBottom: '1px solid rgba(22,163,74,0.15)',
        padding: '8px 16px',
        textAlign: 'center',
      }}>
        <p style={{
          color: '#4ade80',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          margin: 0,
          lineHeight: 1.5,
        }}>
          ⚠ All products for laboratory research use only — Not for human or veterinary consumption — Not for therapeutic use
        </p>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden" style={{ background: '#030812', paddingTop: '5rem', paddingBottom: '4rem' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/5 rounded-full" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full" />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5"
              style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <Snowflake className="w-4 h-4 text-green-400" />
              <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Research Protocol</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-5" style={{ color: '#f0f6ff' }}>
              Peptide Storage Guide UK: How to Store Research Peptides
            </h1>
            <p className="text-lg leading-relaxed" style={{ color: '#9cb8d9' }}>
              Professional storage, reconstitution, and handling protocols for laboratory research peptides including <Link to="/products" className="text-green-400 hover:text-green-300 underline">BPC-157</Link>, <Link to="/products" className="text-green-400 hover:text-green-300 underline">TB-500</Link>, and GLP-1 agonists.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Introduction */}
          <div className="mb-12 p-6 rounded-2xl" style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.12)' }}>
            <p className="text-base leading-relaxed mb-4" style={{ color: '#7a9ec2' }}>
              Proper storage is critical for maintaining peptide integrity, biological activity, and experimental reproducibility in research settings. Research-grade peptides such as <Link to="/products" className="text-green-400 hover:text-green-300 underline font-semibold">BPC-157</Link>, <Link to="/products" className="text-green-400 hover:text-green-300 underline font-semibold">TB-500 (Thymosin Beta-4)</Link>, and GLP-1 receptor agonists are sensitive biomolecules that degrade under improper conditions.
            </p>
            <p className="text-base leading-relaxed" style={{ color: '#7a9ec2' }}>
              This comprehensive UK guide covers temperature requirements, reconstitution procedures, shelf life expectations, and equipment recommendations for researchers working with peptides in controlled laboratory environments.
            </p>
          </div>

          {/* Section 1: Why Storage Matters */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-5 flex items-center gap-3" style={{ color: '#f0f6ff' }}>
              <Shield className="w-7 h-7 text-green-400" />
              Why Peptide Storage Matters in Research
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: '#7a9ec2' }}>
              Peptides are chains of amino acids linked by peptide bonds. These bonds are susceptible to hydrolysis, oxidation, and thermal degradation. Improper storage leads to:
            </p>
            <ul className="space-y-3 mb-4">
              {[
                'Loss of biological activity and experimental validity',
                'Formation of aggregates and precipitates',
                'Degradation of active sequences affecting research outcomes',
                'Inconsistent results across experimental replicates',
                'Oxidation of methionine and cysteine residues',
              ].map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                  <span className="text-base" style={{ color: '#9cb8d9' }}>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-base leading-relaxed" style={{ color: '#7a9ec2' }}>
              Research peptides purchased from PH Labs undergo HPLC verification (≥99% purity) and arrive lyophilised (freeze-dried) in sealed vials. Maintaining this purity throughout your research protocol requires strict adherence to storage guidelines.
            </p>
          </section>

          {/* Section 2: Lyophilised vs Reconstituted */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-5 flex items-center gap-3" style={{ color: '#f0f6ff' }}>
              <FlaskConical className="w-7 h-7 text-green-400" />
              Lyophilised vs Reconstituted Peptide Storage
            </h2>
            
            {/* Lyophilised Storage */}
            <div className="mb-6 p-5 rounded-xl" style={{ background: 'rgba(11,26,48,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2" style={{ color: '#4ade80' }}>
                <Snowflake className="w-5 h-5" />
                Lyophilised (Freeze-Dried) Peptides
              </h3>
              <p className="text-base leading-relaxed mb-3" style={{ color: '#7a9ec2' }}>
                Unopened lyophilised peptide vials have extended stability when stored correctly. This is the form in which <Link to="/products" className="text-green-400 hover:text-green-300 underline">all PH Labs products</Link> are shipped to UK laboratories.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#f0f6ff' }}>Storage Temperature:</p>
                  <ul className="space-y-2 text-sm" style={{ color: '#9cb8d9' }}>
                    <li>• <strong>-20°C (freezer):</strong> 12-24 months shelf life</li>
                    <li>• <strong>2-8°C (refrigerator):</strong> 3-6 months</li>
                    <li>• <strong>Room temperature (below 25°C):</strong> Up to 1 month (not recommended)</li>
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#f0f6ff' }}>Key Requirements:</p>
                  <ul className="space-y-2 text-sm" style={{ color: '#9cb8d9' }}>
                    <li>• Store in original sealed vials</li>
                    <li>• Protect from light (use amber vials or foil wrap)</li>
                    <li>• Keep in desiccated environment</li>
                    <li>• Avoid freeze-thaw cycles</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Reconstituted Storage */}
            <div className="p-5 rounded-xl" style={{ background: 'rgba(11,26,48,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2" style={{ color: '#4ade80' }}>
                <Droplets className="w-5 h-5" />
                Reconstituted (Solution) Peptides
              </h3>
              <p className="text-base leading-relaxed mb-3" style={{ color: '#7a9ec2' }}>
                Once reconstituted with bacteriostatic water or sterile water, peptides have significantly reduced stability. Reconstitute only the amount needed for immediate experimental use.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#f0f6ff' }}>Storage Temperature:</p>
                  <ul className="space-y-2 text-sm" style={{ color: '#9cb8d9' }}>
                    <li>• <strong>2-8°C (refrigerator):</strong> 7-14 days (bacteriostatic water)</li>
                    <li>• <strong>2-8°C (refrigerator):</strong> 3-5 days (sterile water)</li>
                    <li>• <strong>-20°C (freezer):</strong> Not recommended (ice crystal formation)</li>
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#f0f6ff' }}>Key Requirements:</p>
                  <ul className="space-y-2 text-sm" style={{ color: '#9cb8d9' }}>
                    <li>• Use sterile technique during reconstitution</li>
                    <li>• Store in refrigerator immediately</li>
                    <li>• Protect from light (amber vials preferred)</li>
                    <li>• Label with date and peptide name</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Optimal Temperature Protocols */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-5 flex items-center gap-3" style={{ color: '#f0f6ff' }}>
              <Thermometer className="w-7 h-7 text-green-400" />
              Optimal Temperature Storage Protocols
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: '#7a9ec2' }}>
              Temperature control is the single most important factor in peptide stability. Different peptides have varying sensitivities, but these UK laboratory standards apply to most research-grade compounds including <Link to="/products" className="text-green-400 hover:text-green-300 underline">BPC-157</Link>, <Link to="/products" className="text-green-400 hover:text-green-300 underline">TB-500</Link>, and <Link to="/products" className="text-green-400 hover:text-green-300 underline">Semaglutide</Link>.
            </p>

            <div className="space-y-4">
              <div className="p-5 rounded-xl" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: '#60a5fa' }}>
                  <Snowflake className="w-5 h-5" />
                  -20°C Freezer Storage (Long-Term)
                </h3>
                <p className="text-sm leading-relaxed mb-2" style={{ color: '#7a9ec2' }}>
                  <strong>Best for:</strong> Unopened lyophilised vials, long-term storage (12-24 months)
                </p>
                <p className="text-sm leading-relaxed" style={{ color: '#9cb8d9' }}>
                  Store in the main freezer compartment (not the door). Use a frost-free freezer or manually defrost to prevent temperature fluctuations. Do not repeatedly remove and return vials.
                </p>
              </div>

              <div className="p-5 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: '#10b981' }}>
                  <Thermometer className="w-5 h-5" />
                  2-8°C Refrigerator Storage (Short-Term)
                </h3>
                <p className="text-sm leading-relaxed mb-2" style={{ color: '#7a9ec2' }}>
                  <strong>Best for:</strong> Reconstituted peptides, unopened vials in active use (3-6 months)
                </p>
                <p className="text-sm leading-relaxed" style={{ color: '#9cb8d9' }}>
                  Store in the main compartment (not the door, which experiences temperature swings). Keep away from the back wall where freezing may occur. Maintain consistent temperature with a fridge thermometer.
                </p>
              </div>

              <div className="p-5 rounded-xl" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: '#fbbf24' }}>
                  <Sun className="w-5 h-5" />
                  Room Temperature (Emergency Only)
                </h3>
                <p className="text-sm leading-relaxed mb-2" style={{ color: '#7a9ec2' }}>
                  <strong>Maximum duration:</strong> 2-4 weeks for unopened lyophilised vials only
                </p>
                <p className="text-sm leading-relaxed" style={{ color: '#9cb8d9' }}>
                  Not recommended for routine storage. Acceptable only during shipping (PH Labs includes cold-pack insulation) or temporary lab bench use during experiments. Never store reconstituted peptides at room temperature.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Shelf Life Guidelines */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-5 flex items-center gap-3" style={{ color: '#f0f6ff' }}>
              <Clock className="w-7 h-7 text-green-400" />
              Peptide Shelf Life Guidelines
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: '#7a9ec2' }}>
              Shelf life varies by peptide type, purity, and storage conditions. These are conservative estimates for HPLC-verified peptides (≥99% purity) under optimal storage:
            </p>

            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'rgba(22,163,74,0.1)', borderBottom: '1px solid rgba(22,163,74,0.2)' }}>
                  <tr>
                    <th className="text-left p-4 font-semibold" style={{ color: '#4ade80' }}>Peptide Form</th>
                    <th className="text-left p-4 font-semibold" style={{ color: '#4ade80' }}>Storage Condition</th>
                    <th className="text-left p-4 font-semibold" style={{ color: '#4ade80' }}>Shelf Life</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'rgba(11,26,48,0.4)' }}>
                  {[
                    ['Lyophilised (unopened)', '-20°C Freezer', '12-24 months'],
                    ['Lyophilised (unopened)', '2-8°C Refrigerator', '3-6 months'],
                    ['Reconstituted (bacteriostatic water)', '2-8°C Refrigerator', '7-14 days'],
                    ['Reconstituted (sterile water)', '2-8°C Refrigerator', '3-5 days'],
                    ['Lyophilised (opened)', '2-8°C Refrigerator', '1-3 months'],
                  ].map(([form, storage, life], idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td className="p-4" style={{ color: '#f0f6ff' }}>{form}</td>
                      <td className="p-4" style={{ color: '#7a9ec2' }}>{storage}</td>
                      <td className="p-4" style={{ color: '#9cb8d9' }}>{life}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#fbbf24' }}>Important Note</p>
                <p className="text-sm leading-relaxed" style={{ color: '#7a9ec2' }}>
                  Shelf life assumes optimal storage conditions. Peptides exposed to temperature fluctuations, light, or moisture may degrade faster. Always verify peptide appearance before use — discard if cloudy, discoloured, or contains precipitates.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5: Common Storage Mistakes */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-5 flex items-center gap-3" style={{ color: '#f0f6ff' }}>
              <AlertTriangle className="w-7 h-7 text-amber-400" />
              Common Peptide Storage Mistakes to Avoid
            </h2>
            <div className="space-y-4">
              {[
                {
                  title: 'Repeated Freeze-Thaw Cycles',
                  desc: 'Each freeze-thaw cycle degrades peptides by ~5-10%. Remove only the vials you need and return unused vials immediately. Consider aliquoting reconstituted solutions for single-use.',
                },
                {
                  title: 'Storing in Refrigerator Door',
                  desc: 'Temperature fluctuations in the door compartment can reduce shelf life by 30-50%. Always store peptides in the main refrigerator body.',
                },
                {
                  title: 'Using Incorrect Reconstitution Volume',
                  desc: 'Too little water increases peptide concentration and aggregation risk. Too much water dilutes below effective concentrations. Follow manufacturer reconstitution guidelines (typically 1-2mL per vial).',
                },
                {
                  title: 'Exposing to Direct Light',
                  desc: 'UV and visible light degrade peptides, especially those with aromatic amino acids (tryptophan, tyrosine). Use amber vials or wrap clear vials in aluminum foil.',
                },
                {
                  title: 'Reconstituting Entire Supply',
                  desc: 'Only reconstitute what you need for immediate experiments. Lyophilised peptides have 10x longer shelf life than solutions.',
                },
                {
                  title: 'Ignoring Expiry Dates',
                  desc: 'Even under optimal conditions, peptides degrade over time. Track receipt dates and prioritize older stock. PH Labs includes batch documentation for reference.',
                },
              ].map((mistake, idx) => (
                <div key={idx} className="p-5 rounded-xl" style={{ background: 'rgba(11,26,48,0.6)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: '#ef4444' }}>
                    ❌ {mistake.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#7a9ec2' }}>
                    {mistake.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 6: Equipment Recommendations */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-5 flex items-center gap-3" style={{ color: '#f0f6ff' }}>
              <PackageCheck className="w-7 h-7 text-green-400" />
              Recommended Laboratory Equipment for Peptide Storage
            </h2>
            <p className="text-base leading-relaxed mb-4" style={{ color: '#7a9ec2' }}>
              Professional UK laboratories handling research peptides should maintain these minimum equipment standards:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  title: 'Medical-Grade Refrigerator/Freezer',
                  desc: 'Dedicated unit with temperature monitoring and alarm systems. Avoid domestic appliances prone to temperature swings.',
                },
                {
                  title: 'Digital Thermometer with Alarms',
                  desc: 'Monitor storage temperature continuously. Set alarms for deviations beyond ±2°C of target temperature.',
                },
                {
                  title: 'Bacteriostatic Water & Sterile Water',
                  desc: 'Bacteriostatic water (0.9% benzyl alcohol) extends reconstituted shelf life to 14 days vs 3-5 days for sterile water.',
                },
                {
                  title: 'Amber Glass Vials (1-2mL)',
                  desc: 'Light-protective vials for storing reconstituted peptides. Clear vials require aluminum foil wrapping.',
                },
                {
                  title: 'Desiccant Packs (Silica Gel)',
                  desc: 'Place in storage containers with lyophilised vials to absorb moisture and prevent hygroscopic degradation.',
                },
                {
                  title: 'Labeling System',
                  desc: 'Label all vials with peptide name, concentration, reconstitution date, and expiry date for traceability.',
                },
              ].map((item, idx) => (
                <div key={idx} className="p-5 rounded-xl" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.12)' }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: '#4ade80' }}>{item.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#9cb8d9' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ Section */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3" style={{ color: '#f0f6ff' }}>
              <Lightbulb className="w-7 h-7 text-green-400" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {[
                {
                  q: 'Can I store reconstituted peptides in the freezer?',
                  a: 'No. Freezing reconstituted peptides causes ice crystal formation which disrupts peptide structure and causes precipitation. Always store reconstituted solutions at 2-8°C in a refrigerator.',
                },
                {
                  q: 'How long can peptides survive shipping at room temperature?',
                  a: 'Lyophilised peptides remain stable for 2-4 weeks at room temperature. PH Labs includes cold-pack insulation for UK deliveries, ensuring peptides arrive in optimal condition even during summer months.',
                },
                {
                  q: 'What is the difference between bacteriostatic and sterile water?',
                  a: 'Bacteriostatic water contains 0.9% benzyl alcohol which inhibits bacterial growth, extending reconstituted peptide shelf life to 14 days. Sterile water has no preservative and reconstituted solutions last only 3-5 days.',
                },
                {
                  q: 'How do I know if my peptide has degraded?',
                  a: 'Signs of degradation include: cloudiness or turbidity in solution, visible particles or precipitates, discolouration (yellowing), or separation of layers. Discard any peptide showing these signs.',
                },
                {
                  q: 'Should I refrigerate or freeze unopened lyophilised peptides?',
                  a: 'For long-term storage (6+ months), store at -20°C in a freezer. For medium-term use (1-6 months), 2-8°C refrigerator storage is sufficient. Both methods maintain peptide integrity if unopened.',
                },
                {
                  q: 'Can I re-lyophilise reconstituted peptides to extend shelf life?',
                  a: 'No. Re-lyophilisation requires specialised freeze-drying equipment unavailable in most laboratories. The process also risks contamination and loss of biological activity. Only reconstitute what you need.',
                },
              ].map((faq, idx) => (
                <div key={idx} className="p-5 rounded-xl" style={{ background: 'rgba(11,26,48,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 className="text-base font-semibold mb-2" style={{ color: '#f0f6ff' }}>{faq.q}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#7a9ec2' }}>{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Disclaimer */}
          <div className="mb-8 p-5 rounded-xl" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: '#fbbf24' }}>Research Use Only</p>
                <p className="text-sm leading-relaxed" style={{ color: '#7a9ec2' }}>
                  This guide is for informational purposes only and intended for professional researchers in UK laboratory settings. All peptides sold by PH Labs are strictly for in vitro research use only. Not for human or veterinary consumption. Not intended to diagnose, treat, cure, or prevent any disease. Handle all research peptides in accordance with institutional biosafety and chemical safety guidelines.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Products CTA */}
        <div className="max-w-4xl mx-auto mt-12">
          <div className="bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-blue-500/10 border border-green-500/20 rounded-2xl p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-400/5 to-transparent pointer-events-none" />
            
            <div className="relative">
              <PackageCheck className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-[#f0f6ff] mb-3">
                Browse HPLC-Verified Research Peptides
              </h2>
              <p className="text-[#9cb8d9] mb-6 max-w-2xl mx-auto">
                All peptides shipped with cold-pack insulation to maintain proper temperature during UK transit. HPLC purity certificates and batch documentation included with every order.
              </p>
              <Link 
                to="/products" 
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-xl font-semibold transition-all duration-300 hover:border-green-400/40 border border-transparent"
              >
                View All Products
                <ChevronRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
