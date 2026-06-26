/**
 * Backlink Outreach — UK research-supply directory tracker.
 *
 * Authority Score on phlabs.co.uk is 2/100 (Semrush, 2026-06-26) with only
 * 10 referring domains, all spam (now disavowed). This tab tracks
 * submissions to high-trust UK lab / chem / biotech directories that move
 * the needle on AS. State is stored in localStorage (single-admin tool),
 * so no Firestore rule change required.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, CheckCircle2, Clock, Circle, XCircle, Copy, Link2, TrendingUp } from 'lucide-react';

type Status = 'todo' | 'submitted' | 'live' | 'rejected';

interface Directory {
  id: string;
  name: string;
  url: string;
  tier: 1 | 2 | 3;
  category: 'Lab / Science' | 'UK Chemicals' | 'UK General Business' | 'Community';
  notes: string;
  freeTier: boolean;
}

const DIRECTORIES: Directory[] = [
  // Tier 1 — DR 60+, lab-buyer audience, exact-niche relevance
  { id: 'selectscience',      name: 'SelectScience Vendor Profile',  url: 'https://www.selectscience.net/products/supplier-directory', tier: 1, category: 'Lab / Science',       freeTier: true,  notes: 'Apply via "Become a Supplier". DR ~80. Use lab-reagent positioning.' },
  { id: 'labx',               name: 'LabX UK Vendor Listing',         url: 'https://www.labx.com/seller-services',                       tier: 1, category: 'Lab / Science',       freeTier: true,  notes: 'Free seller account → category "Research Chemicals / Reagents". DR ~65.' },
  { id: 'labmanager',         name: 'Lab Manager Product Directory',  url: 'https://www.labmanager.com/product-directory',               tier: 1, category: 'Lab / Science',       freeTier: true,  notes: 'Submit company profile under Reagents & Chemicals.' },
  { id: 'chemdirectory',      name: 'Chemical Industry Directory UK', url: 'https://www.chemicaldirectory.co.uk/',                       tier: 1, category: 'UK Chemicals',        freeTier: true,  notes: 'UK-specific. Free listing under "Reagents / Fine Chemicals".' },

  // Tier 2 — DR 70+, free supplier profiles
  { id: 'scientistcom',       name: 'Scientist.com Supplier Profile', url: 'https://www.scientist.com/supplier/become-a-supplier/',      tier: 2, category: 'Lab / Science',       freeTier: true,  notes: 'Free vendor profile. Approval ~2 weeks. DR ~75.' },
  { id: 'biocompare',         name: 'Biocompare Company Profile',     url: 'https://www.biocompare.com/Vendor-Directory/',                tier: 2, category: 'Lab / Science',       freeTier: true,  notes: 'Free basic profile, paid for product listings. DR ~72.' },
  { id: 'chemeurope',         name: 'Chemie.de / chemeurope.com',     url: 'https://www.chemeurope.com/companies/',                      tier: 2, category: 'UK Chemicals',        freeTier: true,  notes: 'EU chemicals directory. Free company profile.' },
  { id: 'ukbusinessdir',      name: 'UK Small Business Directory',    url: 'https://www.uksmallbusinessdirectory.co.uk/',                 tier: 2, category: 'UK General Business', freeTier: true,  notes: 'Free UK trust signal under Science & Research.' },
  { id: 'freeindex',          name: 'FreeIndex UK',                   url: 'https://www.freeindex.co.uk/add_listing.htm',                 tier: 2, category: 'UK General Business', freeTier: true,  notes: 'High-DR UK directory. Free basic listing.' },
  { id: 'yell',               name: 'Yell UK',                        url: 'https://business.yell.com/free-business-listing/',            tier: 2, category: 'UK General Business', freeTier: true,  notes: 'Free Yell listing. Adds NAP citation.' },

  // Tier 3 — community + topical
  { id: 'researchgate',       name: 'ResearchGate Company Page',      url: 'https://www.researchgate.net/institution/',                  tier: 3, category: 'Community',           freeTier: true,  notes: 'Free institution page. Strong topical relevance.' },
  { id: 'reddit-peptides',    name: 'r/PeptideScience AMA / profile', url: 'https://www.reddit.com/r/Peptides/',                          tier: 3, category: 'Community',           freeTier: true,  notes: 'Build karma first, then run a vendor AMA. No paid posts.' },
  { id: 'crunchbase',         name: 'Crunchbase Company Profile',     url: 'https://www.crunchbase.com/add-new',                          tier: 3, category: 'UK General Business', freeTier: true,  notes: 'Free company profile. Crawled by GSC.' },
];

const STORAGE_KEY = 'phl_backlink_outreach_v1';

interface Record {
  status: Status;
  submittedAt?: string;
  liveAt?: string;
  notes?: string;
}

const PITCH_TEMPLATE = `Company name: PH Labs
Website: https://phlabs.co.uk
Category: Laboratory Reagents / Research Chemicals
Location: United Kingdom
Founded: 2026

Short blurb (50 words):
PH Labs is a UK-based supplier of high-purity research-grade peptides and laboratory reagents. Every batch ships with HPLC certificates of analysis and is intended strictly for in-vitro and ex-vivo research use only — not for human consumption. UK fulfilment, 1–2 day domestic dispatch.

Long blurb (150 words):
PH Labs supplies research-use-only peptides and laboratory reagents to UK universities, contract research organisations, and independent laboratories. Our catalogue covers GLP-1 / GIP / glucagon analogues, healing peptides (BPC-157, TB-500), cosmetic-research peptides (GHK-Cu), neurological-research peptides (PT-141), and metabolic-research compounds (NAD+, MOTS-c). All products are accompanied by third-party HPLC purity certificates and mass-spec identity verification. We operate under strict UK research-supply compliance: products are labelled "For Research Use Only. Not for Human Consumption." and shipped only to verified research addresses. Fulfilment from UK warehousing, 1–2 working day dispatch, Royal Mail tracked.

Contact: hello@phlabs.co.uk
Logo / OG image: https://phlabs.co.uk/og-image.png`;

const STATUS_META: Record<Status, { label: string; color: string; icon: typeof Circle }> = {
  todo:      { label: 'Not started', color: 'text-slate-400 bg-slate-800',       icon: Circle },
  submitted: { label: 'Submitted',   color: 'text-amber-300 bg-amber-500/10',    icon: Clock },
  live:      { label: 'Live',        color: 'text-emerald-300 bg-emerald-500/10', icon: CheckCircle2 },
  rejected:  { label: 'Rejected',    color: 'text-rose-300 bg-rose-500/10',      icon: XCircle },
};

export default function BacklinkOutreachTab() {
  const [records, setRecords] = useState<Record<string, Record>>({});
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRecords(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const persist = (next: Record<string, Record>) => {
    setRecords(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const setStatus = (id: string, status: Status) => {
    const cur = records[id] ?? { status: 'todo' };
    const now = new Date().toISOString();
    persist({
      ...records,
      [id]: {
        ...cur,
        status,
        submittedAt: status === 'submitted' && !cur.submittedAt ? now : cur.submittedAt,
        liveAt: status === 'live' && !cur.liveAt ? now : cur.liveAt,
      },
    });
  };

  const setNote = (id: string, notes: string) => {
    const cur = records[id] ?? { status: 'todo' as Status };
    persist({ ...records, [id]: { ...cur, notes } });
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return DIRECTORIES;
    return DIRECTORIES.filter((d) => (records[d.id]?.status ?? 'todo') === filter);
  }, [filter, records]);

  const counts = useMemo(() => {
    const out: Record<Status | 'all', number> = { all: DIRECTORIES.length, todo: 0, submitted: 0, live: 0, rejected: 0 };
    DIRECTORIES.forEach((d) => {
      const s = (records[d.id]?.status ?? 'todo') as Status;
      out[s] += 1;
    });
    return out;
  }, [records]);

  const copyPitch = async () => {
    try {
      await navigator.clipboard.writeText(PITCH_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* noop */ }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Backlink Outreach</h1>
            <p className="text-xs text-slate-400">UK lab / chemical / business directories — track every submission and bump Authority Score from 2/100.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-300">Live links: <span className="text-emerald-300 font-bold">{counts.live}</span> / {counts.all}</span>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="px-6 py-3 flex flex-wrap gap-2 border-b-2 border-slate-800">
          {(['all','todo','submitted','live','rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold min-h-[40px] border-2 ${
                filter === s ? 'bg-violet-600 border-violet-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_META[s].label} ({counts[s]})
            </button>
          ))}
        </div>
      </div>

      {/* Pitch copy block */}
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-white">Pre-filled submission copy</h2>
            <p className="text-xs text-slate-400">Compliance-safe blurb. No medical claims. Research-use disclaimer included.</p>
          </div>
          <button
            onClick={copyPitch}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold min-h-[40px]"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy pitch'}
          </button>
        </div>
        <pre className="text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-4 max-h-64 overflow-auto whitespace-pre-wrap">{PITCH_TEMPLATE}</pre>
      </div>

      {/* Directories list */}
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 overflow-hidden">
        <div className="divide-y-2 divide-slate-800">
          {filtered.map((dir) => {
            const rec = records[dir.id] ?? { status: 'todo' as Status };
            const Meta = STATUS_META[rec.status];
            const Icon = Meta.icon;
            return (
              <div key={dir.id} className="p-5 hover:bg-slate-900/60">
                <div className="flex items-start gap-4">
                  <div className={`mt-1 w-8 h-8 rounded-lg flex items-center justify-center ${Meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">{dir.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">TIER {dir.tier}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">{dir.category}</span>
                      {dir.freeTier && <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">FREE</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{dir.notes}</p>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <a
                        href={dir.url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-xs min-h-[40px]"
                      >
                        Open submission page <ExternalLink className="w-3 h-3" />
                      </a>
                      <select
                        value={rec.status}
                        onChange={(e) => setStatus(dir.id, e.target.value as Status)}
                        className="px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-xs min-h-[40px]"
                      >
                        <option value="todo">Not started</option>
                        <option value="submitted">Submitted</option>
                        <option value="live">Live</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>

                    {(rec.submittedAt || rec.liveAt) && (
                      <p className="text-[11px] text-slate-500 mt-2">
                        {rec.submittedAt && <>Submitted {new Date(rec.submittedAt).toLocaleDateString('en-GB')}</>}
                        {rec.submittedAt && rec.liveAt && ' · '}
                        {rec.liveAt && <>Live {new Date(rec.liveAt).toLocaleDateString('en-GB')}</>}
                      </p>
                    )}

                    <input
                      type="text"
                      value={rec.notes ?? ''}
                      onChange={(e) => setNote(dir.id, e.target.value)}
                      placeholder="Notes (login email, reference number, contact name…)"
                      className="mt-3 w-full px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-xs min-h-[40px] placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Tip: aim for 5 Tier 1/2 live links before re-checking Semrush (Authority Score updates weekly).
        Run the <span className="text-slate-300 font-semibold">Semrush</span> tab → Backlink Analysis to confirm new referring domains appear.
      </p>
    </div>
  );
}
