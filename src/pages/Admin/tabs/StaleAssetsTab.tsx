import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Row {
  id: string;
  asset?: string;
  host?: string;
  status?: number;
  reason?: string;
  buildId?: string;
  referer?: string;
  count?: number;
  ua?: string;
  ip?: string;
  createdAt?: string;
}

interface TopAsset { asset: string; count: number }

const PAGE_SIZE = 200;

function fmt(dt?: string): string {
  if (!dt) return '';
  try { return new Date(dt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
  catch { return dt; }
}

function relTime(dt?: string): string {
  if (!dt) return '';
  const t = new Date(dt).getTime();
  if (!isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function StaleAssetsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [topAssets, setTopAssets] = useState<TopAsset[]>([]);
  const [hosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [host, setHost] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastLoaded, setLastLoaded] = useState<number>(0);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      const body: Record<string, unknown> = { idToken, limit: PAGE_SIZE };
      if (host) body.host = host;
      const res = await fetch('/api/public/stale-asset-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setRows(j.rows || []);
      setTopAssets(j.topAssets || []);
      setHosts(j.hosts || []);
      setLastLoaded(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [host]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, host]);

  const last15m = useMemo(() => {
    const cutoff = Date.now() - 15 * 60_000;
    return rows.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= cutoff);
  }, [rows]);

  const buildsSeen = useMemo(
    () => Array.from(new Set(rows.map((r) => r.buildId || '').filter(Boolean))),
    [rows],
  );

  return (
    <div className="p-6 space-y-6 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Stale Asset 404 Reports</h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Live beacons from browsers that hit a 404/410 on a hashed
            <code className="mx-1 px-1 bg-slate-800 rounded">/assets/*</code>
            or <code className="mx-1 px-1 bg-slate-800 rounded">/_build/*</code>
            URL. A burst right after a publish means the edge cache is still
            pointing at an old HTML shell — purge Cloudflare + Prerender.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 30s
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard
          label="Reports (loaded)"
          value={rows.length}
          tone={rows.length > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label="Last 15 minutes"
          value={last15m.length}
          tone={last15m.length > 0 ? 'bad' : 'ok'}
        />
        <StatCard label="Distinct builds seen" value={buildsSeen.length} />
        <StatCard label="Distinct hosts" value={hosts.length} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-slate-400">Host:</label>
        <select
          value={host}
          onChange={(e) => setHost(e.target.value)}
          className="bg-slate-800 border-2 border-slate-600 text-white rounded-lg px-3 py-2 text-sm min-h-[40px]"
        >
          <option value="">All hosts</option>
          {hosts.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        {lastLoaded > 0 && (
          <span className="text-xs text-slate-500 ml-2">
            Loaded {new Date(lastLoaded).toLocaleTimeString()}
          </span>
        )}
      </div>

      {err && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-200 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      {topAssets.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-2">Top failing assets</h2>
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Asset</th>
                  <th className="text-right px-3 py-2 w-20">Hits</th>
                </tr>
              </thead>
              <tbody>
                {topAssets.map((t) => (
                  <tr key={t.asset} className="border-t border-slate-800">
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-200 break-all">{t.asset}</td>
                    <td className="px-3 py-1.5 text-right font-bold text-amber-400">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Recent reports {rows.length > 0 && <span className="text-slate-500 font-normal">({rows.length})</span>}
        </h2>
        {rows.length === 0 && !loading ? (
          <div className="p-6 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2 text-slate-400 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            No stale-asset 404s reported. Everything's serving cleanly.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2 whitespace-nowrap">When</th>
                  <th className="text-left px-3 py-2">Asset</th>
                  <th className="text-left px-3 py-2">Host</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Reason</th>
                  <th className="text-left px-3 py-2">Build</th>
                  <th className="text-left px-3 py-2">Referer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800 align-top">
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-300" title={fmt(r.createdAt)}>
                      {relTime(r.createdAt)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-slate-200 break-all max-w-md">{r.asset}</td>
                    <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{r.host}</td>
                    <td className={`px-3 py-1.5 font-bold whitespace-nowrap ${
                      (r.status ?? 0) >= 500 ? 'text-red-400' :
                      (r.status ?? 0) === 404 || r.status === 410 ? 'text-amber-400' :
                      'text-slate-400'
                    }`}>{r.status || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{r.reason}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-500 whitespace-nowrap">{r.buildId || '-'}</td>
                    <td className="px-3 py-1.5 text-slate-500 break-all max-w-xs">{r.referer}</td>
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

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color =
    tone === 'bad' ? 'text-red-400' :
    tone === 'warn' ? 'text-amber-400' :
    'text-emerald-400';
  return (
    <div className="p-4 rounded-lg bg-slate-900 border border-slate-800">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
