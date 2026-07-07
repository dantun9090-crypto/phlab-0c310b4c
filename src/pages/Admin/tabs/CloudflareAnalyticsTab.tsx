import { useState } from 'react';
import { Loader2, RefreshCw, Bot, Users, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  getCloudflareCountryTraffic,
  type CloudflareAnalyticsResult,
} from '@/lib/cloudflare-analytics.functions';

/**
 * Cloudflare Analytics — real-human traffic by country.
 *
 * This is the saved "Bot class = Likely automated" filtered view. It pulls
 * httpRequestsAdaptiveGroups from the Cloudflare GraphQL Analytics API
 * grouped by client country + botManagementBotClass, so you can see how
 * much of each country's traffic is real humans vs. likely automated bots
 * (Amsterdam / Frankfurt hosting IPs, scrapers, uptime pingers, etc.).
 */

const ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const CF_DASHBOARD_URL = `https://dash.cloudflare.com/?zone=${ZONE_ID}`;

const WINDOWS: Array<{ label: string; hours: number }> = [
  { label: 'Last 1h', hours: 1 },
  { label: 'Last 6h', hours: 6 },
  { label: 'Last 24h', hours: 24 },
  { label: 'Last 7d', hours: 168 },
];

export default function CloudflareAnalyticsTab() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<CloudflareAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideBotsOnly, setHideBotsOnly] = useState(true);

  const load = async (h = hours) => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      const res = await getCloudflareCountryTraffic({ data: { idToken, hours: h } });
      setData(res);
      if (!res.ok && res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  };

  const rows = data?.rows ?? [];
  const visibleRows = hideBotsOnly ? rows.filter((r) => r.human > 0) : rows;
  const totals = data?.totals;
  const humanShare = totals && totals.total > 0 ? (totals.human / totals.total) * 100 : 0;

  return (
    <div className="p-6 space-y-6 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-400" />
            Cloudflare Analytics — Real Human Traffic by Country
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Traffic grouped by Cloudflare Bot Management class. Filters out{' '}
            <span className="text-amber-400">Likely automated</span>,{' '}
            <span className="text-red-400">Definitely automated</span>, and{' '}
            <span className="text-sky-400">Verified bot</span> to reveal real visitors.
            Explains why NL / DE dominate the raw dashboard: those are Amsterdam
            &amp; Frankfurt hosting IPs (Hetzner, OVH, Leaseweb, AWS eu-central-1,
            DigitalOcean AMS/FRA) running scrapers, uptime pingers, and SEO crawlers.
          </p>
        </div>
        <a
          href={CF_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1"
        >
          Open Cloudflare dashboard <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {WINDOWS.map((w) => (
          <button
            key={w.hours}
            onClick={() => {
              setHours(w.hours);
              load(w.hours);
            }}
            className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition ${
              hours === w.hours
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
            }`}
          >
            {w.label}
          </button>
        ))}
        <button
          onClick={() => load()}
          disabled={loading}
          className="px-3 py-2 rounded-lg border-2 border-slate-600 bg-slate-800 text-sm text-white hover:border-emerald-500 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {data ? 'Refresh' : 'Load traffic'}
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={hideBotsOnly}
            onChange={(e) => setHideBotsOnly(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          Hide countries with zero humans
        </label>
      </div>

      {error && (
        <div className="p-4 rounded-lg border-2 border-red-500/50 bg-red-500/10 text-red-300 text-sm">
          {error}
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Human" value={totals.human} accent="text-emerald-400" />
          <StatCard label="Likely automated" value={totals.likelyAutomated} accent="text-amber-400" />
          <StatCard label="Definitely automated" value={totals.definitelyAutomated} accent="text-red-400" />
          <StatCard label="Verified bot" value={totals.verifiedBot} accent="text-sky-400" />
          <StatCard
            label="Human share"
            value={`${humanShare.toFixed(1)}%`}
            accent="text-emerald-400"
            sub={`of ${totals.total.toLocaleString('en-GB')} total`}
          />
        </div>
      )}

      {data && (
        <div className="border-2 border-slate-700 rounded-lg overflow-hidden bg-slate-900">
          <div className="px-4 py-2 bg-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
            <span>
              Window: {new Date(data.since).toLocaleString('en-GB')} →{' '}
              {new Date(data.until).toLocaleString('en-GB')}
            </span>
            <span className="flex items-center gap-1">
              <Bot className="w-3 h-3" /> Sorted by real humans (desc)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Country</th>
                  <th className="px-4 py-2 text-right text-emerald-300">Human</th>
                  <th className="px-4 py-2 text-right text-amber-300">Likely auto</th>
                  <th className="px-4 py-2 text-right text-red-300">Def. auto</th>
                  <th className="px-4 py-2 text-right text-sky-300">Verified bot</th>
                  <th className="px-4 py-2 text-right text-slate-400">Unknown</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">% human</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {loading ? 'Loading…' : 'No data'}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r) => {
                    const pct = r.total > 0 ? (r.human / r.total) * 100 : 0;
                    return (
                      <tr key={r.country} className="border-t border-slate-800 hover:bg-slate-800/40">
                        <td className="px-4 py-2 font-medium">{r.country}</td>
                        <td className="px-4 py-2 text-right text-emerald-300 font-semibold">
                          {r.human.toLocaleString('en-GB')}
                        </td>
                        <td className="px-4 py-2 text-right text-amber-300">
                          {r.likelyAutomated.toLocaleString('en-GB')}
                        </td>
                        <td className="px-4 py-2 text-right text-red-300">
                          {r.definitelyAutomated.toLocaleString('en-GB')}
                        </td>
                        <td className="px-4 py-2 text-right text-sky-300">
                          {r.verifiedBot.toLocaleString('en-GB')}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400">
                          {r.unknown.toLocaleString('en-GB')}
                        </td>
                        <td className="px-4 py-2 text-right">{r.total.toLocaleString('en-GB')}</td>
                        <td
                          className={`px-4 py-2 text-right ${
                            pct >= 50 ? 'text-emerald-400' : pct >= 10 ? 'text-amber-400' : 'text-red-400'
                          }`}
                        >
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 border-t border-slate-800 pt-3">
        Source: Cloudflare GraphQL Analytics (<code>httpRequestsAdaptiveGroups</code>) on
        zone <code>{ZONE_ID}</code>. Bot classification comes from Cloudflare Bot
        Management — the same signal used in Security → Events. To reproduce this
        view in the Cloudflare dashboard: Analytics &amp; Logs → Traffic → add
        filter <em>Bot class ≠ Likely automated / Definitely automated / Verified bot</em>,
        group by <em>Country</em>.
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number | string;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="p-4 rounded-lg border-2 border-slate-700 bg-slate-900">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent}`}>
        {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
