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

export type AutoRefreshSecs = 0 | 5 | 15 | 30 | 60;
const AUTO_REFRESH_OPTIONS: AutoRefreshSecs[] = [0, 5, 15, 30, 60];

// -----------------------------------------------------------------------------
// URL + localStorage persistence for view state (drill-down, filters, refresh)
// -----------------------------------------------------------------------------
const PERSIST_LS_KEY = '__phl_sw_debug_view_v1';

interface PersistedView {
  refreshSecs?: AutoRefreshSecs;
  timeWindow?: TimeWindowKey;
  viewMode?: 'raw' | 'rate';
  filterBuild?: string;
  filterRoute?: string;
  drill?: { hour: number; label: string; code: MountErrorCode } | null;
  sortKey?: SortKey;
  sortDir?: 'asc' | 'desc';
  pageSize?: number;
}

type SortKey = 'eventTs' | 'mountDurationMs' | 'route' | 'code';

function readPersistedView(): PersistedView {
  if (typeof window === 'undefined') return {};
  const out: PersistedView = {};
  try {
    const raw = localStorage.getItem(PERSIST_LS_KEY);
    if (raw) Object.assign(out, JSON.parse(raw) as PersistedView);
  } catch { /* ignore */ }
  try {
    const q = new URLSearchParams(location.search);
    const rs = q.get('rs'); if (rs != null) out.refreshSecs = (Number(rs) as AutoRefreshSecs);
    const tw = q.get('tw') as TimeWindowKey | null; if (tw && (tw === '6h' || tw === '24h' || tw === '7d')) out.timeWindow = tw;
    const vm = q.get('vm'); if (vm === 'raw' || vm === 'rate') out.viewMode = vm;
    const fb = q.get('fb'); if (fb != null) out.filterBuild = fb;
    const fr = q.get('fr'); if (fr != null) out.filterRoute = fr;
    const sk = q.get('sk') as SortKey | null;
    if (sk && ['eventTs', 'mountDurationMs', 'route', 'code'].includes(sk)) out.sortKey = sk;
    const sd = q.get('sd'); if (sd === 'asc' || sd === 'desc') out.sortDir = sd;
    const ps = q.get('ps'); if (ps) out.pageSize = Math.max(5, Math.min(200, Number(ps) || 25));
    const dd = q.get('dd');
    if (dd) {
      const [hourStr, code, ...rest] = dd.split('|');
      const hour = Number(hourStr);
      if (!Number.isNaN(hour) && code && TRACKED_CODES.includes(code as MountErrorCode)) {
        out.drill = { hour, code: code as MountErrorCode, label: rest.join('|') || new Date(hour).toLocaleTimeString() };
      }
    } else if (q.has('dd')) {
      out.drill = null;
    }
  } catch { /* ignore */ }
  return out;
}

function writePersistedView(v: PersistedView): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PERSIST_LS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  try {
    const url = new URL(location.href);
    const set = (k: string, val: string | number | null | undefined) => {
      if (val === '' || val == null) url.searchParams.delete(k);
      else url.searchParams.set(k, String(val));
    };
    set('rs', v.refreshSecs); set('tw', v.timeWindow); set('vm', v.viewMode);
    set('fb', v.filterBuild); set('fr', v.filterRoute);
    set('sk', v.sortKey); set('sd', v.sortDir); set('ps', v.pageSize);
    if (v.drill) url.searchParams.set('dd', `${v.drill.hour}|${v.drill.code}|${v.drill.label}`);
    else url.searchParams.delete('dd');
    history.replaceState(null, '', url.toString());
  } catch { /* ignore */ }
}

// Retry with exponential backoff, capped.
async function fetchWithBackoff<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try { return await fn(); }
  catch (err) {
    if (attempt >= 3) throw err;
    const delay = Math.min(8000, 500 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithBackoff(fn, attempt + 1);
  }
}

