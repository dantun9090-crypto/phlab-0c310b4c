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

export default function SwTelemetryDebugTab() {
  const [stats, setStats] = useState<SwTelemetryDebugStats>(() => getSwTelemetryDebugStats());
  const [autoRefresh, setAutoRefresh] = useState(true);

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
