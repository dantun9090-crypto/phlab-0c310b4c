/**
 * Admin → Health Monitor tab.
 *
 * Polls /admin getCacheHealth every 30s, surfaces sticky alerts for
 * dev-mode / build mismatch / stale chunks, exposes manual Cloudflare
 * purge button + 24h log download.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  getCacheHealth,
  purgeCacheNow,
  listHealthLogs,
  listHealthAlerts,
  acknowledgeHealthAlert,
} from '@/lib/health-monitor.functions';
import { AlertTriangle, CheckCircle2, RefreshCw, Cloud, Download, Bell } from 'lucide-react';

type HealthData = Awaited<ReturnType<typeof getCacheHealth>>;
type LogRow = Record<string, unknown> & { id: string };

async function getToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in');
  return u.getIdToken();
}

function StatusCard({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | null;
  detail: string;
}) {
  const colour =
    ok === null
      ? 'border-slate-700 bg-slate-800 text-slate-300'
      : ok
      ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
      : 'border-red-700 bg-red-950/40 text-red-200';
  return (
    <div className={`border-2 rounded-lg p-4 ${colour}`}>
      <div className="flex items-center gap-2 mb-1">
        {ok === null ? null : ok ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <AlertTriangle className="w-4 h-4" />
        )}
        <span className="text-xs uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <div className="text-sm font-mono break-all">{detail}</div>
    </div>
  );
}

export default function HealthMonitorTab() {
  const [data, setData] = useState<HealthData | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [alerts, setAlerts] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<number>(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getToken();
      const [health, log, alert] = await Promise.all([
        getCacheHealth({ data: { idToken } }),
        listHealthLogs({ data: { idToken, limit: 50 } }),
        listHealthAlerts({ data: { idToken } }),
      ]);
      setData(health);
      setLogs(log.ok ? log.rows : []);
      setAlerts(alert.ok ? alert.rows : []);
      setLastRun(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const onPurge = async () => {
    if (purging) return;
    if (!window.confirm('Purge the entire Cloudflare edge cache for phlabs.co.uk?')) return;
    setPurging(true);
    try {
      const idToken = await getToken();
      const r = await purgeCacheNow({ data: { idToken } });
      alert(r.ok ? '✓ Cloudflare cache purged' : `Purge failed: ${r.detail}`);
      refresh();
    } catch (e) {
      alert('Purge failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPurging(false);
    }
  };

  const onAck = async (id: string) => {
    try {
      const idToken = await getToken();
      await acknowledgeHealthAlert({ data: { idToken, id } });
      refresh();
    } catch (e) {
      alert('Ack failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const onDownload = () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = logs.filter((r) => Number(r.timestamp ?? 0) >= cutoff);
    const blob = new Blob([JSON.stringify(recent, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = useMemo(() => {
    if (!data)
      return [
        { label: 'Cache', ok: null, detail: 'Probing…' },
        { label: 'Assets', ok: null, detail: 'Probing…' },
        { label: 'Dev Mode', ok: null, detail: 'Probing…' },
        { label: 'Build ID', ok: null, detail: 'Probing…' },
        { label: 'TTFB', ok: null, detail: 'Probing…' },
      ];
    return [
      {
        label: 'Cache',
        ok: data.cfCacheStatus === 'HIT' && !data.buildMismatch,
        detail: `${data.cfCacheStatus} · age ${data.edgeAgeSeconds}s`,
      },
      {
        label: 'Assets',
        ok: !data.staleChunksDetected,
        detail: data.staleChunksDetected
          ? `${data.staleChunksList.length} stale chunk(s)`
          : 'All build chunks reachable',
      },
      {
        label: 'Dev Mode',
        ok: !data.devModeOn,
        detail: data.devModeOn ? 'ON — edge cache bypassed' : 'OFF',
      },
      {
        label: 'Build ID',
        ok: !data.buildMismatch,
        detail: data.buildMismatch
          ? `edge=${data.edgeBuildId || '∅'} ≠ origin=${data.currentBuildId}`
          : `${data.currentBuildId}`,
      },
      {
        label: 'TTFB',
        ok: data.ttfbMs < 1500,
        detail: `${data.ttfbMs} ms`,
      },
    ];
  }, [data]);

  const setupBanner = data && (data as { setupNeeded?: boolean }).setupNeeded;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Health Monitor</h2>
          <p className="text-sm text-slate-400">
            Edge cache, build sync, dev-mode, and asset reachability for phlabs.co.uk.
            Auto-refresh every 30 s.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="min-h-[48px] px-4 rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-sm flex items-center gap-2 hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onPurge}
            disabled={purging}
            className="min-h-[48px] px-4 rounded-lg bg-emerald-600 border-2 border-emerald-500 text-white text-sm flex items-center gap-2 hover:bg-emerald-500 disabled:opacity-60"
          >
            <Cloud className="w-4 h-4" />
            {purging ? 'Purging…' : 'Purge Cloudflare Cache'}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="min-h-[48px] px-4 rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-sm flex items-center gap-2 hover:bg-slate-700"
          >
            <Download className="w-4 h-4" />
            Download 24h
          </button>
        </div>
      </div>

      {setupBanner && (
        <div className="border-2 border-amber-700 bg-amber-950/40 text-amber-200 rounded-lg p-4 text-sm">
          Add <code>CLOUDFLARE_API_TOKEN</code> in Lovable secrets to enable
          dev-mode probing and auto-purge.
        </div>
      )}

      {error && (
        <div className="border-2 border-red-700 bg-red-950/40 text-red-200 rounded-lg p-4 text-sm font-mono break-all">
          {error}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="border-2 border-red-700 bg-red-950/40 text-red-100 rounded-lg p-4 flex items-start gap-3"
            >
              <Bell className="w-5 h-5 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold">{String(a.severity || 'alert').toUpperCase()}</div>
                <div className="text-sm opacity-90">{String(a.message || '')}</div>
              </div>
              <button
                type="button"
                onClick={() => onAck(a.id)}
                className="px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-xs hover:bg-slate-700"
              >
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <StatusCard key={c.label} label={c.label} ok={c.ok} detail={c.detail} />
        ))}
      </div>

      {data?.staleChunksDetected && (
        <div className="border-2 border-red-700 bg-red-950/40 text-red-100 rounded-lg p-4">
          <div className="font-semibold mb-2">Stale chunks (returning 404):</div>
          <ul className="text-xs font-mono space-y-1">
            {data.staleChunksList.map((u) => (
              <li key={u} className="break-all">{u}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-slate-900 border-2 border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-slate-700 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Recent health checks</h3>
          <span className="text-xs text-slate-400">
            {lastRun ? `Last refresh: ${new Date(lastRun).toLocaleTimeString()}` : '—'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-300">
            <thead className="bg-slate-800 text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">CF</th>
                <th className="px-3 py-2 text-left">Build</th>
                <th className="px-3 py-2 text-left">Stale</th>
                <th className="px-3 py-2 text-left">Dev</th>
                <th className="px-3 py-2 text-left">TTFB</th>
                <th className="px-3 py-2 text-left">Auto</th>
                <th className="px-3 py-2 text-left">OK</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={8}>
                    No logs yet. The cron will populate this once it runs.
                  </td>
                </tr>
              )}
              {logs.map((r) => {
                const ts = Number(r.timestamp ?? 0);
                return (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-mono">
                      {ts ? new Date(ts).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2">{String(r.cfCacheStatus ?? '—')}</td>
                    <td className="px-3 py-2">{r.buildMismatch ? '❌' : '✓'}</td>
                    <td className="px-3 py-2">{r.staleChunksDetected ? '❌' : '✓'}</td>
                    <td className="px-3 py-2">{r.devModeOn ? '❌' : '✓'}</td>
                    <td className="px-3 py-2">{String(r.ttfbMs ?? '—')} ms</td>
                    <td className="px-3 py-2">{String(r.autoAction ?? '—')}</td>
                    <td className="px-3 py-2">{r.ok ? '✓' : '❌'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
