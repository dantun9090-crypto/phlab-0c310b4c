import { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Pause, Play, Shield, XCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { probeEdgeMonitor, type MonitorSample, type Probe } from '@/lib/edge-monitor.functions';
import { getCloudflareBotStatus, type CloudflareBotStatus } from '@/lib/cloudflare-bot.functions';

/**
 * Real-time monitor for Cloudflare HTML edge cache, Prerender.io Googlebot
 * rendering, and Firebase /__/auth/iframe. Auto-refreshes every 30s,
 * persists every sample to Firestore, raises panel-only alerts on spike
 * or sustained failure.
 */

const POLL_MS = 30_000;

export default function EdgeMonitorTab() {
  const [sample, setSample] = useState<MonitorSample | null>(null);
  const [history, setHistory] = useState<MonitorSample[]>([]);
  const [spike, setSpike] = useState(false);
  const [sustained, setSustained] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const [botStatus, setBotStatus] = useState<CloudflareBotStatus | null>(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);

  const fetchBotStatus = async () => {
    setBotLoading(true);
    setBotError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      const res = await getCloudflareBotStatus({ data: { idToken } });
      setBotStatus(res);
    } catch (e) {
      setBotError(e instanceof Error ? e.message : 'bot status failed');
    } finally {
      setBotLoading(false);
    }
  };

  const probe = async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in as admin first');
      const res = await probeEdgeMonitor({ data: { idToken, persist: true, withHistory: true } });
      if (!res.ok || !('sample' in res)) {
        throw new Error(('reason' in res && res.reason) || 'probe_failed');
      }
      setSample(res.sample);
      setHistory(res.history);
      setSpike(res.spike);
      setSustained(res.sustainedFailures);
      setLastRun(new Date().toLocaleTimeString('en-GB'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'probe failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void probe();
    void fetchBotStatus();
  }, []);

  useEffect(() => {
    if (paused) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = window.setInterval(() => { void probe(); }, POLL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [paused]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" />
            Edge Monitor
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Auto-refresh every {POLL_MS / 1000}s. Cloudflare HTML cache, Prerender.io
            Googlebot output, and Firebase auth iframe. Panel-only alerts.
            {lastRun && <span className="ml-2 text-slate-500">last: {lastRun}</span>}
          </p>
          {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-sm"
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={() => void probe()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Probe now
          </button>
        </div>
      </header>

      {/* Alert banner */}
      {sample && (sustained.length > 0 ? (
        <div className="rounded-xl border-2 border-red-500/60 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400 mt-0.5" />
          <div>
            <div className="text-red-300 font-bold">Sustained failure</div>
            <div className="text-sm text-red-200/80 mt-1">
              {sustained.join(', ')} failing in last 2 samples. Investigate Cloudflare zone, Prerender quota, or origin.
            </div>
          </div>
        </div>
      ) : spike ? (
        <div className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-400 mt-0.5" />
          <div>
            <div className="text-amber-300 font-bold">Spike detected</div>
            <div className="text-sm text-amber-200/80 mt-1">
              {sample.failedCount} check{sample.failedCount === 1 ? '' : 's'} failing or response &gt; 5s. Watch next sample for sustained signal.
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          <div className="text-emerald-300 text-sm font-medium">All probes healthy.</div>
        </div>
      ))}

      {/* Cloudflare Bot Management status */}
      <section>
        <h2 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">
          Cloudflare Bot Management
        </h2>
        <BotStatusCard
          status={botStatus}
          loading={botLoading}
          error={botError}
          onRefresh={() => void fetchBotStatus()}
        />
      </section>

      {/* Current probes */}
      {sample && (
        <section>
          <h2 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">Current sample</h2>
          <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800 bg-slate-900">
            {sample.probes.map((p) => <ProbeRow key={p.id} probe={p} />)}
          </div>
        </section>
      )}

      {/* History sparkline (failed counts) */}
      {history.length > 1 && (
        <section>
          <h2 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">
            History — last {history.length} samples (newest left)
          </h2>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-end gap-1 h-16">
              {history.map((h, i) => {
                const failPct = h.probes.length > 0 ? h.failedCount / h.probes.length : 0;
                const heightPct = Math.max(8, failPct * 100);
                const bg = h.failedCount === 0 ? 'bg-emerald-500/70' : h.failedCount <= 1 ? 'bg-amber-500/70' : 'bg-red-500/70';
                return (
                  <div
                    key={i}
                    title={`${h.timestamp} — ${h.failedCount}/${h.probes.length} failing`}
                    className={`flex-1 min-w-[4px] rounded-sm ${bg}`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-2">
              <span>{new Date(history[0].timestamp).toLocaleTimeString('en-GB')}</span>
              <span>{new Date(history[history.length - 1].timestamp).toLocaleTimeString('en-GB')}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function BotStatusCard({
  status,
  loading,
  error,
  onRefresh,
}: {
  status: CloudflareBotStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const cfg = status?.config;
  const sbfmDisabled =
    cfg?.fight_mode === false &&
    cfg?.sbfm_definitely_automated === 'allow' &&
    cfg?.sbfm_verified_bots === 'allow';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-slate-400" />
          <span className="text-sm font-semibold text-white">Super Bot Fight Mode</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}
      {!status && !loading && !error && <div className="text-sm text-slate-400">No status loaded.</div>}

      {status && (
        <>
          <div className="flex items-center gap-2">
            {sbfmDisabled ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-amber-400" />
            )}
            <span className={`text-sm font-medium ${sbfmDisabled ? 'text-emerald-300' : 'text-amber-300'}`}>
              {sbfmDisabled ? 'Disabled (actions set to allow)' : 'Enabled or partially active'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <span className="text-slate-500">fight_mode</span>
              <span className="text-slate-200 block">{String(cfg?.fight_mode ?? '—')}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <span className="text-slate-500">definitely_automated</span>
              <span className="text-slate-200 block">{cfg?.sbfm_definitely_automated ?? '—'}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <span className="text-slate-500">verified_bots</span>
              <span className="text-slate-200 block">{cfg?.sbfm_verified_bots ?? '—'}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <span className="text-slate-500">ai_bots</span>
              <span className="text-slate-200 block">{cfg?.ai_bots_protection ?? '—'}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <span className="text-slate-500">content_bots</span>
              <span className="text-slate-200 block">{cfg?.content_bots_protection ?? '—'}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <span className="text-slate-500">crawler</span>
              <span className="text-slate-200 block">{cfg?.crawler_protection ?? '—'}</span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="text-xs font-semibold text-slate-400 mb-2">Live probe</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded p-2">
                <span className="text-slate-500">cf-cache-status</span>
                <span className="text-slate-200 block">{status.probe.cfCache ?? '—'}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-2">
                <span className="text-slate-500">__cf_bm cookie</span>
                <span className={`block ${status.probe.hasCfBm ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {status.probe.hasCfBm ? 'Present' : 'Absent'}
                </span>
              </div>
            </div>
            {status.probe.hasCfBm && (
              <p className="text-xs text-slate-400 mt-2">
                Cloudflare Pro still injects the <code className="text-slate-300">__cf_bm</code> session cookie even when SBFM actions are set to allow. Full cookie removal requires Enterprise <code className="text-slate-300">bm_cookie_enabled</code> or a plan downgrade.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProbeRow({ probe }: { probe: Probe }) {
  const okClass = probe.ok ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="p-3 flex items-center gap-3">
      {probe.ok ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-red-400" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{probe.label}</div>
        {probe.detail && <div className="text-xs text-slate-400 truncate">{probe.detail}</div>}
      </div>
      <div className="flex items-center gap-3 text-xs">
        {probe.cfCache && (
          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 uppercase tracking-wider text-[10px]">
            CF: {probe.cfCache}
          </span>
        )}
        <span className="text-slate-400 tabular-nums">{probe.ms}ms</span>
        <span className={`tabular-nums font-bold ${okClass}`}>{probe.status || '—'}</span>
      </div>
    </div>
  );
}