export default function SwTelemetryDebugTab() {
  const persisted = useMemo(() => readPersistedView(), []);
  const [stats, setStats] = useState<SwTelemetryDebugStats>(() => getSwTelemetryDebugStats());
  const [autoRefresh, setAutoRefresh] = useState(true);
  /** Unified refresh cadence (seconds) for samples + publish-hold + charts. */
  const [refreshSecs, setRefreshSecs] = useState<AutoRefreshSecs>(persisted.refreshSecs ?? 15);
  const [edge, setEdge] = useState<EdgeCorrelation | null>(null);
  const [edgeLoading, setEdgeLoading] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState<number>(() => Date.now());

  const refreshEdge = async () => {
    setEdgeLoading(true);
    setEdgeError(null);
    try {
      const result = await fetchWithBackoff(() => fetchEdgeCorrelation());
      setEdge(result);
      if (result.error) setEdgeError(result.error);
    } catch (err) {
      setEdgeError(String((err as Error)?.message || err).slice(0, 200));
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
  const [filterBuild, setFilterBuild] = useState<string>(persisted.filterBuild ?? '');
  const [filterRoute, setFilterRoute] = useState<string>(persisted.filterRoute ?? '');
  const [timeWindow, setTimeWindow] = useState<TimeWindowKey>(persisted.timeWindow ?? '24h');
  const [viewMode, setViewMode] = useState<'raw' | 'rate'>(persisted.viewMode ?? 'raw');
  /** Drill-down selection: click a bar segment to pin a (bucket, code) filter. */
  const [drillDown, setDrillDown] = useState<{ hour: number; label: string; code: MountErrorCode } | null>(persisted.drill ?? null);
  const [sortKey, setSortKey] = useState<SortKey>(persisted.sortKey ?? 'eventTs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(persisted.sortDir ?? 'desc');
  const [pageSize, setPageSize] = useState<number>(persisted.pageSize ?? 25);
  const [page, setPage] = useState<number>(0);

  // Sync all persisted view state to URL + localStorage.
  useEffect(() => {
    writePersistedView({ refreshSecs, timeWindow, viewMode, filterBuild, filterRoute, drill: drillDown, sortKey, sortDir, pageSize });
  }, [refreshSecs, timeWindow, viewMode, filterBuild, filterRoute, drillDown, sortKey, sortDir, pageSize]);

  // -- Publish-hold banner (canary rollback flag) --------------------------
  interface PublishHoldDoc {
    buildId?: string; reason?: string; source?: string; hold?: boolean;
    bootBadInWindow?: number; failuresInWindow?: number; updatedAt?: string;
  }
  const [publishHold, setPublishHold] = useState<{ hold: boolean; current: PublishHoldDoc | null }>({ hold: false, current: null });
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdRetryAt, setHoldRetryAt] = useState<number | null>(null);

  const loadHold = async () => {
    try {
      const data = await fetchWithBackoff(async () => {
        const res = await fetch('/api/public/publish-hold', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ hold?: boolean; current?: PublishHoldDoc | null }>;
      });
      setPublishHold({ hold: !!data.hold, current: data.current ?? null });
      setHoldError(null);
      setHoldRetryAt(null);
    } catch (err) {
      setHoldError(String((err as Error)?.message || err).slice(0, 200));
      setHoldRetryAt(Date.now() + 15_000);
    }
  };

  // Unified auto-refresh loop for samples + publish-hold. Cadence is user
  // controlled via `refreshSecs`. Setting it to 0 disables the timer.
  useEffect(() => {
    void loadHold();
    if (refreshSecs === 0) return;
    const id = window.setInterval(() => {
      setSamples(loadMountSamples());
      setLastAutoRefreshAt(Date.now());
      void loadHold();
    }, refreshSecs * 1000);
    return () => window.clearInterval(id);
  }, [refreshSecs]);


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

  /**
   * Samples that fall inside the currently drilled-down (bucket, code),
   * respecting the sortable-column selection.
   */
  const drillDownSamples = useMemo(() => {
    if (!drillDown) return [];
    const bucketMs = WINDOWS[timeWindow].bucketMs;
    const end = drillDown.hour;
    const start = end - bucketMs;
    const rows = filteredSamples.filter((s) => {
      const t = s.eventTs ?? s.ts;
      return s.code === drillDown.code && t > start && t <= end;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: MountSample, b: MountSample): number => {
      switch (sortKey) {
        case 'eventTs': return ((a.eventTs ?? a.ts) - (b.eventTs ?? b.ts)) * dir;
        case 'mountDurationMs': return ((a.mountDurationMs ?? -1) - (b.mountDurationMs ?? -1)) * dir;
        case 'route': return a.route.localeCompare(b.route) * dir;
        case 'code': return a.code.localeCompare(b.code) * dir;
      }
    };
    return rows.slice().sort(cmp);
  }, [drillDown, filteredSamples, timeWindow, sortKey, sortDir]);

  // Reset pagination when the drill-down data changes.
  useEffect(() => { setPage(0); }, [drillDown, sortKey, sortDir, pageSize, filterBuild, filterRoute, timeWindow]);

  const totalPages = Math.max(1, Math.ceil(drillDownSamples.length / pageSize));
  const pagedDrillDown = useMemo(
    () => drillDownSamples.slice(page * pageSize, page * pageSize + pageSize),
    [drillDownSamples, page, pageSize],
  );

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'route' || k === 'code' ? 'asc' : 'desc'); }
  };

  // Clear a stale drill-down whenever the underlying filter/window changes.
  useEffect(() => { setDrillDown(null); }, [timeWindow, filterBuild, filterRoute]);



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

  const downloadDrillDownCsv = () => {
    if (!drillDown || drillDownSamples.length === 0) return;
    const csv = mountSamplesToCsv(drillDownSamples);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeCode = drillDown.code.replace(/[^A-Za-z0-9_]/g, '');
    const safeLabel = drillDown.label.replace(/[^A-Za-z0-9_-]/g, '_');
    a.download = `mount-telemetry-drill-${safeCode}-${safeLabel}.csv`;
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

      {/* Publish-hold / rollback banner — surfaced from /api/public/publish-hold */}
      {publishHold.hold && publishHold.current && (
        <div
          role="alert"
          className="rounded-xl border-2 border-rose-600 bg-rose-950 p-4 text-rose-100 space-y-2"
        >
          <div className="flex items-center gap-2 font-semibold text-rose-200">
            <span aria-hidden>⛔</span>
            <span>Publish hold active — rollback recommended</span>
          </div>
          <div className="text-sm">
            Build{' '}
            <code className="rounded bg-rose-900/60 px-1 py-0.5 text-rose-100">
              {(publishHold.current.buildId || 'unknown').slice(0, 20)}
            </code>{' '}
            has been flagged by <span className="font-semibold">{publishHold.current.source || 'canary'}</span>.
            Do not re-publish until the underlying failure is resolved.
          </div>
          <div className="text-xs text-rose-200/80 grid grid-cols-1 md:grid-cols-2 gap-1">
            <div>Reason: <span className="text-white">{publishHold.current.reason || 'n/a'}</span></div>
            <div>Boot-bad in window: <span className="text-white">{publishHold.current.bootBadInWindow ?? 0}</span></div>
            <div>Failures in window: <span className="text-white">{publishHold.current.failuresInWindow ?? 0}</span></div>
            <div>Updated: <span className="text-white">{publishHold.current.updatedAt || '—'}</span></div>
          </div>
        </div>
      )}

      {/* Auto-refresh error banners — surfaced when publish-hold or edge fetch
          fails. Backoff retries fire from fetchWithBackoff; interval keeps
          polling. */}
      {holdError && (
        <div role="alert" className="rounded-lg border-2 border-amber-600 bg-amber-950/60 p-3 text-amber-100 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-semibold">Publish-hold fetch failed:</span> <span className="font-mono">{holdError}</span>
            {holdRetryAt && (
              <span className="ml-2 text-xs text-amber-200/80">
                Retrying in {Math.max(0, Math.ceil((holdRetryAt - Date.now()) / 1000))}s (or on next auto-refresh)
              </span>
            )}
          </div>
          <button
            onClick={() => { void loadHold(); }}
            className="rounded border border-amber-500 bg-amber-900 hover:bg-amber-800 px-3 py-1 text-xs font-semibold text-amber-100 min-h-[36px]"
          >
            Retry now
          </button>
        </div>
      )}
      {edgeError && (
        <div role="alert" className="rounded-lg border-2 border-amber-600 bg-amber-950/60 p-3 text-amber-100 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-semibold">Edge correlation fetch failed:</span> <span className="font-mono">{edgeError}</span>
          </div>
          <button
            onClick={() => { void refreshEdge(); }}
            disabled={edgeLoading}
            className="rounded border border-amber-500 bg-amber-900 hover:bg-amber-800 px-3 py-1 text-xs font-semibold text-amber-100 min-h-[36px] disabled:opacity-50"
          >
            {edgeLoading ? 'Retrying…' : 'Retry now'}
          </button>
        </div>
      )}




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
          Fast stats (1.5s)
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <span>Auto-refresh charts / hold</span>
          <select
            value={refreshSecs}
            onChange={(e) => setRefreshSecs(Number(e.target.value) as AutoRefreshSecs)}
            className="rounded border-2 border-slate-600 bg-slate-800 text-white text-sm px-2 py-1 min-h-[36px]"
            aria-label="Auto-refresh interval for mount telemetry and publish-hold banner"
          >
            {AUTO_REFRESH_OPTIONS.map((n) => (
              <option key={n} value={n}>{n === 0 ? 'Off' : `every ${n}s`}</option>
            ))}
          </select>
          {refreshSecs !== 0 && (
            <span className="text-xs text-slate-500">last {Math.max(0, Math.round((Date.now() - lastAutoRefreshAt) / 1000))}s ago</span>
          )}
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

        {/* Stacked-bar timeline (inline SVG, no chart lib). In "rate" mode
            each bucket is normalized to events per hour. */}
        {(() => {
          const width = 720;
          const height = 140;
          const padLeft = 32;
          const padBottom = 20;
          const chartH = height - padBottom - 8;
          const chartW = width - padLeft - 8;
          const cfg = WINDOWS[timeWindow];
          const scale = viewMode === 'rate' ? 3_600_000 / cfg.bucketMs : 1;
          const bucketTotals = timeline.map((b) =>
            TRACKED_CODES.reduce((n, c) => n + (b.counts[c] || 0), 0) * scale,
          );
          const maxCount = Math.max(1, ...bucketTotals);
          const barW = chartW / timeline.length - 2;
          const yLabel = viewMode === 'rate' ? `${maxCount.toFixed(1)}/h` : String(Math.ceil(maxCount));
          return (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-40 bg-slate-950 rounded border border-slate-800"
              role="img"
              aria-label={`Mount telemetry ${viewMode === 'rate' ? '(events/h)' : '(raw counts)'} for last ${timeWindow}`}
            >
              {[0, 0.5, 1].map((f) => (
                <line key={f} x1={padLeft} x2={width - 8} y1={8 + chartH * (1 - f)} y2={8 + chartH * (1 - f)} stroke="#1e293b" strokeWidth={1} />
              ))}
              <text x={4} y={12} fill="#64748b" fontSize={10}>{yLabel}</text>
              <text x={4} y={height - padBottom - 2} fill="#64748b" fontSize={10}>0</text>
              {timeline.map((bin, i) => {
                let yCursor = 8 + chartH;
                const labelStep = Math.max(1, Math.round(timeline.length / 6));
                return (
                  <g key={i}>
                    {TRACKED_CODES.map((c) => {
                      const v = (bin.counts[c] || 0) * scale;
                      if (!v) return null;
                      const h = (v / maxCount) * chartH;
                      yCursor -= h;
                      const isSelected = drillDown?.hour === bin.hour && drillDown?.code === c;
                      return (
                        <rect
                          key={c}
                          x={padLeft + i * (barW + 2)}
                          y={yCursor}
                          width={barW}
                          height={h}
                          fill={CODE_COLOR[c]}
                          stroke={isSelected ? '#fff' : 'none'}
                          strokeWidth={isSelected ? 1.5 : 0}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setDrillDown({ hour: bin.hour, label: bin.label, code: c })}
                        >
                          <title>{`${c.replace('MOUNT_', '')} · ${bin.label} · ${bin.counts[c] || 0} event(s) — click to drill down`}</title>
                        </rect>
                      );

                    })}
                    {i % labelStep === 0 && (
                      <text x={padLeft + i * (barW + 2)} y={height - 6} fill="#64748b" fontSize={9}>{bin.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          );
        })()}


        {/* Drill-down: raw samples for the clicked (bucket, code). */}
        {drillDown && (
          <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                Drill-down:{' '}
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: CODE_COLOR[drillDown.code] }} />
                  <span className="font-mono text-white">{drillDown.code.replace('MOUNT_', '')}</span>
                </span>{' '}
                at <span className="font-mono text-white">{drillDown.label}</span>
                {' '}·{' '}
                <span className="text-white font-semibold">{drillDownSamples.length}</span> sample(s)
              </div>
              <button
                onClick={() => setDrillDown(null)}
                className="rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 px-2 py-1 text-xs text-slate-200 min-h-[32px]"
              >
                Clear drill-down
              </button>
            </div>
            {drillDownSamples.length === 0 ? (
              <div className="text-xs text-slate-500 italic">No samples in this bucket (data may have been trimmed).</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono text-slate-200">
                  <thead className="text-slate-400 text-left">
                    <tr>
                      <th className="py-1 pr-3">Event time</th>
                      <th className="py-1 pr-3">Duration</th>
                      <th className="py-1 pr-3">Route</th>
                      <th className="py-1 pr-3">Build</th>
                      <th className="py-1 pr-3">Asset</th>
                      <th className="py-1 pr-3">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillDownSamples
                      .slice()
                      .sort((a, b) => (b.eventTs ?? b.ts) - (a.eventTs ?? a.ts))
                      .map((s, idx) => (
                        <tr key={idx} className="border-t border-slate-800">
                          <td className="py-1 pr-3">{new Date(s.eventTs ?? s.ts).toLocaleTimeString()}</td>
                          <td className="py-1 pr-3">{s.mountDurationMs != null ? `${s.mountDurationMs}ms` : '—'}</td>
                          <td className="py-1 pr-3 text-slate-300">{s.route}</td>
                          <td className="py-1 pr-3 text-slate-300">{(s.buildId || '').slice(0, 12)}</td>
                          <td className="py-1 pr-3 text-slate-300">{(s.assetHash || '').slice(0, 10)}</td>
                          <td className="py-1 pr-3 text-slate-400 max-w-[320px] truncate" title={s.message}>{s.message}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
