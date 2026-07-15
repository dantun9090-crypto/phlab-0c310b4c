import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getDevModeStatus, setDevMode, setDevModeAndPurge } from '@/lib/cloudflare-devmode.functions';

/**
 * Red banner shown in the admin panel whenever Cloudflare Development Mode
 * is ON. Dev Mode auto-expires after 3 hours and when it flips off
 * Prerender.io may serve stale snapshots → blank white page for visitors.
 *
 * Two admin actions:
 *  - "Turn off now" — flips Dev Mode off (cache still has stale entries;
 *    they'll expire naturally under normal TTL).
 *  - "Turn off + purge cache" — flips off AND fires a full CF purge +
 *    Prerender.io recache in one call, so no stale bot snapshot can leak.
 */
export default function DevModeBanner() {
  const [status, setStatus] = useState<{ on: boolean; remainingSec: number } | null>(null);
  const [busy, setBusy] = useState<'off' | 'purge' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = auth.currentUser;
      if (!u) return;
      const idToken = await u.getIdToken();
      const r = await getDevModeStatus({ data: { idToken } });
      setStatus({ on: r.value === 'on', remainingSec: r.timeRemainingSec });
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000); // poll every minute
    return () => clearInterval(id);
  }, [refresh]);

  // Local countdown between API polls so the timer ticks every second.
  useEffect(() => {
    if (!status?.on) return;
    const id = setInterval(() => {
      setStatus((s) =>
        s && s.on && s.remainingSec > 0 ? { ...s, remainingSec: s.remainingSec - 1 } : s,
      );
    }, 1000);
    return () => clearInterval(id);
  }, [status?.on]);

  const turnOff = async () => {
    setBusy('off');
    setResult(null);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      await setDevMode({ data: { idToken, value: 'off' } });
      setResult('Dev Mode turned off. Cache entries will expire under normal TTL.');
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const turnOffAndPurge = async () => {
    setBusy('purge');
    setResult(null);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      const r = await setDevModeAndPurge({ data: { idToken } });
      const p = r.purge.ok ? 'OK' : `FAIL(${r.purge.status})`;
      const pr = r.prerender.ok ? 'OK' : 'FAIL';
      setResult(`Dev Mode off. Purge: ${p}. Prerender recache: ${pr}.`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!status?.on && !result) return null;

  if (!status?.on && result) {
    // Show one-shot confirmation after a successful action, then hide.
    return (
      <div className="bg-emerald-600/15 border-b-2 border-emerald-500/60 px-4 py-2.5 text-sm text-emerald-200">
        {result}
      </div>
    );
  }

  const h = Math.floor((status?.remainingSec ?? 0) / 3600);
  const m = Math.floor(((status?.remainingSec ?? 0) % 3600) / 60);
  const s = (status?.remainingSec ?? 0) % 60;
  const ttl = `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;

  return (
    <div className="bg-red-600/15 border-b-2 border-red-500/60 px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
      <div className="flex-1 text-sm min-w-[240px]">
        <span className="font-semibold text-red-200">
          Cloudflare Development Mode is ON
        </span>
        <span className="text-red-300/90 ml-2">
          — auto-expires in <span className="font-mono">{ttl}</span>. When it
          flips off, Prerender.io may serve stale snapshots and visitors will
          see a blank page.
        </span>
        {err && <div className="text-red-300/80 text-xs mt-1">{err}</div>}
        {result && <div className="text-emerald-300/90 text-xs mt-1">{result}</div>}
      </div>
      <button
        type="button"
        onClick={turnOff}
        disabled={busy !== null}
        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
      >
        {busy === 'off' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Turn off now
      </button>
      <button
        type="button"
        onClick={turnOffAndPurge}
        disabled={busy !== null}
        className="px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
      >
        {busy === 'purge' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Turn off + purge cache
      </button>
    </div>
  );
}
