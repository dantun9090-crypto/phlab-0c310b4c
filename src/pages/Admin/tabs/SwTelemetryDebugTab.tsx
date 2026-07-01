import { useEffect, useState } from 'react';
import {
  getSwTelemetryDebugStats,
  logSwTelemetry,
  type SwTelemetryDebugStats,
} from '@/lib/swTelemetry';

function fmtTs(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleTimeString()} (${Math.round((Date.now() - ts) / 1000)}s ago)`;
}

function statusColor(s: SwTelemetryDebugStats['lastFlushStatus']): string {
  switch (s) {
    case 'ok': return 'text-emerald-400';
    case 'error': return 'text-rose-400';
    case 'buffered': return 'text-amber-400';
    default: return 'text-slate-400';
  }
}

interface EdgeCorrelation {
  fetchedAt: number;
  status: number;
  htmlBuildId: string;    // meta build-id in served HTML
  runtimeBuildId: string; // window.__BUILD_ID__ / meta at hydration
  assetHash: string;      // x-phl-asset-hash
  entry: string;          // x-phl-entry
  cache: string;
  bootBad: boolean;
  mismatch: boolean;
  error?: string;
}

async function fetchEdgeCorrelation(): Promise<EdgeCorrelation> {
  const url = location.pathname + (location.search || '');
  const runtime =
    (window as unknown as { __BUILD_ID__?: string }).__BUILD_ID__ ||
    document.querySelector('meta[name="build-id"]')?.getAttribute('content') ||
    'unknown';
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'x-phl-canary': 'admin-debug' },
      redirect: 'follow',
    });
    const htmlBuildId =
      res.headers.get('x-phl-build-id') ||
      // fallback: parse first bytes for meta
      '';
    const assetHash = res.headers.get('x-phl-asset-hash') || '';
    const entry = res.headers.get('x-phl-entry') || '';
    const bootBad = res.headers.get('x-phl-boot-bad') === '1';
    const cache = res.headers.get('x-phl-cache') || res.headers.get('cf-cache-status') || '—';
    const mismatch = !!htmlBuildId && htmlBuildId !== runtime;
    return {
      fetchedAt: Date.now(),
      status: res.status,
      htmlBuildId: htmlBuildId || 'n/a',
      runtimeBuildId: runtime,
      assetHash: assetHash || 'n/a',
      entry: entry || 'n/a',
      cache,
      bootBad,
      mismatch,
    };
  } catch (err) {
    return {
      fetchedAt: Date.now(),
      status: 0,
      htmlBuildId: 'n/a',
      runtimeBuildId: runtime,
      assetHash: 'n/a',
      entry: 'n/a',
      cache: '—',
      bootBad: false,
      mismatch: false,
      error: String((err as Error)?.message || err).slice(0, 200),
    };
  }
}

export default function SwTelemetryDebugTab() {
  const [stats, setStats] = useState<SwTelemetryDebugStats>(() => getSwTelemetryDebugStats());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [edge, setEdge] = useState<EdgeCorrelation | null>(null);
  const [edgeLoading, setEdgeLoading] = useState(false);

  const refreshEdge = async () => {
    setEdgeLoading(true);
    try {
      setEdge(await fetchEdgeCorrelation());
    } finally {
      setEdgeLoading(false);
    }
  };

  useEffect(() => {
    const refresh = () => setStats(getSwTelemetryDebugStats());
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<SwTelemetryDebugStats>).detail;
      if (detail) setStats({ ...detail });
    };
    window.addEventListener('phl-sw-tel-stats', onEvent);
    let id: number | undefined;
    if (autoRefresh) {
      id = window.setInterval(refresh, 1500);
    }
    refresh();
    void refreshEdge();
    return () => {
      window.removeEventListener('phl-sw-tel-stats', onEvent);
      if (id) window.clearInterval(id);
    };
  }, [autoRefresh]);

  const fireTest = () => {
    logSwTelemetry('sw_stale_reload_shown', { source: 'admin_debug_test', ts: Date.now() });
    setTimeout(() => setStats(getSwTelemetryDebugStats()), 250);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">SW Telemetry Debug</h2>
        <p className="text-sm text-slate-400 mt-1">
          Live view of the client's <code>sw_telemetry</code> write queue. Use this on a real
          browser session to verify events reach Firestore.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Queue size</div>
          <div className={`mt-2 text-3xl font-bold ${stats.queueSize > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {stats.queueSize}
          </div>
          <div className="mt-1 text-xs text-slate-500">Pending buffered events</div>
        </div>

        <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Last flush</div>
          <div className={`mt-2 text-lg font-semibold ${statusColor(stats.lastFlushStatus)}`}>
            {stats.lastFlushStatus.toUpperCase()}
          </div>
          <div className="mt-1 text-xs text-slate-400">{fmtTs(stats.lastFlushAt)}</div>
          {stats.lastFlushError && (
            <div className="mt-2 text-xs text-rose-300 break-words">{stats.lastFlushError}</div>
          )}
        </div>

        <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Counters</div>
          <div className="mt-2 text-sm text-white">
            Writes: <span className="text-emerald-400 font-semibold">{stats.writes}</span>
          </div>
          <div className="text-sm text-white">
            Failures: <span className="text-rose-400 font-semibold">{stats.failures}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-4 space-y-2">
        <div className="text-sm text-slate-300">
          <span className="text-slate-400">Last event:</span>{' '}
          <span className="font-mono text-white">{stats.lastEvent || '—'}</span>{' '}
          <span className="text-slate-500">{fmtTs(stats.lastEventAt)}</span>
        </div>
        <div className="text-xs text-slate-400">
          Session: <span className="font-mono text-slate-300">{stats.sessionId || '—'}</span>
        </div>
        <div className="text-xs text-slate-400">
          Build:   <span className="font-mono text-slate-300">{stats.buildId || '—'}</span>
        </div>
      </div>

      {/* Edge correlation headers — spot build-id/asset mismatches instantly */}
      <div className={`rounded-xl border-2 p-4 space-y-2 ${edge?.mismatch || edge?.bootBad ? 'border-rose-500 bg-rose-950/40' : 'border-slate-700 bg-slate-900'}`}>
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-slate-400">Edge correlation (this route)</div>
          <button
            onClick={refreshEdge}
            disabled={edgeLoading}
            className="text-xs rounded border border-slate-600 bg-slate-800 px-2 py-1 text-white disabled:opacity-50"
          >
            {edgeLoading ? 'Fetching…' : 'Re-fetch'}
          </button>
        </div>
        {!edge ? (
          <div className="text-xs text-slate-500">Loading edge headers…</div>
        ) : (
          <>
            {edge.mismatch && (
              <div className="rounded bg-rose-600/30 border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-100">
                ⚠ Build-ID mismatch: HTML edge cache is serving an older build than the running JS. A hard refresh or edge purge is required.
              </div>
            )}
            {edge.bootBad && (
              <div className="rounded bg-amber-600/30 border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-100">
                ⚠ Worker flagged x-phl-boot-bad=1 (broken inline SW cleanup script). Check canary and inline-boot-scripts test.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
              <div><span className="text-slate-400">x-phl-build-id (HTML):</span>{' '}<span className={edge.mismatch ? 'text-rose-300' : 'text-emerald-300'}>{edge.htmlBuildId}</span></div>
              <div><span className="text-slate-400">runtime __BUILD_ID__:</span>{' '}<span className="text-slate-200">{edge.runtimeBuildId}</span></div>
              <div><span className="text-slate-400">x-phl-asset-hash:</span>{' '}<span className="text-slate-200">{edge.assetHash}</span></div>
              <div><span className="text-slate-400">x-phl-entry:</span>{' '}<span className="text-slate-200 break-all">{edge.entry}</span></div>
              <div><span className="text-slate-400">cache:</span>{' '}<span className="text-slate-200">{edge.cache}</span></div>
              <div><span className="text-slate-400">status:</span>{' '}<span className="text-slate-200">{edge.status}</span></div>
              <div className="md:col-span-2 text-slate-500">Fetched {fmtTs(edge.fetchedAt)}</div>
              {edge.error && <div className="md:col-span-2 text-rose-300">Error: {edge.error}</div>}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={fireTest}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-semibold text-white min-h-[48px]"
        >
          Fire test event
        </button>
        <button
          onClick={() => setStats(getSwTelemetryDebugStats())}
          className="rounded-lg border-2 border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white min-h-[48px]"
        >
          Refresh now
        </button>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (1.5s)
        </label>
      </div>

      <p className="text-xs text-slate-500">
        Note: these stats reflect <em>this</em> browser tab. To verify another visitor's session
        you still need Firestore's <code>sw_telemetry</code> collection or the Purge Incidents tab.
      </p>
    </div>
  );
}
