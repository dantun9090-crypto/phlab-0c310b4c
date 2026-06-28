/**
 * Admin tab health bar — "Last fetched" + read/write error counters,
 * with optional auto-refresh, latency display, next-tick countdown,
 * and an inline loading indicator.
 *
 * Used in tabs backed by Firestore listeners (PrivacyRequestsTab,
 * ToastAuditTab, …) so we can confirm at a glance whether rules and
 * queries are working after a deploy. Counts are local to the mounted
 * tab and reset on remount/refresh — that's intentional: a quick smoke
 * indicator, not a long-running log.
 *
 * Auto-refresh: when `onRefresh` is provided, an admin can toggle a
 * ticker that re-invokes `onRefresh` every `autoRefreshIntervalMs`
 * (default 30s, floored at 5s). The interval is stable across parent
 * re-renders — `onRefresh` is held in a ref so a fresh closure on every
 * parent render does NOT tear down or restart the ticker.
 */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, Pause, Play, Loader2 } from 'lucide-react';

export interface HealthMetricsProps {
  /** Last successful snapshot timestamp; null while loading. */
  lastFetched: Date | null;
  /** Cumulative read-error count for this mount. */
  readErrors: number;
  /** Cumulative write-error count for this mount. */
  writeErrors: number;
  /** Most recent error code/message — shown in the read pill. */
  lastError?: string | null;
  /** Number of docs in the latest snapshot. */
  docCount?: number;
  /** Optional human label for the listener (e.g. "dsrRequests"). */
  source?: string;
  /** Refresh handler — re-subscribes the listener if provided. */
  onRefresh?: () => void;
  /** Auto-refresh tick interval in ms. Defaults to 30000 (30s). Floored at 5s. */
  autoRefreshIntervalMs?: number;
  /** If true, auto-refresh starts enabled on mount. Defaults to false. */
  defaultAutoRefresh?: boolean;
  /** Latency of the most recent fetch, in ms. */
  lastLatencyMs?: number | null;
  /** If true, a fetch is currently in progress — shows spinner. */
  isFetching?: boolean;
}

function timeAgo(d: Date | null): string {
  if (!d) return '—';
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleString('en-GB');
}

