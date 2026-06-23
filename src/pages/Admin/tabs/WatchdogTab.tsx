/**
 * Watchdog / Auto-Heal tab — shows the latest watchdog runs written to
 * Firestore `watchdog_runs` by /api/public/hooks/watchdog. Lets admins
 * trigger a run manually for diagnostics.
 */
import { useEffect, useState } from 'react';
import {
  db, collection, getDocs, query, orderBy, limit as fbLimit,
} from '@/lib/firebase';
import {
  Bot, Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, Play, ChevronDown, ChevronRight,
} from 'lucide-react';

interface Check { name: string; ok: boolean; detail: string; durationMs: number }
interface Heal { name: string; ok: boolean; detail: string }
interface Run {
  id: string;
  startedAt?: string;
  finishedAt?: string;
  status?: 'healthy' | 'degraded' | 'critical';
  totalChecks?: number;
  failed?: number;
  brokenImages?: number;
  checks?: Check[];
  heals?: Heal[];
  createdAt?: string;
}

export default function WatchdogTab() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true); setError('');
    try {
      const snap = await getDocs(query(collection(db, 'watchdog_runs'), orderBy('createdAt', 'desc'), fbLimit(30)));
      setRuns(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e: any) {
      setError(e?.message || 'Failed to load runs');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const triggerRun = async () => {
    setRunning(true); setRunResult('');
    try {
      // No secret in the browser — admin manual run uses an admin-gated proxy.
      const res = await fetch('/api/public/hooks/watchdog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (res.status === 401) {
        setRunResult('Manual trigger needs the shared secret. The bot runs automatically every 5 min via cron — refresh the history below to see results.');
      } else if (!res.ok) {
        setRunResult(`Failed: ${res.status}`);
      } else {
        const data = await res.json();
        setRunResult(`OK — status: ${data.status}, ${data.failed}/${data.totalChecks} failed`);
        await load();
      }
    } catch (e: any) {
      setRunResult(e?.message || 'Run failed');
    } finally { setRunning(false); }
  };

  const statusBadge = (s?: string) => {
    if (s === 'healthy') return <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Healthy</span>;
    if (s === 'degraded') return <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Degraded</span>;
    if (s === 'critical') return <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1"><XCircle className="w-3 h-3" />Critical</span>;
    return <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 text-[11px]">Unknown</span>;
  };

  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('en-GB') : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            Watchdog / Auto-Heal
          </h2>
          <p className="text-[#9cb8d9] text-sm mt-1 max-w-2xl">
            Background bot that runs every 5 minutes via cron. Checks site reachability, sitemap,
            robots.txt, stuck orders, Fena retry queue depth and recent product image health.
            Auto-heals safe issues (Prerender recache, Fena retry drain) and logs every run here.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerRun}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run now
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {runResult && (
        <div className="px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm">
          {runResult}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07]">
        <h3 className="text-sm font-bold text-[#9cb8d9] uppercase tracking-widest mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Schedule
        </h3>
        <pre className="text-[11px] text-emerald-300 bg-black/40 p-3 rounded-lg overflow-auto font-mono leading-relaxed">{`-- Run in Cloud → Database → SQL Editor (once)
select cron.schedule(
  'watchdog-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://phlabs.co.uk/api/public/hooks/watchdog',
    headers := jsonb_build_object('content-type','application/json','x-watchdog-secret','<CLEANUP_SECRET value>')
  );
  $$
);`}</pre>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-[#9cb8d9]"><Loader2 className="w-5 h-5 animate-spin" /> Loading runs…</div>
      ) : runs.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07] text-center text-[#9cb8d9] text-sm">
          No watchdog runs yet. Schedule the cron above or click "Run now" (needs the shared secret).
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => {
            const isOpen = !!expanded[r.id];
            return (
              <div key={r.id} className="rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07] overflow-hidden">
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-[#9cb8d9] flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#9cb8d9] flex-shrink-0" />}
                    {statusBadge(r.status)}
                    <span className="text-white text-sm truncate">{fmt(r.startedAt || r.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#9cb8d9] flex-shrink-0">
                    <span><b className="text-white">{(r.totalChecks ?? 0) - (r.failed ?? 0)}</b>/{r.totalChecks ?? 0} ok</span>
                    {!!r.failed && <span className="text-red-300">{r.failed} failed</span>}
                    {!!r.brokenImages && <span className="text-amber-300">{r.brokenImages} broken img</span>}
                    {!!r.heals?.length && <span className="text-emerald-300">{r.heals.length} heal</span>}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/[0.04] space-y-3">
                    <div>
                      <div className="text-[11px] font-semibold text-[#9cb8d9] uppercase tracking-widest mb-1">Checks</div>
                      <div className="grid sm:grid-cols-2 gap-1.5">
                        {r.checks?.map((c, i) => (
                          <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-xs ${c.ok ? 'bg-emerald-500/5 text-emerald-200' : 'bg-red-500/10 text-red-200'}`}>
                            {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                            <div className="min-w-0 flex-1">
                              <div className="font-mono font-semibold truncate">{c.name}</div>
                              <div className="text-[10px] opacity-80 truncate">{c.detail} · {c.durationMs}ms</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {!!r.heals?.length && (
                      <div>
                        <div className="text-[11px] font-semibold text-[#9cb8d9] uppercase tracking-widest mb-1">Auto-heal actions</div>
                        <div className="space-y-1">
                          {r.heals.map((h, i) => (
                            <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${h.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}>
                              {h.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                              <span className="font-mono font-semibold">{h.name}</span>
                              <span className="opacity-80">— {h.detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
