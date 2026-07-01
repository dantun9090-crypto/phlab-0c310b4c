/**
 * Cache Recovery — admin dashboard.
 *
 * Shows the 24h picture of the automatic chunk-reload / SW recovery
 * system so we can spot regressions before users complain:
 *
 *  - trend cards for recoveryTriggered / recoveryFailed / cacheResetShown
 *  - per-critical-route breakdown (/cart /checkout /payment /register /vip)
 *  - browser + version distribution of clients that hit recovery
 *  - percentile-based recommended thresholds from the last 7 days
 *  - a kill-switch toggle that disables the chunk-reload fallback across
 *    every browser session within ~60s (Firestore-backed flag read by
 *    /api/public/runtime-flags and honored in src/lib/chunk-reload.ts)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, doc, getDoc, setDoc, Timestamp } from '@/lib/firebase';

interface StatsBody {
  ok?: boolean;
  windowHours?: number;
  totals?: { events: number; recoveryTriggered: number; recoveryFailed: number; cacheResetShown: number };
  eventCounts?: Record<string, number>;
  browserCounts?: Record<string, number>;
  topBuilds?: Array<{ buildId: string; count: number }>;
  criticalRouteRecoveries?: Record<string, number>;
}

interface ThresholdBucket { p50: number; p95: number; p99: number; max: number; suggested: number }
interface ThresholdsBody {
  ok?: boolean;
  windowHours?: number;
  samples?: number;
  thresholds?: {
    recoveryTriggered: ThresholdBucket;
    recoveryFailed: ThresholdBucket;
    cacheResetShown: ThresholdBucket;
    criticalRoute: ThresholdBucket;
  };
}

interface FlagDoc { enabled?: boolean; reason?: string; updatedAt?: unknown }

const CARD = 'rounded-xl border border-slate-800 bg-slate-900/60 p-4';
const H = 'text-xs font-semibold uppercase tracking-wide text-slate-400';
const NUM = 'text-3xl font-bold text-white mt-1';

function fmt(n: number | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-GB') : '—';
}

export default function CacheRecoveryTab() {
  const [stats, setStats] = useState<StatsBody | null>(null);
  const [thresholds, setThresholds] = useState<ThresholdsBody | null>(null);
  const [flag, setFlag] = useState<FlagDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFlag, setSavingFlag] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, t] = await Promise.all([
        fetch('/api/public/cache-recovery-stats?hours=24', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/public/cache-recovery-thresholds', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setStats(s); setThresholds(t);
      try {
        const snap = await getDoc(doc(db, 'runtime_flags', 'chunk_reload'));
        setFlag(snap.exists() ? (snap.data() as FlagDoc) : { enabled: true });
      } catch { setFlag({ enabled: true }); }
    } catch (e) {
      setError((e as Error)?.message?.slice(0, 200) || 'load failed');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totals = stats?.totals;
  const routeEntries = useMemo(
    () => Object.entries(stats?.criticalRouteRecoveries || {}).sort((a, b) => b[1] - a[1]),
    [stats],
  );
  const browserEntries = useMemo(
    () => Object.entries(stats?.browserCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [stats],
  );
  const eventEntries = useMemo(
    () => Object.entries(stats?.eventCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [stats],
  );

  const toggleFlag = async (enabled: boolean) => {
    setSavingFlag(true);
    try {
      const reason = enabled
        ? 'Re-enabled from admin panel'
        : (window.prompt('Reason for disabling chunk-reload fallback?')?.trim() || 'Disabled from admin panel');
      await setDoc(doc(db, 'runtime_flags', 'chunk_reload'), {
        enabled,
        reason,
        updatedAt: Timestamp.now().toDate().toISOString(),
      }, { merge: true });
      setFlag({ enabled, reason, updatedAt: new Date().toISOString() });
    } catch (e) {
      alert('Failed to update flag: ' + (e as Error)?.message);
    } finally { setSavingFlag(false); }
  };

  const chunkEnabled = flag?.enabled !== false;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Cache Recovery</h2>
          <p className="text-sm text-slate-400 mt-1">
            Last 24h of automatic chunk-reload activity. Percentile thresholds computed over 7 days.
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-800 bg-red-900/30 p-3 text-red-200 text-sm">{error}</div>}

      {/* Kill switch */}
      <div className={CARD + ' flex items-center justify-between gap-4'}>
        <div>
          <div className={H}>Chunk-reload fallback (kill switch)</div>
          <div className={`mt-2 text-lg font-semibold ${chunkEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
            {chunkEnabled ? 'ENABLED — recovery active for all clients' : 'DISABLED — recovery suppressed globally'}
          </div>
          {flag?.reason && (
            <div className="text-xs text-slate-400 mt-1">Reason: {String(flag.reason)}</div>
          )}
          <div className="text-xs text-slate-500 mt-1">Propagates to every browser within ~60s.</div>
        </div>
        <button
          disabled={savingFlag}
          onClick={() => toggleFlag(!chunkEnabled)}
          className={`px-4 py-2 rounded-lg min-h-[48px] text-white font-semibold border-2 ${
            chunkEnabled
              ? 'bg-red-700 hover:bg-red-800 border-red-800'
              : 'bg-emerald-700 hover:bg-emerald-800 border-emerald-800'
          } disabled:opacity-50`}
        >
          {savingFlag ? 'Saving…' : chunkEnabled ? 'Disable fallback' : 'Enable fallback'}
        </button>
      </div>

      {/* Trend cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={CARD}>
          <div className={H}>Recovery triggered</div>
          <div className={NUM}>{fmt(totals?.recoveryTriggered)}</div>
          <div className="text-xs text-slate-500 mt-1">last 24h</div>
        </div>
        <div className={CARD}>
          <div className={H}>Recovery failed</div>
          <div className={NUM + ' text-amber-300'}>{fmt(totals?.recoveryFailed)}</div>
          <div className="text-xs text-slate-500 mt-1">blocked / kill-switch / loop-guard</div>
        </div>
        <div className={CARD}>
          <div className={H}>Cache-reset screen shown</div>
          <div className={NUM + ' ' + ((totals?.cacheResetShown ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400')}>
            {fmt(totals?.cacheResetShown)}
          </div>
          <div className="text-xs text-slate-500 mt-1">any &gt; 0 is a regression signal</div>
        </div>
        <div className={CARD}>
          <div className={H}>Total telemetry events</div>
          <div className={NUM}>{fmt(totals?.events)}</div>
          <div className="text-xs text-slate-500 mt-1">24h sample size</div>
        </div>
      </div>

      {/* Critical routes */}
      <div className={CARD}>
        <div className={H}>Critical-route recoveries (24h)</div>
        {routeEntries.length === 0 ? (
          <div className="text-sm text-emerald-400 mt-2">No recoveries on /cart, /checkout, /payment, /register, /vip</div>
        ) : (
          <table className="w-full text-sm mt-3">
            <thead><tr className="text-slate-400"><th className="text-left py-1">Route</th><th className="text-right py-1">Recoveries</th></tr></thead>
            <tbody>
              {routeEntries.map(([r, c]) => (
                <tr key={r} className="border-t border-slate-800"><td className="py-1 text-white font-mono">{r}</td><td className="py-1 text-right text-amber-300">{c}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Browser breakdown */}
      <div className={CARD}>
        <div className={H}>Top browsers hitting recovery (24h)</div>
        {browserEntries.length === 0 ? (
          <div className="text-sm text-slate-400 mt-2">No browser data.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {browserEntries.map(([b, c]) => {
              const max = browserEntries[0][1] || 1;
              const pct = Math.round((c / max) * 100);
              return (
                <div key={b}>
                  <div className="flex justify-between text-xs text-slate-300"><span className="font-mono">{b}</span><span>{c}</span></div>
                  <div className="h-2 bg-slate-800 rounded"><div className="h-2 bg-emerald-500 rounded" style={{ width: pct + '%' }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Event breakdown */}
      <div className={CARD}>
        <div className={H}>Event breakdown (24h)</div>
        <table className="w-full text-sm mt-3">
          <thead><tr className="text-slate-400"><th className="text-left py-1">Event</th><th className="text-right py-1">Count</th></tr></thead>
          <tbody>
            {eventEntries.map(([e, c]) => (
              <tr key={e} className="border-t border-slate-800"><td className="py-1 text-white font-mono">{e}</td><td className="py-1 text-right">{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Percentile thresholds */}
      <div className={CARD}>
        <div className={H}>Percentile thresholds (rolling 7d)</div>
        <div className="text-xs text-slate-500 mt-1 mb-3">
          Recommended per-hour alert thresholds. Sample: {thresholds?.samples ?? 0} events.
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400">
            <th className="text-left py-1">Metric</th><th className="text-right py-1">p50</th><th className="text-right py-1">p95</th><th className="text-right py-1">p99</th><th className="text-right py-1">Max</th><th className="text-right py-1 text-emerald-300">Suggested</th>
          </tr></thead>
          <tbody>
            {thresholds?.thresholds && (Object.entries(thresholds.thresholds) as Array<[string, ThresholdBucket]>).map(([name, b]) => (
              <tr key={name} className="border-t border-slate-800">
                <td className="py-1 text-white font-mono">{name}</td>
                <td className="py-1 text-right">{b.p50}</td>
                <td className="py-1 text-right">{b.p95}</td>
                <td className="py-1 text-right">{b.p99}</td>
                <td className="py-1 text-right">{b.max}</td>
                <td className="py-1 text-right text-emerald-300 font-semibold">{b.suggested}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
