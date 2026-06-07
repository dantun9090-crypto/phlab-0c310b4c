import { useState, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { db, collection, getDocs, addDoc, doc, deleteDoc, query, limit, Timestamp, auth } from '@/lib/firebase';
import { Loader2, CheckCircle2, XCircle, Play, RefreshCw, Gauge, Bot } from 'lucide-react';
import { probeEdgeHealth } from '@/lib/edge-health.functions';

type Status = 'idle' | 'running' | 'ok' | 'fail';
interface CheckResult { status: Status; message: string; }

const COLLECTIONS = ['emailSubscribers', 'coupons'] as const;
type Coll = typeof COLLECTIONS[number];

export default function DiagnosticsTab() {
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState(false);

  const setR = (key: string, r: CheckResult) =>
    setResults(prev => ({ ...prev, [key]: r }));

  const runChecks = async () => {
    setRunning(true);
    setResults({});

    for (const coll of COLLECTIONS) {
      // READ
      const readKey = `${coll}:read`;
      setR(readKey, { status: 'running', message: 'Reading…' });
      try {
        const snap = await getDocs(query(collection(db, coll), limit(1)));
        setR(readKey, { status: 'ok', message: `OK — ${snap.size} doc(s) returned (collection has data: ${!snap.empty})` });
      } catch (e: any) {
        setR(readKey, { status: 'fail', message: `${e?.code || 'error'}: ${e?.message || String(e)}` });
      }

      // WRITE (then cleanup)
      const writeKey = `${coll}:write`;
      setR(writeKey, { status: 'running', message: 'Writing test doc…' });
      try {
        const payload =
          coll === 'emailSubscribers'
            ? { email: `diag+${Date.now()}@diagnostic.test`, source: '__diagnostic__', createdAt: Timestamp.now() }
            : { code: `__DIAG_${Date.now()}`, type: 'percentage', value: 0, isActive: false, source: '__diagnostic__', createdAt: Timestamp.now() };
        const ref = await addDoc(collection(db, coll), payload);
        let cleanup = ' (cleanup failed)';
        try { await deleteDoc(doc(db, coll, ref.id)); cleanup = ' (cleanup OK)'; } catch {}
        setR(writeKey, { status: 'ok', message: `OK — created ${ref.id}${cleanup}` });
      } catch (e: any) {
        setR(writeKey, { status: 'fail', message: `${e?.code || 'error'}: ${e?.message || String(e)}` });
      }
    }

    setRunning(false);
  };

  const renderRow = (label: string, key: string) => {
    const r = results[key];
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800 border border-slate-700">
        <div className="mt-0.5 shrink-0">
          {!r && <div className="w-5 h-5 rounded-full bg-slate-700" />}
          {r?.status === 'running' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
          {r?.status === 'ok' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {r?.status === 'fail' && <XCircle className="w-5 h-5 text-red-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold">{label}</p>
          <p className="text-xs text-slate-300 font-mono break-words mt-0.5">
            {r?.message || 'Not run yet'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Firestore Diagnostics</h1>
        <p className="text-slate-400 text-sm mt-1">
          Tests anonymous-style read/write against <code className="text-emerald-400">emailSubscribers</code> and{' '}
          <code className="text-emerald-400">coupons</code> using the current admin session. If reads or writes fail here, the homepage protocol-library form will fail too.
        </p>
      </div>

      <EdgeHealthCard />

      <button
        onClick={runChecks}
        disabled={running}
        className="flex items-center gap-2 px-5 py-3 min-h-[48px] bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg font-semibold transition-colors"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {running ? 'Running checks…' : 'Run diagnostics'}
      </button>

      <div className="space-y-3">
        {COLLECTIONS.map(c => (
          <div key={c} className="space-y-2">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wide">{c}</h2>
            {renderRow(`Read ${c}`, `${c}:read`)}
            {renderRow(`Write + delete test doc in ${c}`, `${c}:write`)}
          </div>
        ))}
      </div>

      <div className="p-4 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-400">
        <p className="font-semibold text-slate-300 mb-1">Tip</p>
        <p>
          If write fails with <span className="font-mono">permission-denied</span>, update Firestore rules to allow <span className="font-mono">create</span> on
          {' '}<span className="font-mono">emailSubscribers</span> and <span className="font-mono">coupons</span> for the homepage flow.
        </p>
      </div>
    </div>
  );
}

function EdgeHealthCard() {
  const probe = useServerFn(probeEdgeHealth);
  const [data, setData] = useState<Awaited<ReturnType<typeof probeEdgeHealth>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = (await auth.currentUser?.getIdToken()) ?? '';
      const res = await probe({ data: { idToken } });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  const hitRate = data?.summary.hitRate ?? 0;
  const hitTone =
    hitRate >= 60 ? 'text-emerald-400' : hitRate >= 30 ? 'text-amber-400' : 'text-red-400';
  const preTone = data?.summary.prerenderActive ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-400" /> Edge Health — Cloudflare cache & Prerender
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Probes <code className="text-emerald-400">phlabs.co.uk</code> 3× per route to measure CF cache HIT %, and once as Googlebot to check if Prerender.io is active.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 min-h-[40px] bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-probe
        </button>
      </div>

      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-slate-800 border border-slate-700 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">CF cache HIT rate</p>
              <p className={`text-2xl font-bold ${hitTone}`}>{hitRate}%</p>
              <p className="text-[11px] text-slate-500">{data.summary.totalHits}/{data.summary.totalAttempts} attempts</p>
            </div>
            <div className="rounded-md bg-slate-800 border border-slate-700 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 flex items-center gap-1"><Bot className="w-3 h-3" /> Prerender.io active</p>
              <p className={`text-2xl font-bold ${preTone}`}>{data.summary.prerenderActive ? 'YES' : 'NO'}</p>
              <p className="text-[11px] text-slate-500">x-prerendered header on bot UA</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Per-route cache (browser UA)</p>
            {data.cache.map((r) => (
              <div key={r.path} className="flex items-center gap-2 text-xs font-mono bg-slate-800/60 rounded px-2 py-1.5">
                <span className="text-white flex-1 truncate">{r.path}</span>
                <span className="text-slate-300">{r.avgMs}ms avg</span>
                <span className="flex gap-1">
                  {r.attempts.map((a, i) => (
                    <span key={i} className={
                      a.cfCache === 'HIT' ? 'text-emerald-400' :
                      a.cfCache === 'MISS' ? 'text-amber-400' :
                      a.cfCache ? 'text-slate-400' : 'text-red-400'
                    }>{a.cfCache || a.status || 'ERR'}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Bot UA (Googlebot)</p>
            {data.bots.map((b) => (
              <div key={b.path} className="flex items-center gap-2 text-xs font-mono bg-slate-800/60 rounded px-2 py-1.5">
                <span className="text-white flex-1 truncate">{b.path}</span>
                <span className="text-slate-300">{b.status} · {b.ms}ms</span>
                <span className={b.prerendered ? 'text-emerald-400' : 'text-red-400'}>
                  {b.prerendered ? `prerender ${b.prerenderCache || 'ok'}` : 'no prerender'}
                </span>
                {b.rejectReason && <span className="text-red-400">{b.rejectReason}</span>}
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-500">Checked {new Date(data.checkedAt).toLocaleTimeString('en-GB')}</p>
        </>
      )}
    </div>
  );
}
