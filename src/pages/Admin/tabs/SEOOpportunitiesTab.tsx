import { useCallback, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  Loader2, RefreshCw, TrendingUp, Target, Lightbulb, Download,
  AlertTriangle, Plus, X, Trophy, Zap, FileSearch, Clock,
} from 'lucide-react';
import { getAdminIdToken } from '@/lib/auth-ready';
import { getSemrushKeywordGaps } from '@/lib/semrush-gaps.functions';

type Gap = {
  phrase: string;
  volume: number;
  cpc: number;
  competition: number;
  ourPosition: number | null;
  competitors: Array<{ domain: string; position: number; traffic: number }>;
  bestCompetitorPosition: number;
  opportunityScore: number;
  bucket: 'quick_win' | 'striking_distance' | 'content_gap' | 'long_term';
  recommendation: string;
};

type Report = Awaited<ReturnType<typeof getSemrushKeywordGaps>>;

const DATABASES = [
  { id: 'uk', label: 'United Kingdom' },
  { id: 'us', label: 'United States' },
  { id: 'ie', label: 'Ireland' },
  { id: 'au', label: 'Australia' },
  { id: 'ca', label: 'Canada' },
  { id: 'de', label: 'Germany' },
];

const BUCKET_META: Record<Gap['bucket'], { label: string; color: string; icon: any }> = {
  quick_win: { label: 'Quick Win', color: 'emerald', icon: Zap },
  striking_distance: { label: 'Striking Distance', color: 'amber', icon: Target },
  content_gap: { label: 'Content Gap', color: 'sky', icon: FileSearch },
  long_term: { label: 'Long-term', color: 'slate', icon: Clock },
};

