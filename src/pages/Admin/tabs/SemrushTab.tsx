import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  Loader2, RefreshCw, TrendingUp, Link2, Search, AlertTriangle,
  ExternalLink, Globe, Download, History, Trash2, BarChart3,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import { getAdminIdToken } from '@/lib/auth-ready';
import { getSemrushOverview, getSemrushKeywordGeo } from '@/lib/semrush.functions';

const REPORT_SCHEMA_VERSION = '1.1.0';
const HISTORY_KEY = 'phlabs.admin.semrushGeoHistory.v1';
const HISTORY_LIMIT = 20;

interface OverviewData {
  domain: string;
  database: string;
  fetchedAt: string;
  limits: any;
  ranks: any;
  topKeywords: Array<Record<string, any>>;
  topKeywordsError: string | null;
  backlinks: any;
}

const DATABASES = [
  { id: 'uk', label: 'United Kingdom' },
  { id: 'us', label: 'United States' },
  { id: 'de', label: 'Germany' },
  { id: 'fr', label: 'France' },
  { id: 'es', label: 'Spain' },
  { id: 'it', label: 'Italy' },
];

export default function SemrushTab() {
  const fetchOverview = useServerFn(getSemrushOverview);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState('phlabs.co.uk');
  const [database, setDatabase] = useState('uk');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getAdminIdToken();
      const result = await fetchOverview({ data: { idToken, domain, database } });
      setData(result as OverviewData);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load Semrush data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const ranks = data?.ranks ?? {};
  const bl = data?.backlinks ?? {};

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Search className="w-6 h-6 text-emerald-400" /> Semrush
          </h1>
          <p className="text-sm text-slate-400">
            SEO snapshot from Semrush. Organic data only; reflects Google's index.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value.trim())}
            className="w-full min-h-[48px] px-3 bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm"
            placeholder="phlabs.co.uk"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Database</label>
          <select
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            className="w-full min-h-[48px] px-3 bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm"
          >
            {DATABASES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={load}
            disabled={loading}
            className="w-full min-h-[48px] px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold"
          >
            Run query
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border-2 border-red-700/60 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-semibold text-sm">Semrush request failed</p>
            <p className="text-red-200/80 text-xs font-mono break-all mt-1">{error}</p>
            {error.includes('134') && (
              <p className="text-red-200/80 text-xs mt-2">
                Quota exhausted. Upgrade the Semrush plan or wait for the daily reset.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Domain summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Organic keywords" value={ranks.Or} icon={<Search className="w-4 h-4" />} />
        <StatCard label="Est. organic traffic" value={ranks.Ot} suffix="/mo" icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Est. traffic cost" value={ranks.Oc} prefix="$" />
        <StatCard label="Global rank" value={ranks.Rk} />
        <StatCard label="Backlinks" value={bl.total} icon={<Link2 className="w-4 h-4" />} />
        <StatCard label="Referring domains" value={bl.domains_num} />
        <StatCard label="Authority score" value={bl.ascore} />
        <StatCard label="Follow / Nofollow" value={bl.follows_num != null ? `${bl.follows_num} / ${bl.nofollows_num ?? 0}` : undefined} />
      </div>

      {/* Top organic keywords */}
      <div className="bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Top organic keywords</h2>
          {data && (
            <a
              href={`https://www.semrush.com/analytics/overview/?q=${encodeURIComponent(data.domain)}&searchType=domain`}
              target="_blank" rel="noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
            >
              Open in Semrush <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {data?.topKeywordsError && (
          <p className="text-red-300 text-xs p-4 font-mono break-all">{data.topKeywordsError}</p>
        )}
        {!data?.topKeywords?.length && !loading && !data?.topKeywordsError && (
          <p className="text-slate-400 text-sm p-4">No keywords returned.</p>
        )}
        {!!data?.topKeywords?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-slate-300 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Keyword</th>
                  <th className="text-right px-4 py-2">Pos</th>
                  <th className="text-right px-4 py-2">Volume</th>
                  <th className="text-right px-4 py-2">CPC</th>
                  <th className="text-right px-4 py-2">Traffic %</th>
                  <th className="text-right px-4 py-2">Competition</th>
                </tr>
              </thead>
              <tbody>
                {data.topKeywords.map((r, i) => (
                  <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-2 text-white">{r.Ph}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Po}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{Number(r.Nq).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Cp != null ? `$${Number(r.Cp).toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Tr != null ? `${(Number(r.Tr) * 100).toFixed(2)}%` : '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{r.Co != null ? Number(r.Co).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Keyword geo breakdown */}
      <KeywordGeoPanel />

      {/* Footer meta */}
      {data && (
        <p className="text-xs text-slate-500">
          {data.domain} · database: {data.database.toUpperCase()} · fetched {new Date(data.fetchedAt).toLocaleString()}
          {data.limits?.api_units_left != null && <> · units left: {data.limits.api_units_left}</>}
        </p>
      )}
    </div>
  );
}


function StatCard({ label, value, prefix, suffix, icon }: {
  label: string; value: any; prefix?: string; suffix?: string; icon?: React.ReactNode;
}) {
  const display =
    value == null || value === ''
      ? '—'
      : typeof value === 'number'
        ? value.toLocaleString()
        : String(value);
  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wide font-semibold">
        {icon}<span>{label}</span>
      </div>
      <p className="text-white text-xl font-bold mt-1">
        {prefix}{display}{suffix && value != null ? <span className="text-xs text-slate-400 font-medium ml-0.5">{suffix}</span> : null}
      </p>
    </div>
  );
}

// =========================================================
// Keyword geo breakdown panel
// =========================================================

interface GeoRow {
  database: string;
  country: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  results: number | null;
  error: string | null;
}
interface GeoResult {
  phrase: string;
  fetchedAt: string;
  rows: GeoRow[];
  totals: {
    countries: number;
    withData: number;
    totalVolume: number;
    ukVolume: number;
    ukSharePct: number;
  };
}

interface HistoryItem {
  phrase: string;
  fetchedAt: string;
  totalVolume: number;
  ukVolume: number;
  ukSharePct: number;
  withData: number;
  countries: number;
  result: GeoResult;
}

function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
  } catch { return []; }
}
function saveHistory(items: HistoryItem[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT))); } catch { /* quota */ }
}

function buildReportEnvelope(result: GeoResult) {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportType: 'semrush.keyword_geo_breakdown',
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'Semrush',
      endpoint: '/keywords/phrase_this',
      index: 'organic',
      via: 'Lovable connector gateway',
    },
    parameters: {
      phrase: result.phrase,
      selectedTerm: result.phrase,
      exportColumns: ['Ph', 'Nq', 'Cp', 'Co', 'Nr', 'Td'],
      databasesQueried: result.rows.map((r) => r.database),
    },
    fetchedAt: result.fetchedAt,
    totals: result.totals,
    rows: result.rows,
  };
}

