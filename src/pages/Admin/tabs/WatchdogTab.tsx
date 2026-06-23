/**
 * Watchdog tab — Cloudflare Dev Mode monitor + auto-heal run history.
 *
 * Top section: live Cloudflare Dev Mode status (polled via getDevModeStatus
 * server fn), session details from `watchdog/devmode_alerts`, recent
 * `auditLogs` entries with kind='watchdog_devmode_check', and alert history.
 *
 * Bottom section: legacy `watchdog_runs` history (kept intact).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  auth, db, collection, getDocs, getDoc, query, orderBy, where, limit as fbLimit, doc, onSnapshot,
} from '@/lib/firebase';
import { getDevModeStatus, setDevMode } from '@/lib/cloudflare-devmode.functions';
import { triggerWatchdogRun } from '@/lib/watchdog-admin.functions';
import {
  Bot, Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, Play,
  ChevronDown, ChevronRight, Cloud, ShieldAlert, Send, Power,
} from 'lucide-react';

interface Check { name: string; ok: boolean; detail: string; durationMs: number }
interface Heal { name: string; ok: boolean; detail: string }
interface Run {
  id: string;
  startedAt?: string; finishedAt?: string;
  status?: 'healthy' | 'degraded' | 'critical';
  totalChecks?: number; failed?: number; brokenImages?: number;
  checks?: Check[]; heals?: Heal[]; createdAt?: string;
}

interface DevmodeSession {
  sessionStartedAt?: string | null;
  alertSentAt?: string | null;
  escalationSentAt?: string | null;
  turnedOffAt?: string | null;
  lastCheckAt?: string | null;
}

interface AuditCheck {
  id: string;
  at?: string;
  ok?: boolean;
  value?: 'on' | 'off';
  modifiedOn?: string | null;
  detail?: string;
  alertSent?: boolean;
}

const TELEGRAM_BOT = '@Phweb_bot';
const TELEGRAM_CHAT_ID = '7971499178';

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB');
}
function relative(iso?: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}
function elapsed(startIso?: string | null, nowMs = Date.now()): string {
  if (!startIso) return '—';
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return '—';
  const diffSec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
}

export default function WatchdogTab() {
  // ── Cloudflare Dev Mode live status ────────────────────────────────
  const [cfLoading, setCfLoading] = useState(true);
  const [cfErr, setCfErr] = useState('');
  const [cfOn, setCfOn] = useState(false);
  const [cfRemaining, setCfRemaining] = useState(0);
  const [cfModifiedOn, setCfModifiedOn] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const [now, setNow] = useState(Date.now());

  // ── Firestore subscriptions ────────────────────────────────────────
  const [session, setSession] = useState<DevmodeSession | null>(null);
  const [audits, setAudits] = useState<AuditCheck[]>([]);
  const [auditsLoading, setAuditsLoading] = useState(true);
  const [auditsErr, setAuditsErr] = useState('');

  // ── Legacy watchdog_runs ───────────────────────────────────────────
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsErr, setRunsErr] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Tick every second for the live elapsed counter
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refreshCloudflare = useCallback(async () => {
    setCfErr('');
    try {
      const u = auth.currentUser;
      if (!u) { setCfLoading(false); return; }
      const idToken = await u.getIdToken();
      const r = await getDevModeStatus({ data: { idToken } });
      setCfOn(r.value === 'on');
      setCfRemaining(r.timeRemainingSec);
      setCfModifiedOn(r.modifiedOn ?? null);
    } catch (e) {
      setCfErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCfLoading(false);
    }
  }, []);

  // Poll CF status every 30s
  useEffect(() => {
    refreshCloudflare();
    const id = setInterval(refreshCloudflare, 30_000);
    return () => clearInterval(id);
  }, [refreshCloudflare]);

  // Live subscribe to current devmode session doc
  useEffect(() => {
    try {
      const ref = doc(db, 'watchdog', 'devmode_alerts');
      const unsub = onSnapshot(
        ref,
        (snap) => setSession((snap.exists() ? (snap.data() as DevmodeSession) : {})),
        (err) => setCfErr(err.message),
      );
      return () => unsub();
    } catch (e) {
      // Fallback: one-shot read
      (async () => {
        try {
          const snap = await getDoc(doc(db, 'watchdog', 'devmode_alerts'));
          setSession(snap.exists() ? (snap.data() as DevmodeSession) : {});
        } catch (err: any) { setCfErr(err?.message || 'session read failed'); }
      })();
    }
  }, []);

  const loadAudits = useCallback(async () => {
    setAuditsLoading(true); setAuditsErr('');
    try {
      // No orderBy → avoids needing a composite index on (kind, at).
      // Fetch up to 200, sort client-side, slice to 50.
      const q = query(
        collection(db, 'auditLogs'),
        where('kind', '==', 'watchdog_devmode_check'),
        fbLimit(200),
      );
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AuditCheck[];
      rows.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      setAudits(rows.slice(0, 50));
    } catch (e: any) {
      setAuditsErr(e?.message || 'Failed to load audit history');
    } finally {
      setAuditsLoading(false);
    }
  }, []);
  useEffect(() => {
    loadAudits();
    const id = setInterval(loadAudits, 30_000);
    return () => clearInterval(id);
  }, [loadAudits]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true); setRunsErr('');
    try {
      const snap = await getDocs(query(
        collection(db, 'watchdog_runs'), orderBy('createdAt', 'desc'), fbLimit(30),
      ));
      setRuns(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e: any) {
      setRunsErr(e?.message || 'Failed to load runs');
    } finally { setRunsLoading(false); }
  }, []);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const turnOff = async () => {
    setTurningOff(true); setCfErr('');
    try {
      const u = auth.currentUser; if (!u) throw new Error('Not signed in');
      const idToken = await u.getIdToken();
      await setDevMode({ data: { idToken, value: 'off' } });
      await refreshCloudflare();
    } catch (e) {
      setCfErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTurningOff(false);
    }
  };

  const triggerRun = async () => {
    setRunning(true); setRunResult('');
    try {
      const res = await fetch('/api/public/hooks/watchdog', { method: 'POST', headers: { 'content-type': 'application/json' } });
      if (res.status === 401) setRunResult('Manual trigger needs the shared secret. The bot runs automatically every 5 min via cron — refresh below to see results.');
      else if (!res.ok) setRunResult(`Failed: ${res.status}`);
      else {
        const data = await res.json();
        setRunResult(`OK — status: ${data.status}, ${data.failed}/${data.totalChecks} failed`);
        await loadRuns();
      }
    } catch (e: any) { setRunResult(e?.message || 'Run failed'); }
    finally { setRunning(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────
  const sessionStart = cfOn ? (session?.sessionStartedAt || cfModifiedOn) : null;
  const sessionElapsed = elapsed(sessionStart, now);
  const elapsedMin = sessionStart
    ? Math.max(0, Math.floor((now - new Date(sessionStart).getTime()) / 60_000))
    : 0;
  const remainingFmt = useMemo(() => {
    const h = Math.floor(cfRemaining / 3600);
    const m = Math.floor((cfRemaining % 3600) / 60);
    return `${h}h ${m}m`;
  }, [cfRemaining]);

  const latestAlertAt = useMemo(() => {
    return session?.alertSentAt || null;
  }, [session]);

  // ── Render helpers ─────────────────────────────────────────────────
  const statusBadge = (s?: string) => {
    if (s === 'healthy') return <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Healthy</span>;
    if (s === 'degraded') return <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Degraded</span>;
    if (s === 'critical') return <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1"><XCircle className="w-3 h-3" />Critical</span>;
    return <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 text-[11px]">Unknown</span>;
  };
  const onOffBadge = (on: boolean) => on
    ? <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-bold uppercase">ON</span>
    : <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold uppercase">OFF</span>;
  const yesNoBadge = (v: boolean) => v
    ? <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold uppercase">Yes</span>
    : <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 text-[11px] uppercase">No</span>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            Watchdog / Auto-Heal
          </h2>
          <p className="text-[#9cb8d9] text-sm mt-1 max-w-2xl">
            Live Cloudflare Dev Mode monitoring + scheduled health checks every 5 minutes.
            Alerts are sent to Telegram <span className="font-mono text-emerald-300">{TELEGRAM_BOT}</span> when Dev Mode stays ON longer than 30 minutes.
          </p>
        </div>
      </div>

      {/* ── LIVE STATUS CARD ─────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-5 ${cfOn ? 'bg-red-500/10 border-red-500/50' : 'bg-emerald-500/5 border-emerald-500/30'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Cloud className={`w-8 h-8 flex-shrink-0 ${cfOn ? 'text-red-400' : 'text-emerald-400'}`} />
            <div className="min-w-0">
              {cfLoading ? (
                <div className="flex items-center gap-2 text-[#9cb8d9] text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading Cloudflare status…</div>
              ) : cfOn ? (
                <>
                  <div className="text-lg font-bold text-red-200 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-red-600/40 border border-red-400/60 text-white text-xs uppercase tracking-widest">Dev Mode ON</span>
                    <span className="font-mono text-white text-2xl">{sessionElapsed}</span>
                  </div>
                  <div className="text-red-300/90 text-sm mt-1">
                    Auto-expires in ~{remainingFmt}. <b>Blank page risk after expiry.</b>
                  </div>
                  {elapsedMin > 120 && (
                    <div className="mt-2 text-xs px-2 py-1 rounded-md bg-red-500/30 border border-red-400/40 text-red-100 inline-flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> ESCALATION alert sent to Telegram.
                    </div>
                  )}
                  {elapsedMin > 30 && elapsedMin <= 120 && (
                    <div className="mt-2 text-xs px-2 py-1 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-100 inline-flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> First alert sent to Telegram.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-emerald-200 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-600/30 border border-emerald-400/50 text-white text-xs uppercase tracking-widest">Dev Mode OFF</span>
                    <span className="text-emerald-300">Safe</span>
                  </div>
                  <div className="text-[#9cb8d9] text-sm mt-1">Cache active. No blank-page risk.</div>
                </>
              )}
              {cfErr && <div className="text-red-300 text-xs mt-2 font-mono">{cfErr}</div>}
            </div>
          </div>
          <div className="flex gap-2">
            {cfOn && (
              <button
                onClick={turnOff}
                disabled={turningOff}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {turningOff ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                Turn Off Now
              </button>
            )}
            <button
              onClick={refreshCloudflare}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-white text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── SESSION DETAILS + TELEGRAM ─────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-4 rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07]">
          <h3 className="text-sm font-bold text-[#9cb8d9] uppercase tracking-widest mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Current Session
          </h3>
          {cfOn ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.05]">
                <tr><td className="py-2 text-[#9cb8d9]">Session started</td><td className="py-2 text-white font-mono">{fmt(sessionStart)}</td></tr>
                <tr><td className="py-2 text-[#9cb8d9]">First alert sent</td><td className="py-2 text-white font-mono">{session?.alertSentAt ? fmt(session.alertSentAt) : <span className="text-slate-500">Not yet</span>}</td></tr>
                <tr><td className="py-2 text-[#9cb8d9]">Escalation sent</td><td className="py-2 text-white font-mono">{session?.escalationSentAt ? fmt(session.escalationSentAt) : <span className="text-slate-500">Not yet</span>}</td></tr>
                <tr><td className="py-2 text-[#9cb8d9]">Last check</td><td className="py-2 text-white font-mono">{fmt(session?.lastCheckAt)} <span className="text-[#9cb8d9] text-xs">({relative(session?.lastCheckAt)})</span></td></tr>
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-[#9cb8d9]">
              {session?.turnedOffAt
                ? <>No active session. Last session ended at <span className="font-mono text-white">{fmt(session.turnedOffAt)}</span>.</>
                : <>No history yet.</>}
            </div>
          )}
        </div>
        <div className="p-4 rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07]">
          <h3 className="text-sm font-bold text-[#9cb8d9] uppercase tracking-widest mb-3 flex items-center gap-2">
            <Send className="w-4 h-4" /> Telegram
          </h3>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between gap-2"><dt className="text-[#9cb8d9]">Bot</dt><dd className="text-white font-mono">{TELEGRAM_BOT}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#9cb8d9]">Alert chat</dt><dd className="text-white font-mono">{TELEGRAM_CHAT_ID}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#9cb8d9]">Last alert</dt><dd className="text-white font-mono text-right">{latestAlertAt ? fmt(latestAlertAt) : <span className="text-slate-500">Never</span>}</dd></div>
          </dl>
        </div>
      </div>

      {/* ── RECENT CHECKS (auditLogs) ─────────────────────────── */}
      <div className="rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
          <h3 className="text-sm font-bold text-[#9cb8d9] uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4" /> Recent Checks <span className="text-slate-500 normal-case">(last 50, auto-refresh 30s)</span>
          </h3>
          <button onClick={loadAudits} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        {auditsErr && <div className="px-4 py-3 text-red-300 text-sm bg-red-500/10">{auditsErr}</div>}
        {auditsLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-[#9cb8d9] text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : audits.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#9cb8d9] text-sm">No check history yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/40 text-[#9cb8d9] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Dev Mode</th>
                  <th className="px-3 py-2 text-left">CF Modified</th>
                  <th className="px-3 py-2 text-left">Alert</th>
                  <th className="px-3 py-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {audits.map((a) => (
                  <tr key={a.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-white font-mono text-xs whitespace-nowrap">{fmt(a.at)}</td>
                    <td className="px-3 py-2">{a.value ? onOffBadge(a.value === 'on') : <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2 text-[#9cb8d9] font-mono text-xs">{a.modifiedOn ? fmt(a.modifiedOn) : '—'}</td>
                    <td className="px-3 py-2">{yesNoBadge(!!a.alertSent)}</td>
                    <td className="px-3 py-2">
                      {a.ok
                        ? <span className="inline-flex items-center gap-1 text-emerald-300 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> {a.detail || 'ok'}</span>
                        : <span className="inline-flex items-center gap-1 text-red-300 text-xs"><XCircle className="w-3.5 h-3.5" /> {a.detail || 'error'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ALERT HISTORY ─────────────────────────────────────── */}
      <div className="rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <h3 className="text-sm font-bold text-[#9cb8d9] uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Alert History <span className="text-slate-500 normal-case">(current session — single doc)</span>
          </h3>
        </div>
        {!session || !session.sessionStartedAt ? (
          <div className="px-4 py-8 text-center text-[#9cb8d9] text-sm">No alert history.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/40 text-[#9cb8d9] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Session Started</th>
                  <th className="px-3 py-2 text-left">Turned Off At</th>
                  <th className="px-3 py-2 text-left">Duration</th>
                  <th className="px-3 py-2 text-left">Alert</th>
                  <th className="px-3 py-2 text-left">Escalation</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-white font-mono text-xs">{fmt(session.sessionStartedAt)}</td>
                  <td className="px-3 py-2 text-white font-mono text-xs">{session.turnedOffAt ? fmt(session.turnedOffAt) : <span className="text-amber-300">Active</span>}</td>
                  <td className="px-3 py-2 text-white font-mono text-xs">
                    {session.turnedOffAt
                      ? elapsed(session.sessionStartedAt, new Date(session.turnedOffAt).getTime())
                      : elapsed(session.sessionStartedAt, now)}
                  </td>
                  <td className="px-3 py-2">{yesNoBadge(!!session.alertSentAt)}</td>
                  <td className="px-3 py-2">{yesNoBadge(!!session.escalationSentAt)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── LEGACY WATCHDOG RUNS HISTORY ─────────────────────── */}
      <div className="pt-4 border-t border-white/[0.07]">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <h3 className="text-lg font-bold text-white">Watchdog Bot Runs</h3>
            <p className="text-[#9cb8d9] text-xs mt-1">Background bot — runs every 5 min, checks site reachability, sitemap, orders, Wallid, images.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={triggerRun} disabled={running} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run now
            </button>
            <button onClick={loadRuns} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>
        {runResult && <div className="px-4 py-2 mb-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm">{runResult}</div>}
        {runsErr && <div className="px-4 py-3 mb-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{runsErr}</div>}

        {runsLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-[#9cb8d9] text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading runs…</div>
        ) : runs.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#0b1a30]/60 border border-white/[0.07] text-center text-[#9cb8d9] text-sm">No watchdog runs yet.</div>
        ) : (
          <div className="space-y-2">
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
    </div>
  );
}