export default function HealthMetrics({
  lastFetched, readErrors, writeErrors, lastError, docCount, source, onRefresh,
  autoRefreshIntervalMs = 30_000, defaultAutoRefresh = false,
  lastLatencyMs = null, isFetching = false,
}: HealthMetricsProps) {
  // Re-render every 1s so "Last fetched" and the next-tick countdown stay fresh.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const [autoOn, setAutoOn] = useState<boolean>(defaultAutoRefresh && !!onRefresh);
  // Keep refs to the latest onRefresh and interval so the ticker doesn't
  // tear down when a parent passes a fresh closure each render.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  const intervalMsRef = useRef(autoRefreshIntervalMs);
  useEffect(() => { intervalMsRef.current = autoRefreshIntervalMs; }, [autoRefreshIntervalMs]);

  // Tracks when the next auto-refresh tick is scheduled for, so the UI can
  // render a countdown. Reset on toggle and on each tick.
  const [nextTickAt, setNextTickAt] = useState<number | null>(null);

  useEffect(() => {
    if (!autoOn) { setNextTickAt(null); return; }
    const ms = Math.max(5_000, intervalMsRef.current);
    setNextTickAt(Date.now() + ms);
    const id = setInterval(() => {
      onRefreshRef.current?.();
      setNextTickAt(Date.now() + Math.max(5_000, intervalMsRef.current));
    }, ms);
    return () => clearInterval(id);
    // Only re-run when toggled — NOT on every parent re-render that swaps
    // `onRefresh` or `autoRefreshIntervalMs`. Those are read via refs.
  }, [autoOn]);

  const ok = readErrors === 0 && writeErrors === 0;
  const effectiveInterval = Math.max(5_000, autoRefreshIntervalMs);
  const intervalLabel = `${Math.round(effectiveInterval / 1000)}s`;
  const secsToNext = nextTickAt ? Math.max(0, Math.ceil((nextTickAt - Date.now()) / 1000)) : null;

  return (
    <div
      role="status"
      aria-label="Tab health metrics"
      data-testid="health-metrics"
      className="flex items-center gap-2 flex-wrap text-xs bg-slate-900 border-2 border-slate-700 rounded-lg px-3 py-2"
    >
      <span
        className={`inline-flex items-center gap-1.5 font-semibold ${ok ? 'text-emerald-300' : 'text-amber-300'}`}
        title={ok ? 'No read/write errors since this tab opened' : `${readErrors} read / ${writeErrors} write errors`}
      >
        {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
        {ok ? 'Healthy' : 'Issues'}
      </span>

      {isFetching && (
        <>
          <span className="text-slate-500">·</span>
          <span
            data-testid="health-fetching"
            role="progressbar"
            aria-label="Fetching"
            className="inline-flex items-center gap-1 text-sky-300 font-mono"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            fetching…
          </span>
        </>
      )}

      <span className="text-slate-500">·</span>

      <span className="inline-flex items-center gap-1 text-slate-300" title={lastFetched ? lastFetched.toLocaleString('en-GB') : 'Never'}>
        <Clock className="w-3 h-3 text-slate-400" />
        <span className="text-slate-400">Last fetched:</span>
        <span data-testid="health-last-fetched" className="font-mono">{timeAgo(lastFetched)}</span>
      </span>

      {typeof lastLatencyMs === 'number' && lastLatencyMs >= 0 && (
        <>
          <span className="text-slate-500">·</span>
          <span
            data-testid="health-latency"
            className="text-slate-300"
            title="Latency of the most recent fetch"
          >
            <span className="text-slate-400">Latency:</span>{' '}
            <span className="font-mono">{Math.round(lastLatencyMs)}ms</span>
          </span>
        </>
      )}

      {typeof docCount === 'number' && (
        <>
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">
            <span className="text-slate-400">Docs:</span>{' '}
            <span data-testid="health-doc-count" className="font-mono">{docCount}</span>
          </span>
        </>
      )}

      <span className="text-slate-500">·</span>

      <span
        data-testid="health-read-errors"
        className={`px-1.5 py-0.5 rounded border font-mono ${readErrors > 0 ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-400 border-slate-700 bg-slate-800'}`}
        title={lastError || 'No read errors'}
      >
        read err: {readErrors}
      </span>

      <span
        data-testid="health-write-errors"
        className={`px-1.5 py-0.5 rounded border font-mono ${writeErrors > 0 ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-slate-400 border-slate-700 bg-slate-800'}`}
      >
        write err: {writeErrors}
      </span>

      {source && (
        <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500 font-mono">
          {source}
        </span>
      )}

      {onRefresh && (
        <>
          <button
            type="button"
            data-testid="health-auto-refresh-toggle"
            role="switch"
            aria-checked={autoOn}
            aria-label={autoOn ? `Pause auto-refresh (every ${intervalLabel})` : `Enable auto-refresh every ${intervalLabel}`}
            onClick={() => setAutoOn(v => !v)}
            className={`inline-flex items-center gap-1 px-2 h-7 rounded border font-mono text-[10px] uppercase tracking-wider ${
              autoOn
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={autoOn ? `Auto-refresh ON — every ${intervalLabel}` : `Auto-refresh OFF — click to poll every ${intervalLabel}`}
          >
            {autoOn ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            Auto {intervalLabel}
          </button>
          {autoOn && secsToNext !== null && (
            <span
              data-testid="health-next-tick"
              className="font-mono text-[10px] text-emerald-300/80"
              title="Time until next auto-refresh"
            >
              next in {secsToNext}s
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh tab data"
            data-testid="health-refresh"
            disabled={isFetching}
            className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded border border-slate-700 bg-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </>
      )}
    </div>
  );
}
