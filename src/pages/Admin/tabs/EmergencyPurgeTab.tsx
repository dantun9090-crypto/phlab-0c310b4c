import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, RefreshCw } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { getCacheHealth, purgeCacheNow } from '@/lib/health-monitor.functions';

type PurgeResult = Awaited<ReturnType<typeof purgeCacheNow>>;
type HealthResult = Awaited<ReturnType<typeof getCacheHealth>>;

async function getToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

export default function EmergencyPurgeTab() {
  const [purging, setPurging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runHealthCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const idToken = await getToken();
      setHealth(await getCacheHealth({ data: { idToken } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const runPurge = async () => {
    if (purging) return;
    if (!window.confirm('Purge everything from the Cloudflare edge cache for phlabs.co.uk?')) return;
    setPurging(true);
    setError(null);
    try {
      const idToken = await getToken();
      const response = await purgeCacheNow({ data: { idToken } });
      setResult(response);
      await runHealthCheck();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Emergency Purge</h1>
        <p className="text-sm text-slate-400">
          Admin-only full edge cache purge for phlabs.co.uk when a deploy serves stale HTML.
        </p>
      </div>

      <div className="border-2 border-amber-700 bg-amber-950/30 rounded-lg p-4 text-amber-100 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          Use this only when the live site is blank, stuck refreshing, or serving an old build after publish.
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runPurge}
          disabled={purging}
          className="min-h-[48px] px-5 rounded-lg bg-emerald-600 border-2 border-emerald-500 text-white text-sm font-semibold flex items-center gap-2 hover:bg-emerald-500 disabled:opacity-60"
        >
          <Cloud className="w-4 h-4" />
          {purging ? 'Purging…' : 'Full Purge Cloudflare'}
        </button>
        <button
          type="button"
          onClick={runHealthCheck}
          disabled={checking}
          className="min-h-[48px] px-5 rounded-lg bg-slate-800 border-2 border-slate-600 text-white text-sm font-semibold flex items-center gap-2 hover:bg-slate-700 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          Check live cache
        </button>
      </div>

      {error && (
        <div className="border-2 border-red-700 bg-red-950/40 text-red-200 rounded-lg p-4 text-sm font-mono break-all">
          {error}
        </div>
      )}

      {result && (
        <div className={`border-2 rounded-lg p-4 ${result.ok ? 'border-emerald-700 bg-emerald-950/40 text-emerald-100' : 'border-red-700 bg-red-950/40 text-red-100'}`}>
          <div className="flex items-center gap-2 font-semibold mb-2">
            {result.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            Purge {result.ok ? 'completed' : 'failed'} · HTTP {result.status}
          </div>
          <pre className="text-xs whitespace-pre-wrap break-all opacity-80">{result.detail}</pre>
          <div className="text-xs opacity-70 mt-2">{result.at}</div>
        </div>
      )}

      {health && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border-2 border-slate-700 bg-slate-900 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400">CF Cache</div>
            <div className="text-white font-mono mt-1">{health.cfCacheStatus} · age {health.edgeAgeSeconds}s</div>
          </div>
          <div className="border-2 border-slate-700 bg-slate-900 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wider text-slate-400">Build ID</div>
            <div className="text-white font-mono mt-1 break-all">edge {health.edgeBuildId || '∅'}</div>
            <div className="text-slate-400 font-mono text-xs break-all">current {health.currentBuildId}</div>
          </div>
        </div>
      )}
    </div>
  );
}