import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/firebase';
import { fetchCompoundQueries } from '@/lib/compound-queries.functions';
import { toast } from 'sonner';

type Row = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  riskTokens: string[];
  deltaImpressions: number;
  deltaClicks: number;
  trending: boolean;
};

type Result = {
  siteUrl: string;
  pagePath: string;
  startDate: string;
  endDate: string;
  days: number;
  totalRows: number;
  totalImpressions: number;
  totalClicks: number;
  riskyCount: number;
  riskyTrendingCount: number;
  rows: Row[];
  fetchedAt: string;
};

export default function CompoundQueriesTab() {
  const fetchFn = useServerFn(fetchCompoundQueries);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(28);
  const [page, setPage] = useState<'/compound' | '/landing/phlabs'>('/compound');
  const [filter, setFilter] = useState<'all' | 'risk' | 'trending'>('all');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const r = await fetchFn({ data: { idToken, days, pagePath: page } });
      setData(r as Result);
      if ((r as Result).riskyTrendingCount > 0) {
        toast.warning(`${(r as Result).riskyTrendingCount} high-risk queries trending up`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`GSC fetch failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, page]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'risk') return data.rows.filter((r) => r.riskTokens.length > 0);
    if (filter === 'trending') return data.rows.filter((r) => r.trending);
    return data.rows;
  }, [data, filter]);

  function exportCsv() {
    if (!data) return;
    const header = 'Query,Clicks,Impressions,CTR,Position,DeltaImpressions,DeltaClicks,Trending,RiskTokens\n';
    const csv =
      header +
      data.rows
        .map((r) =>
          [
            JSON.stringify(r.query),
            r.clicks,
            r.impressions,
            (r.ctr * 100).toFixed(2) + '%',
            r.position.toFixed(1),
            r.deltaImpressions,
            r.deltaClicks,
            r.trending ? 'yes' : 'no',
            JSON.stringify(r.riskTokens.join('|')),
          ].join(','),
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compound-queries-${page.replace(/\//g, '_')}-${data.endDate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">/compound Search Queries</h2>
        <p className="text-slate-400 text-sm mt-1">
          GSC queries driving impressions and clicks to{' '}
          <code className="text-emerald-400">{page}</code> over the last {days} days.
          High-risk terms (recreational intent, molecule names, dosing, weight loss)
          are flagged. Trending = ≥5 new impressions and &gt;50% growth vs prior window.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          value={page}
          onChange={(e) => setPage(e.target.value as typeof page)}
          className="border-2 border-slate-600 bg-slate-800 text-white min-h-[40px] rounded-lg px-3 text-sm"
        >
          <option value="/compound">/compound</option>
          <option value="/landing/phlabs">/landing/phlabs</option>
        </select>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border-2 border-slate-600 bg-slate-800 text-white min-h-[40px] rounded-lg px-3 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={28}>Last 28 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <div className="flex gap-1">
          {(['all', 'risk', 'trending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                filter === f ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'risk' ? 'High-risk only' : 'Trending only'}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          {loading ? '⏳ Loading…' : '↻ Refresh'}
        </button>
        <button
          onClick={exportCsv}
          disabled={!data}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs"
        >
          ⬇ CSV
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border-2 border-red-700 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 text-sm">
            <Stat label="Queries" value={data.totalRows} />
            <Stat label="Impressions" value={data.totalImpressions} />
            <Stat label="Clicks" value={data.totalClicks} />
            <Stat
              label="High-risk"
              value={data.riskyCount}
              tone={data.riskyCount > 0 ? 'warn' : 'ok'}
            />
            <Stat
              label="Risky & trending"
              value={data.riskyTrendingCount}
              tone={data.riskyTrendingCount > 0 ? 'danger' : 'ok'}
            />
          </div>

          {data.riskyTrendingCount > 0 && (
            <div className="mb-4 rounded border-2 border-red-700 bg-red-950 p-3 text-sm text-red-200">
              <strong>⚠ {data.riskyTrendingCount} high-risk query(ies) trending up.</strong>{' '}
              These contain Google-Ads-banned tokens and gained meaningful impressions vs the prior
              window. Consider adding them as negative keywords in Google Ads → Campaigns tab.
            </div>
          )}

          <div className="overflow-auto rounded-xl border-2 border-slate-700 bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2">Query</th>
                  <th className="text-right px-3 py-2">Impr.</th>
                  <th className="text-right px-3 py-2">Δ Impr.</th>
                  <th className="text-right px-3 py-2">Clicks</th>
                  <th className="text-right px-3 py-2">CTR</th>
                  <th className="text-right px-3 py-2">Pos.</th>
                  <th className="text-left px-3 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 250).map((r) => {
                  const risky = r.riskTokens.length > 0;
                  return (
                    <tr
                      key={r.query}
                      className={`border-t border-slate-800 ${
                        risky ? 'bg-red-950/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-white font-mono text-xs">{r.query}</td>
                      <td className="px-3 py-2 text-right text-slate-200">{r.impressions}</td>
                      <td
                        className={`px-3 py-2 text-right ${
                          r.deltaImpressions > 0
                            ? 'text-emerald-400'
                            : r.deltaImpressions < 0
                            ? 'text-slate-500'
                            : 'text-slate-400'
                        }`}
                      >
                        {r.deltaImpressions > 0 ? '+' : ''}
                        {r.deltaImpressions}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-200">{r.clicks}</td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {(r.ctr * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {r.position.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {r.trending && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-700 text-amber-50">
                              ↑ trending
                            </span>
                          )}
                          {r.riskTokens.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded bg-red-700 text-red-50 font-mono"
                              title="Banned ad token"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                      No queries match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Source: Google Search Console · Site: {data.siteUrl} · Window:{' '}
            {data.startDate} → {data.endDate} · Fetched{' '}
            {new Date(data.fetchedAt).toLocaleString('en-GB')}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'danger' | 'neutral';
}) {
  const colors =
    tone === 'danger'
      ? 'border-red-700 bg-red-950 text-red-200'
      : tone === 'warn'
      ? 'border-amber-700 bg-amber-950 text-amber-200'
      : tone === 'ok'
      ? 'border-emerald-800 bg-emerald-950 text-emerald-200'
      : 'border-slate-700 bg-slate-800 text-white';
  return (
    <div className={`rounded-lg border-2 p-3 ${colors}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-lg font-bold">{value.toLocaleString('en-GB')}</div>
    </div>
  );
}
