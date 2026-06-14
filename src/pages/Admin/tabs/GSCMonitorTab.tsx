import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  Search, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ExternalLink, TrendingUp, Eye, MousePointerClick,
} from 'lucide-react';
import { getAdminIdToken } from '@/lib/auth-ready';
import {
  fetchGscPerformance,
  inspectGscUrl,
  listGscSites,
} from '@/lib/gsc.functions';

interface PerfRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface InspectionRow {
  url: string;
  verdict: string;
  coverageState: string;
  indexingState: string;
  pageFetchState: string;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  inspectedAt: string;
}

// Core URLs to monitor for indexing status
const MONITOR_URLS = [
  'https://phlabs.co.uk/',
  'https://phlabs.co.uk/shop',
  'https://phlabs.co.uk/resources',
  'https://phlabs.co.uk/about',
  'https://phlabs.co.uk/contact',
];

const verdictBadge = (v: string) => {
  if (v === 'PASS') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (v === 'PARTIAL') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (v === 'FAIL') return 'bg-red-500/20 text-red-300 border-red-500/30';
  return 'bg-slate-700/40 text-slate-300 border-slate-600';
};

export default function GSCMonitorTab() {
  const perfFn = useServerFn(fetchGscPerformance);
  const inspectFn = useServerFn(inspectGscUrl);
  const sitesFn = useServerFn(listGscSites);

  const [perf, setPerf] = useState<PerfRow[]>([]);
  const [perfRange, setPerfRange] = useState<{ start: string; end: string } | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfErr, setPerfErr] = useState<string | null>(null);
  const [days, setDays] = useState(28);

  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectErr, setInspectErr] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');

  const [sites, setSites] = useState<{ siteUrl: string; permissionLevel: string }[]>([]);
  const [sitesErr, setSitesErr] = useState<string | null>(null);

  const idToken = async () => (await auth.currentUser?.getIdToken()) ?? '';

  const runPerf = async () => {
    setPerfLoading(true);
    setPerfErr(null);
    try {
      const res = await perfFn({ data: { idToken: await idToken(), days } });
      setPerf(res.rows);
      setPerfRange({ start: res.startDate, end: res.endDate });
    } catch (e) {
      setPerfErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPerfLoading(false);
    }
  };

  const runInspect = async (urls: string[]) => {
    setInspectLoading(true);
    setInspectErr(null);
    try {
      const tok = await idToken();
      const results: InspectionRow[] = [];
      for (const url of urls) {
        try {
          const r = await inspectFn({ data: { idToken: tok, inspectionUrl: url } });
          results.push(r);
        } catch (e) {
          results.push({
            url,
            verdict: 'ERROR',
            coverageState: e instanceof Error ? e.message.slice(0, 120) : 'error',
            indexingState: '',
            pageFetchState: '',
            lastCrawlTime: null,
            googleCanonical: null,
            userCanonical: null,
            inspectedAt: new Date().toISOString(),
          });
        }
      }
      setInspections((prev) => {
        const map = new Map(prev.map((p) => [p.url, p]));
        for (const r of results) map.set(r.url, r);
        return Array.from(map.values());
      });
    } catch (e) {
      setInspectErr(e instanceof Error ? e.message : String(e));
    } finally {
      setInspectLoading(false);
    }
  };

  const runSites = async () => {
    setSitesErr(null);
    try {
      const res = await sitesFn({ data: { idToken: await idToken() } });
      setSites(res.sites);
    } catch (e) {
      setSitesErr(e instanceof Error ? e.message : String(e));
    }
  };

  const totalClicks = perf.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = perf.reduce((s, r) => s + r.impressions, 0);
  const avgPos = perf.length
    ? perf.reduce((s, r) => s + r.position, 0) / perf.length
    : 0;

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Search className="w-6 h-6 text-emerald-400" /> Google Search Console
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Performance + URL indexing status for{' '}
            <span className="text-emerald-300">phlabs.co.uk</span>
          </p>
        </div>
        <button
          onClick={runSites}
          className="px-3 py-2 text-sm rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
        >
          Verify connection
        </button>
      </div>

      {sites.length > 0 && (
        <div className="text-xs text-slate-400 bg-slate-900/60 border border-slate-700 rounded-lg p-3">
          Verified properties: {sites.map((s) => `${s.siteUrl} (${s.permissionLevel})`).join(' · ')}
        </div>
      )}
      {sitesErr && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          {sitesErr}
        </div>
      )}

      {/* PERFORMANCE */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" /> Performance
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-slate-800 border-2 border-slate-600 text-white text-sm rounded-lg px-3 min-h-[40px]"
            >
              <option value={7}>Last 7 days</option>
              <option value={28}>Last 28 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={runPerf}
              disabled={perfLoading}
              className="px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-2"
            >
              {perfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Fetch
            </button>
          </div>
        </div>

        {perfRange && (
          <div className="text-xs text-slate-400 mb-3">
            {perfRange.start} → {perfRange.end}
          </div>
        )}
        {perfErr && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
            {perfErr}
          </div>
        )}

        {perf.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Stat icon={<MousePointerClick className="w-4 h-4" />} label="Clicks" value={totalClicks.toLocaleString()} />
              <Stat icon={<Eye className="w-4 h-4" />} label="Impressions" value={totalImpressions.toLocaleString()} />
              <Stat label="Pages" value={perf.length.toString()} />
              <Stat label="Avg position" value={avgPos.toFixed(1)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="text-left py-2 pr-2">Page</th>
                    <th className="text-right py-2 px-2">Clicks</th>
                    <th className="text-right py-2 px-2">Impr.</th>
                    <th className="text-right py-2 px-2">CTR</th>
                    <th className="text-right py-2 pl-2">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.slice(0, 100).map((r) => (
                    <tr key={r.page} className="border-b border-slate-800 hover:bg-slate-800/40">
                      <td className="py-2 pr-2 text-slate-200">
                        <a href={r.page} target="_blank" rel="noreferrer" className="hover:text-emerald-300 inline-flex items-center gap-1 break-all">
                          {r.page.replace('https://phlabs.co.uk', '') || '/'}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </td>
                      <td className="py-2 px-2 text-right text-white">{r.clicks}</td>
                      <td className="py-2 px-2 text-right text-slate-300">{r.impressions}</td>
                      <td className="py-2 px-2 text-right text-slate-400">{(r.ctr * 100).toFixed(1)}%</td>
                      <td className="py-2 pl-2 text-right text-slate-400">{r.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {perf.length > 100 && (
                <div className="text-xs text-slate-500 mt-2">Showing top 100 of {perf.length} pages</div>
              )}
            </div>
          </>
        )}
        {!perf.length && !perfLoading && !perfErr && (
          <div className="text-sm text-slate-500">Click Fetch to load performance data.</div>
        )}
      </section>

      {/* URL INSPECTION */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Indexing status
          </h3>
          <button
            onClick={() => runInspect(MONITOR_URLS)}
            disabled={inspectLoading}
            className="px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-2"
          >
            {inspectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Check core URLs
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="url"
            placeholder="https://phlabs.co.uk/..."
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="flex-1 bg-slate-800 border-2 border-slate-600 text-white rounded-lg px-3 min-h-[44px] text-sm"
          />
          <button
            onClick={() => {
              if (customUrl.trim()) {
                runInspect([customUrl.trim()]);
                setCustomUrl('');
              }
            }}
            disabled={inspectLoading || !customUrl.trim()}
            className="px-4 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-sm disabled:opacity-50"
          >
            Inspect
          </button>
        </div>

        {inspectErr && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3">
            {inspectErr}
          </div>
        )}

        {inspections.length > 0 && (
          <div className="space-y-2">
            {inspections.map((row) => (
              <div key={row.url} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-slate-200 hover:text-emerald-300 inline-flex items-center gap-1 break-all"
                  >
                    {row.url.replace('https://phlabs.co.uk', '') || '/'}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  <span className={`text-xs px-2 py-1 rounded-full border ${verdictBadge(row.verdict)}`}>
                    {row.verdict}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400">
                  <div><span className="text-slate-500">Coverage:</span> <span className="text-slate-200">{row.coverageState || '—'}</span></div>
                  <div><span className="text-slate-500">Indexing:</span> <span className="text-slate-200">{row.indexingState || '—'}</span></div>
                  <div><span className="text-slate-500">Fetch:</span> <span className="text-slate-200">{row.pageFetchState || '—'}</span></div>
                  <div><span className="text-slate-500">Last crawl:</span> <span className="text-slate-200">{row.lastCrawlTime ? new Date(row.lastCrawlTime).toLocaleDateString() : '—'}</span></div>
                </div>
                {row.googleCanonical && row.userCanonical && row.googleCanonical !== row.userCanonical && (
                  <div className="mt-2 text-xs flex items-start gap-1 text-amber-300">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>Canonical mismatch — declared: {row.userCanonical} · Google chose: {row.googleCanonical}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!inspections.length && !inspectLoading && !inspectErr && (
          <div className="text-sm text-slate-500">
            Click Check core URLs to inspect indexing status of {MONITOR_URLS.length} key pages.
            URL Inspection API is rate-limited (~2000/day) — use sparingly.
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
      <div className="text-xs text-slate-400 flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}