export default function SEOOpportunitiesTab() {
  const runGaps = useServerFn(getSemrushKeywordGaps);
  const [database, setDatabase] = useState('uk');
  const [competitorInput, setCompetitorInput] = useState('');
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [perDomainLimit, setPerDomainLimit] = useState(100);
  const [bucketFilter, setBucketFilter] = useState<'all' | Gap['bucket']>('all');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCompetitor = () => {
    const v = competitorInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!v) return;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) { setError('Invalid domain'); return; }
    if (competitors.includes(v) || competitors.length >= 5) return;
    setCompetitors([...competitors, v]);
    setCompetitorInput('');
    setError(null);
  };

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const idToken = await getAdminIdToken();
      const data = await runGaps({
        data: { idToken, competitors: competitors.length ? competitors : undefined, database: database as any, perDomainLimit },
      });
      setReport(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to run gap analysis');
    } finally {
      setLoading(false);
    }
  }, [runGaps, competitors, database, perDomainLimit]);

  const filtered = useMemo(() => {
    if (!report) return [];
    return bucketFilter === 'all' ? report.gaps : report.gaps.filter((g) => g.bucket === bucketFilter);
  }, [report, bucketFilter]);

  const downloadCsv = () => {
    if (!report) return;
    const rows = [
      ['phrase', 'opportunityScore', 'bucket', 'volume', 'cpc_gbp', 'competition', 'ourPosition', 'bestCompetitorPosition', 'competitors', 'recommendation'],
      ...report.gaps.map((g) => [
        g.phrase, g.opportunityScore, g.bucket, g.volume, g.cpc, g.competition,
        g.ourPosition ?? 'not ranking', g.bestCompetitorPosition,
        g.competitors.map((c) => `${c.domain}#${c.position}`).join('|'),
        g.recommendation.replace(/"/g, '""'),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seo-gaps-${report.database}-${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            SEO Opportunities
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Keyword gaps versus competitors via Semrush. Each opportunity is bucketed and tagged with an action.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider">Market</label>
            <select
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="mt-1 w-full bg-slate-800 border-2 border-slate-600 rounded-lg px-3 py-2 text-white min-h-[48px]"
              aria-label="Market database"
            >
              {DATABASES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider">Keywords per domain</label>
            <select
              value={perDomainLimit}
              onChange={(e) => setPerDomainLimit(Number(e.target.value))}
              className="mt-1 w-full bg-slate-800 border-2 border-slate-600 rounded-lg px-3 py-2 text-white min-h-[48px]"
              aria-label="Keywords per domain"
            >
              {[50, 100, 150, 200].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={run}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2 min-h-[48px] flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? 'Analysing…' : 'Run Gap Analysis'}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 uppercase tracking-wider">
            Competitors {competitors.length === 0 && <span className="text-emerald-400 normal-case">(empty = auto-discover via Semrush)</span>}
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {competitors.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white">
                {c}
                <button onClick={() => setCompetitors(competitors.filter((x) => x !== c))} aria-label={`Remove ${c}`}>
                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" />
                </button>
              </span>
            ))}
            <div className="flex gap-2 flex-1 min-w-[260px]">
              <input
                type="text"
                value={competitorInput}
                onChange={(e) => setCompetitorInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                placeholder="competitor.com"
                disabled={competitors.length >= 5}
                className="flex-1 bg-slate-800 border-2 border-slate-600 rounded-lg px-3 py-2 text-white min-h-[48px]"
                aria-label="Competitor domain"
              />
              <button onClick={addCompetitor} disabled={competitors.length >= 5} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg px-3 min-h-[48px]" aria-label="Add competitor">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4 flex items-start gap-3 text-red-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" /> <div className="text-sm">{error}</div>
        </div>
      )}

      {report && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Total gaps" value={report.summary.totalGaps} color="slate" />
            <SummaryCard label="Quick wins" value={report.summary.quickWins} color="emerald" icon={Zap} />
            <SummaryCard label="Striking distance" value={report.summary.strikingDistance} color="amber" icon={Target} />
            <SummaryCard label="Content gaps" value={report.summary.contentGaps} color="sky" icon={FileSearch} />
            <SummaryCard label="Combined volume / mo" value={report.summary.totalMonthlyVolume.toLocaleString()} color="violet" />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-slate-300">
              <span>Market: <span className="text-white font-semibold">{report.database.toUpperCase()}</span></span>
              <span>Competitors {report.autoDiscovered && <span className="text-emerald-400">(auto)</span>}: <span className="text-white font-semibold">{report.competitors.join(', ') || '—'}</span></span>
              <span>Fetched: <span className="text-white">{new Date(report.fetchedAt).toLocaleString()}</span></span>
            </div>
            <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-3">
              {report.perDomainStats.map((d) => (
                <span key={d.domain}>
                  {d.domain}: {d.error ? <span className="text-red-400">err</span> : `${d.keywordCount} kw`}
                </span>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'quick_win', 'striking_distance', 'content_gap', 'long_term'] as const).map((b) => {
              const label = b === 'all' ? 'All' : BUCKET_META[b].label;
              const active = bucketFilter === b;
              return (
                <button
                  key={b}
                  onClick={() => setBucketFilter(b)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${active ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {label}
                </button>
              );
            })}
            <div className="flex-1" />
            <button onClick={downloadCsv} className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>

          {/* Recommendations */}
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
                No opportunities match this filter.
              </div>
            )}
            {filtered.map((g) => {
              const meta = BUCKET_META[g.bucket];
              const Icon = meta.icon;
              return (
                <div key={g.phrase} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-${meta.color}-950 text-${meta.color}-300 border border-${meta.color}-800`}>
                          <Icon className="w-3 h-3" /> {meta.label}
                        </span>
                        <span className="text-xs text-slate-500">Score {g.opportunityScore}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-white mt-2 truncate">{g.phrase}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>Vol: <span className="text-white">{g.volume.toLocaleString()}/mo</span></span>
                        <span>CPC: <span className="text-white">£{g.cpc.toFixed(2)}</span></span>
                        <span>Comp: <span className="text-white">{(g.competition * 100).toFixed(0)}%</span></span>
                        <span>You: <span className={g.ourPosition ? 'text-amber-300' : 'text-red-400'}>{g.ourPosition ? `#${g.ourPosition}` : 'not ranking'}</span></span>
                        <span>Best comp: <span className="text-white">#{g.bestCompetitorPosition}</span></span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <Trophy className="w-4 h-4 inline mr-1 text-amber-400" />
                      {g.competitors.length} competitor{g.competitors.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="mt-3 bg-slate-950/50 border border-slate-800 rounded-lg p-3 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-200">{g.recommendation}</p>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Ranking competitors: {g.competitors.map((c) => `${c.domain} (#${c.position})`).join(' · ')}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
          Pick a market, optionally add competitor domains, then run a gap analysis. Each run uses ~{1 + Math.max(competitors.length, 3)} Semrush units.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, icon: Icon }: { label: string; value: number | string; color: string; icon?: any }) {
  return (
    <div className={`bg-slate-900 border border-${color}-900/50 rounded-xl p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className={`w-4 h-4 text-${color}-400`} />}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
