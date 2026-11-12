/**
 * Ads Insights — read-only top products from paid orders (30 / 90 days) with
 * Google Ads click-id attribution, for planning new campaigns.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';

import { getAdsInsightsFn } from '@/lib/ads-insights.functions';
import type { AdsInsightsReport, ProductInsightRow } from '@/lib/ads-insights';
import { getAdminIdToken } from '@/lib/auth-ready';

type SortKey = 'revenue' | 'unitsSold' | 'adRevenue';

const card = 'bg-gradient-to-b from-[#0d1f38] to-[#091528] border border-white/[0.07] rounded-2xl';

function gbp(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdsInsightsTab() {
  const [report, setReport] = useState<AdsInsightsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const idToken = await getAdminIdToken();
      if (!idToken) throw new Error('Not signed in');
      setReport(await getAdsInsightsFn({ data: { idToken } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const win = report?.windows.find((w) => w.days === days);
  const rows = useMemo<ProductInsightRow[]>(
    () => (win ? [...win.rows].sort((a, b) => b[sortKey] - a[sortKey]) : []),
    [win, sortKey],
  );

  const sortBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortKey(key)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${sortKey === key ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10' : 'border-slate-700 text-slate-300'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" /> Ads Insights
          </h2>
          <p className="text-[#7d9bbd] text-sm mt-0.5">
            Top products from paid orders (paid, processing, shipped, delivered). Test, cancelled and unpaid orders excluded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>}

      {report && (
        <div className={`${card} p-4 flex flex-wrap gap-6 text-sm`}>
          {report.windows.map((w) => (
            <div key={w.days}>
              <p className="text-slate-400 text-xs uppercase tracking-wider">Last {w.days} days</p>
              <p className="text-white font-semibold">{w.paidOrders} paid orders · {gbp(w.revenue)}</p>
              <p className="text-slate-400 text-xs">{w.adOrders} with gclid/gbraid</p>
            </div>
          ))}
          <div className="ml-auto text-right">
            <p className="text-slate-400 text-xs uppercase tracking-wider">Generated</p>
            <p className="text-white">{new Date(report.generatedAt).toLocaleString('en-GB')}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {[30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${days === d ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
          >
            Last {d} days
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">Sort by:</span>
        {sortBtn('revenue', 'Revenue')}
        {sortBtn('unitsSold', 'Units')}
        {sortBtn('adRevenue', 'Ad revenue')}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <th className="p-3">#</th>
              <th className="p-3">Product name</th>
              <th className="p-3">Product URL</th>
              <th className="p-3 text-right">Current price</th>
              <th className="p-3 text-right">Units sold</th>
              <th className="p-3 text-right">Revenue</th>
              <th className="p-3 text-right"># Orders</th>
              <th className="p-3 text-right">% with gclid/gbraid</th>
              <th className="p-3 text-right">Ad-attributed revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.productId} className="border-b border-slate-800/60 text-slate-200">
                <td className="p-3 text-slate-400">{i + 1}</td>
                <td className="p-3 text-white">{r.name}</td>
                <td className="p-3">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">{r.url}</a>
                </td>
                <td className="p-3 text-right">{r.currentPrice != null ? gbp(r.currentPrice) : '—'}</td>
                <td className="p-3 text-right">{r.unitsSold}</td>
                <td className="p-3 text-right font-semibold">{gbp(r.revenue)}</td>
                <td className="p-3 text-right">{r.orders}</td>
                <td className="p-3 text-right">{r.adOrderPct.toFixed(1)}%</td>
                <td className="p-3 text-right">{gbp(r.adRevenue)}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">No paid orders in this window.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