function KeywordGeoPanel() {
  const fetchGeo = useServerFn(getSemrushKeywordGeo);
  const [phrase, setPhrase] = useState('research peptides');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeoResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => { setHistory(loadHistory()); }, []);

  const persistHistory = (next: HistoryItem[]) => {
    setHistory(next);
    saveHistory(next);
  };

  const recordHistory = (res: GeoResult) => {
    const item: HistoryItem = {
      phrase: res.phrase,
      fetchedAt: res.fetchedAt,
      totalVolume: res.totals.totalVolume,
      ukVolume: res.totals.ukVolume,
      ukSharePct: res.totals.ukSharePct,
      withData: res.totals.withData,
      countries: res.totals.countries,
      result: res,
    };
    const filtered = history.filter((h) => h.phrase.toLowerCase() !== res.phrase.toLowerCase());
    persistHistory([item, ...filtered].slice(0, HISTORY_LIMIT));
  };

  const run = async (override?: string) => {
    const term = (override ?? phrase).trim();
    if (!term) return;
    if (override) setPhrase(override);
    setLoading(true);
    setError(null);
    try {
      const idToken = await getAdminIdToken();
      const res = (await fetchGeo({ data: { idToken, phrase: term } })) as GeoResult;
      setResult(res);
      recordHistory(res);
    } catch (e: any) {
      setError(e?.message ?? 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = (filename: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJsonFor = (res: GeoResult) => {
    const envelope = buildReportEnvelope(res);
    triggerDownload(
      `seo-geo-${slugify(res.phrase)}-${dateStamp()}.json`,
      'application/json',
      JSON.stringify(envelope, null, 2),
    );
  };

  const downloadCsvFor = (res: GeoResult) => {
    const envelope = buildReportEnvelope(res);
    const header = ['country', 'database', 'volume', 'cpc', 'competition', 'results', 'share_pct', 'error'];
    const total = res.totals.totalVolume || 0;
    const sorted = [...res.rows].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
    const lines: string[] = [];
    // Metadata header (commented) — consistent schema for downstream parsers
    lines.push(`# schema_version,${envelope.schemaVersion}`);
    lines.push(`# report_type,${envelope.reportType}`);
    lines.push(`# generated_at,${envelope.generatedAt}`);
    lines.push(`# fetched_at,${envelope.fetchedAt}`);
    lines.push(`# source_provider,${envelope.source.provider}`);
    lines.push(`# source_endpoint,${envelope.source.endpoint}`);
    lines.push(`# source_index,${envelope.source.index}`);
    lines.push(`# param_phrase,${csvCell(envelope.parameters.phrase)}`);
    lines.push(`# param_selected_term,${csvCell(envelope.parameters.selectedTerm)}`);
    lines.push(`# param_export_columns,${envelope.parameters.exportColumns.join('|')}`);
    lines.push(`# param_databases,${envelope.parameters.databasesQueried.join('|')}`);
    lines.push(`# totals_countries,${res.totals.countries}`);
    lines.push(`# totals_with_data,${res.totals.withData}`);
    lines.push(`# totals_total_volume,${res.totals.totalVolume}`);
    lines.push(`# totals_uk_volume,${res.totals.ukVolume}`);
    lines.push(`# totals_uk_share_pct,${res.totals.ukSharePct}`);
    lines.push('');
    lines.push(header.join(','));
    for (const r of sorted) {
      const share = total > 0 && r.volume != null ? ((r.volume / total) * 100).toFixed(2) : '';
      const row = [
        csvCell(r.country), csvCell(r.database),
        r.volume ?? '', r.cpc ?? '', r.competition ?? '', r.results ?? '',
        share, csvCell(r.error ?? ''),
      ];
      lines.push(row.join(','));
    }
    triggerDownload(
      `seo-geo-${slugify(res.phrase)}-${dateStamp()}.csv`,
      'text/csv',
      lines.join('\n'),
    );
  };

  const sortedRows = useMemo(
    () => (result ? [...result.rows].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)) : []),
    [result],
  );
  const total = result?.totals.totalVolume ?? 0;

  const chartData = useMemo(() => {
    if (!result) return [];
    return sortedRows
      .filter((r) => r.volume != null && r.volume > 0)
      .map((r) => ({
        country: r.country,
        database: r.database,
        volume: r.volume ?? 0,
        isUk: r.database === 'uk',
      }));
  }, [result, sortedRows]);

  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b-2 border-slate-700 flex items-center gap-2">
        <Globe className="w-4 h-4 text-emerald-400" />
        <h2 className="text-white font-semibold text-sm">Keyword geo breakdown</h2>
        <span className="text-xs text-slate-400 ml-auto">Per-country monthly search volume + UK share of search</span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Keyword / phrase</label>
          <input
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) run(); }}
            maxLength={80}
            className="w-full min-h-[48px] px-3 bg-slate-800 border-2 border-slate-600 text-white rounded-lg text-sm"
            placeholder="e.g. research peptides"
          />
        </div>
        <button
          onClick={() => run()}
          disabled={loading || !phrase.trim()}
          className="min-h-[48px] px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Lookup
        </button>
        <button
          onClick={() => result && downloadCsvFor(result)}
          disabled={!result}
          className="min-h-[48px] px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium border-2 border-slate-600 inline-flex items-center gap-2"
          title="Download CSV"
        >
          <Download className="w-4 h-4" /> CSV
        </button>
        <button
          onClick={() => result && downloadJsonFor(result)}
          disabled={!result}
          className="min-h-[48px] px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium border-2 border-slate-600 inline-flex items-center gap-2"
          title="Download JSON"
        >
          <Download className="w-4 h-4" /> JSON
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-4 bg-red-950/40 border-2 border-red-700/60 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-200 text-xs font-mono break-all">{error}</p>
        </div>
      )}

      {result && (
        <>
          <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total monthly volume" value={result.totals.totalVolume} suffix={`/${result.totals.countries} countries`} />
            <StatCard label="Countries with data" value={result.totals.withData} />
            <StatCard label="UK monthly volume" value={result.totals.ukVolume} />
            <StatCard label="UK share of search" value={result.totals.ukSharePct} suffix="%" />
          </div>

          {/* Chart */}
          <div className="px-4 pb-4">
            <div className="bg-slate-950/60 border-2 border-slate-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-white text-xs font-semibold uppercase tracking-wide">
                  Per-country search volume
                </h3>
                <span className="ml-auto text-[11px] text-emerald-400 font-semibold">
                  UK highlighted · {result.totals.ukSharePct}% share
                </span>
              </div>
              {chartData.length === 0 ? (
                <p className="text-slate-400 text-xs py-8 text-center">No countries returned volume data for this phrase.</p>
              ) : (
                <div style={{ width: '100%', height: Math.max(220, chartData.length * 22 + 40) }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid stroke="#1e293b" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        dataKey="country"
                        type="category"
                        stroke="#94a3b8"
                        tick={{ fontSize: 11 }}
                        width={120}
                      />
                      <Tooltip
                        cursor={{ fill: '#1e293b' }}
                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#e2e8f0' }}
                        formatter={(value: any, _name: any, ctx: any) => {
                          const v = Number(value) || 0;
                          const share = total > 0 ? ((v / total) * 100).toFixed(2) : '0';
                          return [`${v.toLocaleString()} /mo (${share}%)`, ctx?.payload?.isUk ? 'UK volume' : 'Volume'];
                        }}
                      />
                      <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.isUk ? '#10b981' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-slate-300 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Country</th>
                  <th className="text-left px-4 py-2">DB</th>
                  <th className="text-right px-4 py-2">Volume / mo</th>
                  <th className="text-right px-4 py-2">Share</th>
                  <th className="text-right px-4 py-2">CPC ($)</th>
                  <th className="text-right px-4 py-2">Competition</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const share = total > 0 && r.volume != null ? (r.volume / total) * 100 : 0;
                  return (
                    <tr key={r.database} className={`border-t border-slate-800 ${r.database === 'uk' ? 'bg-emerald-950/30' : 'hover:bg-slate-800/40'}`}>
                      <td className="px-4 py-2 text-white">
                        {r.country}
                        {r.database === 'uk' && <span className="ml-2 text-[10px] uppercase font-semibold text-emerald-400">UK</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-400 uppercase">{r.database}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.error ? <span className="text-red-400 text-xs">err</span> : r.volume != null ? r.volume.toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.volume != null && total > 0 ? `${share.toFixed(2)}%` : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.cpc != null ? r.cpc.toFixed(2) : '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-200">{r.competition != null ? r.competition.toFixed(2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-slate-500">
            phrase: <span className="text-slate-300">{result.phrase}</span> · fetched {new Date(result.fetchedAt).toLocaleString()} · source: Semrush (organic, Google index) · schema v{REPORT_SCHEMA_VERSION}
          </p>
        </>
      )}

      {/* Saved history */}
      <div className="border-t-2 border-slate-700">
        <div className="px-4 py-3 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          <h3 className="text-white text-sm font-semibold">Saved searches</h3>
          <span className="text-xs text-slate-500 ml-2">Stored locally · last {HISTORY_LIMIT}</span>
          {history.length > 0 && (
            <button
              onClick={() => persistHistory([])}
              className="ml-auto text-xs text-slate-400 hover:text-red-300 inline-flex items-center gap-1"
              title="Clear history"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-slate-500">No saved searches yet — run a lookup above to start a history.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/40 text-slate-300 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Phrase</th>
                  <th className="text-right px-4 py-2">Total vol</th>
                  <th className="text-right px-4 py-2">UK vol</th>
                  <th className="text-right px-4 py-2">UK share</th>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={`${h.phrase}-${i}`} className="border-t border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-2 text-white">{h.phrase}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{h.totalVolume.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-slate-200">{h.ukVolume.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-emerald-300 font-semibold">{h.ukSharePct}%</td>
                    <td className="px-4 py-2 text-slate-400 text-xs">{new Date(h.fetchedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => { setResult(h.result); setPhrase(h.phrase); }}
                          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-600"
                          title="Show cached result"
                        >
                          View
                        </button>
                        <button
                          onClick={() => run(h.phrase)}
                          disabled={loading}
                          className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded"
                          title="Re-run lookup"
                        >
                          Re-run
                        </button>
                        <button
                          onClick={() => downloadCsvFor(h.result)}
                          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-600 inline-flex items-center gap-1"
                          title="Download cached CSV"
                        >
                          <Download className="w-3 h-3" /> CSV
                        </button>
                        <button
                          onClick={() => downloadJsonFor(h.result)}
                          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded border border-slate-600 inline-flex items-center gap-1"
                          title="Download cached JSON"
                        >
                          <Download className="w-3 h-3" /> JSON
                        </button>
                        <button
                          onClick={() => persistHistory(history.filter((_, idx) => idx !== i))}
                          className="px-2 py-1 text-xs text-slate-400 hover:text-red-300"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function csvCell(v: string): string {
  if (v == null) return '';
  const needs = /[",\n]/.test(v);
  const s = String(v).replace(/"/g, '""');
  return needs ? `"${s}"` : s;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'keyword';
}
function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
