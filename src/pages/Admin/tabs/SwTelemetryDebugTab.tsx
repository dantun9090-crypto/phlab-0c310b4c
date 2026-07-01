import { useEffect, useMemo, useState } from 'react';
import {
  getSwTelemetryDebugStats,
  logSwTelemetry,
  type SwTelemetryDebugStats,
} from '@/lib/swTelemetry';
import {
  clearMountSamples,
  loadMountSamples,
  mountSamplesToCsv,
  type MountErrorCode,
  type MountSample,
} from '@/lib/mount-error-codes';


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

// Bucketize samples into hourly bins for the last 24h, split by code.
interface TimelineBin { hour: number; label: string; counts: Record<string, number> }
const TRACKED_CODES: MountErrorCode[] = [
  'MOUNT_TIMEOUT_BLANK',
  'MOUNT_TIMEOUT_UNMOUNTED',
  'MOUNT_PARSE_ERROR',
  'MOUNT_CHUNK_LOAD_FAILED',
  'MOUNT_HYDRATION_MISMATCH',
  'MOUNT_BOOT_BAD',
  'MOUNT_UNKNOWN',
];
const CODE_COLOR: Record<string, string> = {
  MOUNT_TIMEOUT_BLANK: '#f43f5e',
  MOUNT_TIMEOUT_UNMOUNTED: '#fb923c',
  MOUNT_PARSE_ERROR: '#a855f7',
  MOUNT_CHUNK_LOAD_FAILED: '#f59e0b',
  MOUNT_HYDRATION_MISMATCH: '#38bdf8',
  MOUNT_BOOT_BAD: '#ef4444',
  MOUNT_UNKNOWN: '#94a3b8',
};

