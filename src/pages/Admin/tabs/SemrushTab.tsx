import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, RefreshCw, TrendingUp, Link2, Search, AlertTriangle, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getSemrushOverview } from '@/lib/semrush.functions';

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
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
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
