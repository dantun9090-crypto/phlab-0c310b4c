import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getDevModeStatus, setDevMode } from '@/lib/cloudflare-devmode.functions';

/**
 * Red banner shown in the admin panel whenever Cloudflare Development Mode
 * is ON. Dev Mode auto-expires after 3 hours and when it flips off
 * Prerender.io may serve stale snapshots → blank white page for visitors.
 * One-click "Turn off now" disables it via the Cloudflare API.
 */
export default function DevModeBanner() {
  const [status, setStatus] = useState<{ on: boolean; remainingSec: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    setBusy(true);
    try {
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      await setDevMode({ data: { idToken, value: 'off' } });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!status?.on) return null;

  const h = Math.floor(status.remainingSec / 3600);
  const m = Math.floor((status.remainingSec % 3600) / 60);
  const s = status.remainingSec % 60;
  const ttl = `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;

  return (
    <div className="bg-red-600/15 border-b-2 border-red-500/60 px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-semibold text-red-200">
          Cloudflare Development Mode is ON
        </span>
        <span className="text-red-300/90 ml-2">
          — auto-expires in <span className="font-mono">{ttl}</span>. When it
          flips off, Prerender.io may serve stale snapshots and visitors will
          see a blank page.
        </span>
        {err && <div className="text-red-300/80 text-xs mt-1">{err}</div>}
      </div>
      <button
        type="button"
        onClick={turnOff}
        disabled={busy}
        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Turn off now
      </button>
    </div>
  );
}