export type TimeWindowKey = '6h' | '24h' | '7d';
const WINDOWS: Record<TimeWindowKey, { totalMs: number; bins: number; bucketMs: number; labelFmt: (d: Date) => string }> = {
  '6h': {
    totalMs: 6 * 3_600_000,
    bins: 24,          // 15-min buckets
    bucketMs: 15 * 60_000,
    labelFmt: (d) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
  },
  '24h': {
    totalMs: 24 * 3_600_000,
    bins: 24,          // 1-hour buckets
    bucketMs: 3_600_000,
    labelFmt: (d) => `${d.getHours().toString().padStart(2, '0')}h`,
  },
  '7d': {
    totalMs: 7 * 24 * 3_600_000,
    bins: 28,          // 6-hour buckets
    bucketMs: 6 * 3_600_000,
    labelFmt: (d) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}h`,
  },
};

function buildTimeline(samples: MountSample[], windowKey: TimeWindowKey): TimelineBin[] {
  const cfg = WINDOWS[windowKey];
  const now = Date.now();
  const start = now - cfg.totalMs;
  const bins: TimelineBin[] = [];
  for (let i = cfg.bins - 1; i >= 0; i--) {
    const t = now - i * cfg.bucketMs;
    bins.push({ hour: t, label: cfg.labelFmt(new Date(t)), counts: {} });
  }
  for (const s of samples) {
    const t = s.eventTs ?? s.ts;
    if (t < start || t > now) continue;
    const idx = Math.min(cfg.bins - 1, Math.floor((now - t) / cfg.bucketMs));
    const bin = bins[cfg.bins - 1 - idx];
    if (!bin) continue;
    bin.counts[s.code] = (bin.counts[s.code] || 0) + 1;
  }
  return bins;
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

  // -- Retained mount samples (per-browser localStorage buffer) ------------
  const [samples, setSamples] = useState<MountSample[]>(() => loadMountSamples());
  const [filterBuild, setFilterBuild] = useState<string>('');
  const [filterRoute, setFilterRoute] = useState<string>('');
  const [timeWindow, setTimeWindow] = useState<TimeWindowKey>('24h');
  const [viewMode, setViewMode] = useState<'raw' | 'rate'>('raw');
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => setSamples(loadMountSamples()), 3000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  // -- Publish-hold banner (canary rollback flag) --------------------------
  interface PublishHoldDoc {
    buildId?: string; reason?: string; source?: string; hold?: boolean;
    bootBadInWindow?: number; failuresInWindow?: number; updatedAt?: string;
  }
  const [publishHold, setPublishHold] = useState<{ hold: boolean; current: PublishHoldDoc | null }>({ hold: false, current: null });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/public/publish-hold', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { hold?: boolean; current?: PublishHoldDoc | null };
        if (!cancelled) setPublishHold({ hold: !!data.hold, current: data.current ?? null });
      } catch { /* ignore */ }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const filteredSamples = useMemo(() => {
    const cfg = WINDOWS[timeWindow];
    const cutoff = Date.now() - cfg.totalMs;
    return samples.filter(
      (s) => (s.eventTs ?? s.ts) >= cutoff
        && (!filterBuild || s.buildId === filterBuild)
        && (!filterRoute || s.route === filterRoute),
    );
  }, [samples, filterBuild, filterRoute, timeWindow]);

  const buildOptions = useMemo(
    () => Array.from(new Set(samples.map((s) => s.buildId))).filter(Boolean),
    [samples],
  );
  const routeOptions = useMemo(
    () => Array.from(new Set(samples.map((s) => s.route))).filter(Boolean),
    [samples],
  );

  const codeTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const s of filteredSamples) t[s.code] = (t[s.code] || 0) + 1;
    return t;
  }, [filteredSamples]);

  const timeline = useMemo(() => buildTimeline(filteredSamples, timeWindow), [filteredSamples, timeWindow]);


  const downloadCsv = () => {
    const csv = mountSamplesToCsv(filteredSamples);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mount-telemetry-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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

      {/* -- Mount telemetry: retained samples + chart + CSV -------------- */}
      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Mount telemetry samples</div>
            <div className="text-sm text-slate-300">
              Retained locally: <span className="font-semibold text-white">{samples.length}</span>{' '}
              (filtered: <span className="font-semibold text-white">{filteredSamples.length}</span>)
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterBuild}
              onChange={(e) => setFilterBuild(e.target.value)}
              className="rounded border-2 border-slate-600 bg-slate-800 text-white text-sm px-2 py-1 min-h-[36px]"
            >
              <option value="">All build-ids</option>
              {buildOptions.map((b) => <option key={b} value={b}>{b.slice(0, 14)}</option>)}
            </select>
            <select
              value={filterRoute}
              onChange={(e) => setFilterRoute(e.target.value)}
              className="rounded border-2 border-slate-600 bg-slate-800 text-white text-sm px-2 py-1 min-h-[36px]"
            >
              <option value="">All routes</option>
              {routeOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={downloadCsv}
              disabled={filteredSamples.length === 0}
              className="rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 px-3 py-1 text-sm font-semibold text-white min-h-[36px]"
            >
              Export CSV
            </button>
            <button
              onClick={() => { clearMountSamples(); setSamples([]); }}
              className="rounded-lg border-2 border-rose-600 bg-rose-950 hover:bg-rose-900 px-3 py-1 text-sm font-semibold text-rose-200 min-h-[36px]"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Window + view controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 uppercase tracking-wide">Window</span>
          {(['6h', '24h', '7d'] as TimeWindowKey[]).map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`rounded px-2 py-1 border min-h-[32px] ${
                timeWindow === w
                  ? 'border-emerald-500 bg-emerald-950 text-emerald-200 font-semibold'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {w}
            </button>
          ))}
          <span className="ml-3 text-slate-400 uppercase tracking-wide">View</span>
          {(['raw', 'rate'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`rounded px-2 py-1 border min-h-[32px] ${
                viewMode === v
                  ? 'border-sky-500 bg-sky-950 text-sky-200 font-semibold'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title={v === 'raw' ? 'Raw counts per bucket' : 'Normalized: events per hour per bucket'}
            >
              {v === 'raw' ? 'Raw counts' : 'Rate (events/h)'}
            </button>
          ))}
        </div>


        {/* Totals per code */}
        <div className="flex flex-wrap gap-2 text-xs">
          {TRACKED_CODES.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-200">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: CODE_COLOR[c] }} />
              <span className="font-mono">{c.replace('MOUNT_', '')}</span>
              <span className="text-slate-400">{codeTotals[c] || 0}</span>
            </span>
          ))}
        </div>

        {/* 24h stacked-bar timeline (inline SVG, no chart lib) */}
        {(() => {
          const width = 720;
          const height = 140;
          const padLeft = 28;
          const padBottom = 20;
          const chartH = height - padBottom - 8;
          const chartW = width - padLeft - 8;
          const maxCount = Math.max(1, ...timeline.map((b) => TRACKED_CODES.reduce((n, c) => n + (b.counts[c] || 0), 0)));
          const barW = chartW / timeline.length - 2;
          return (
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 bg-slate-950 rounded border border-slate-800" role="img" aria-label="Mount telemetry per hour (last 24h)">
              {[0, 0.5, 1].map((f) => (
                <line key={f} x1={padLeft} x2={width - 8} y1={8 + chartH * (1 - f)} y2={8 + chartH * (1 - f)} stroke="#1e293b" strokeWidth={1} />
              ))}
              <text x={4} y={12} fill="#64748b" fontSize={10}>{maxCount}</text>
              <text x={4} y={height - padBottom - 2} fill="#64748b" fontSize={10}>0</text>
              {timeline.map((bin, i) => {
                let yCursor = 8 + chartH;
                return (
                  <g key={i}>
                    {TRACKED_CODES.map((c) => {
                      const v = bin.counts[c] || 0;
                      if (!v) return null;
                      const h = (v / maxCount) * chartH;
                      yCursor -= h;
                      return <rect key={c} x={padLeft + i * (barW + 2)} y={yCursor} width={barW} height={h} fill={CODE_COLOR[c]} />;
                    })}
                    {i % 4 === 0 && (
                      <text x={padLeft + i * (barW + 2)} y={height - 6} fill="#64748b" fontSize={9}>{bin.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          );
        })()}

        {filteredSamples.length === 0 && (
          <div className="text-xs text-slate-500 italic">
            No mount telemetry samples retained yet. Trigger the 5s mount-timeout probe in this browser
            (or wait for real events) — samples land in <code>localStorage.__phl_mount_samples</code>.
          </div>
        )}
      </div>



      <p className="text-xs text-slate-500">
        Note: these stats reflect <em>this</em> browser tab. To verify another visitor's session
        you still need Firestore's <code>sw_telemetry</code> collection or the Purge Incidents tab.
      </p>
    </div>
  );
}
