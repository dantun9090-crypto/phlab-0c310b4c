import { useEffect, useMemo, useState } from 'react';
import {
  ScrollText, Search, Copy, Check, RefreshCw, Filter, BellOff, CheckCircle2, XCircle, ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  db, collection, query, orderBy, limit as fbLimit, onSnapshot,
} from '@/lib/firebase';

type OutcomeFilter = 'all' | 'delivered' | 'suppressed' | 'suppressed:pref-off' | 'suppressed:quiet-hours' | 'suppressed:dedup' | 'suppressed:bot';
type KindFilter = 'all' | 'signup' | 'visitor';
type QuietFilter = 'any' | 'on' | 'off';
type BotFilter = 'any' | 'only' | 'exclude' | 'force-hide-badge';

interface AuditRow {
  id: string;
  kind: string;
  outcome: string;
  title?: string;
  description?: string;
  targetId?: string;
  adminUid?: string | null;
  adminEmail?: string | null;
  timestamp: Date;
  tzLocal?: string | null;
  botReasons?: string[];
  prefsSnapshot?: {
    notifySignups?: boolean;
    notifyFirstSeen?: boolean;
    quietEnabled?: boolean;
    quietStart?: string;
    quietEnd?: string;
    quietTimezone?: string;
    hideBots?: boolean;
    treatForceHideBadgeAsBot?: boolean;
  };
}

const PAGE_SIZES = [50, 100, 250, 500];
const LS_KEY = 'phl_toastaudit_prefs_v2';

interface Prefs {
  outcome: OutcomeFilter;
  kind: KindFilter;
  quiet: QuietFilter;
  bot: BotFilter;
  search: string;
  pageSize: number;
  fetchLimit: number;
}
const DEFAULT_PREFS: Prefs = {
  outcome: 'all',
  kind: 'all',
  quiet: 'any',
  bot: 'any',
  search: '',
  pageSize: 100,
  fetchLimit: 500,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return DEFAULT_PREFS; }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          toast.success(`${label || 'Value'} copied`);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="p-1 rounded hover:bg-slate-700/60 text-[#9cb8d9] hover:text-white"
      title={`Copy ${label || 'value'}`}
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function outcomeColor(o: string): string {
  if (o === 'delivered') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (o === 'suppressed:quiet-hours') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  if (o === 'suppressed:dedup') return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
  if (o === 'suppressed:pref-off') return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  if (o === 'suppressed:bot') return 'text-rose-300 bg-rose-500/10 border-rose-500/30';
  return 'text-slate-300 bg-slate-700/40 border-slate-600';
}

export default function ToastAuditTab() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs(prev => { const next = { ...prev, ...patch }; savePrefs(next); return next; });

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'toastAuditLogs'), orderBy('timestamp', 'desc'), fbLimit(prefs.fetchLimit));
    const unsub = onSnapshot(q,
      (snap) => {
        const arr: AuditRow[] = snap.docs.map(d => {
          const data: any = d.data();
          return {
            id: d.id,
            kind: data.kind,
            outcome: data.outcome,
            title: data.title,
            description: data.description,
            targetId: data.targetId,
            adminUid: data.adminUid ?? null,
            adminEmail: data.adminEmail ?? null,
            timestamp: data.timestamp?.toDate?.() || new Date(),
            tzLocal: data.tzLocal ?? null,
            botReasons: Array.isArray(data.botReasons) ? data.botReasons : undefined,
            prefsSnapshot: data.prefsSnapshot,
          };
        });
        setRows(arr);
        setLoading(false);
        setErr(null);
      },
      (e) => {
        console.error('ToastAudit snapshot error', e);
        setErr(e?.message || 'Failed to load audit log');
        setLoading(false);
      });
    return () => unsub();
  }, [prefs.fetchLimit]);

  const filtered = useMemo(() => {
    const q = prefs.search.trim().toLowerCase();
    return rows.filter(r => {
      if (prefs.kind !== 'all' && r.kind !== prefs.kind) return false;
      if (prefs.outcome === 'suppressed') {
        if (!r.outcome.startsWith('suppressed')) return false;
      } else if (prefs.outcome !== 'all' && r.outcome !== prefs.outcome) return false;
      if (prefs.quiet !== 'any') {
        const on = !!r.prefsSnapshot?.quietEnabled;
        if (prefs.quiet === 'on' && !on) return false;
        if (prefs.quiet === 'off' && on) return false;
      }
      if (prefs.bot !== 'any') {
        const isBot = r.outcome === 'suppressed:bot';
        if (prefs.bot === 'only' && !isBot) return false;
        if (prefs.bot === 'exclude' && isBot) return false;
        if (prefs.bot === 'force-hide-badge' && !(r.botReasons?.includes('force-hide-badge'))) return false;
      }
      if (q) {
        const hay = `${r.title || ''} ${r.description || ''} ${r.targetId || ''} ${r.adminUid || ''} ${r.adminEmail || ''} ${(r.botReasons || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, prefs]);

  const visible = filtered.slice(0, prefs.pageSize);
  const counts = useMemo(() => {
    const c = { delivered: 0, quiet: 0, dedup: 0, prefOff: 0, bot: 0, forceHideBadge: 0 };
    for (const r of filtered) {
      if (r.outcome === 'delivered') c.delivered++;
      else if (r.outcome === 'suppressed:quiet-hours') c.quiet++;
      else if (r.outcome === 'suppressed:dedup') c.dedup++;
      else if (r.outcome === 'suppressed:pref-off') c.prefOff++;
      else if (r.outcome === 'suppressed:bot') {
        c.bot++;
        if (r.botReasons?.includes('force-hide-badge')) c.forceHideBadge++;
      }
    }
    return c;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-emerald-400" /> Toast Audit
          </h2>
          <p className="text-[#9cb8d9] text-sm mt-1">
            Recent Live Activity toast attempts — delivered vs suppressed (pref-off, quiet hours, dedup).
          </p>
        </div>
        <button
          onClick={() => updatePrefs({ fetchLimit: prefs.fetchLimit })}
          className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-[#9cb8d9] hover:text-white"
          title="Re-subscribe"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4" /> Delivered
          </div>
          <div className="text-white text-2xl font-bold mt-1">{counts.delivered}</div>
        </div>
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs uppercase tracking-wider">
            <BellOff className="w-4 h-4" /> Quiet hrs
          </div>
          <div className="text-white text-2xl font-bold mt-1">{counts.quiet}</div>
        </div>
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 text-blue-400 text-xs uppercase tracking-wider">
            <XCircle className="w-4 h-4" /> Dedup
          </div>
          <div className="text-white text-2xl font-bold mt-1">{counts.dedup}</div>
        </div>
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider">
            <XCircle className="w-4 h-4" /> Pref off
          </div>
          <div className="text-white text-2xl font-bold mt-1">{counts.prefOff}</div>
        </div>
        <button
          type="button"
          onClick={() => updatePrefs({ bot: prefs.bot === 'only' ? 'any' : 'only' })}
          className={`bg-slate-900 border-2 rounded-lg p-3 text-left transition-colors ${
            prefs.bot === 'only' ? 'border-rose-500/60' : 'border-slate-700 hover:border-rose-500/30'
          }`}
          title="Click to toggle: show only bot-suppressed entries"
        >
          <div className="flex items-center gap-2 text-rose-300 text-xs uppercase tracking-wider">
            <ShieldOff className="w-4 h-4" /> Hidden bots
          </div>
          <div className="text-white text-2xl font-bold mt-1">{counts.bot}</div>
        </button>
        <button
          type="button"
          onClick={() => updatePrefs({ bot: prefs.bot === 'force-hide-badge' ? 'any' : 'force-hide-badge' })}
          className={`bg-slate-900 border-2 rounded-lg p-3 text-left transition-colors ${
            prefs.bot === 'force-hide-badge' ? 'border-amber-500/60' : 'border-slate-700 hover:border-amber-500/30'
          }`}
          title="Click to toggle: show only forceHideBadge=true suppressions"
        >
          <div className="flex items-center gap-2 text-amber-300 text-xs uppercase tracking-wider">
            <ShieldOff className="w-4 h-4" /> forceHideBadge
          </div>
          <div className="text-white text-2xl font-bold mt-1">{counts.forceHideBadge}</div>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-[#9cb8d9]" />
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-[#9cb8d9] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={prefs.search}
            onChange={e => updatePrefs({ search: e.target.value })}
            placeholder="Search title, description, targetId, adminEmail, botReason…"
            className="w-full pl-8 pr-2 py-2 bg-slate-800 border-2 border-slate-600 text-white text-sm rounded-lg min-h-[40px]"
          />
        </div>
        <select
          value={prefs.outcome}
          onChange={e => updatePrefs({ outcome: e.target.value as OutcomeFilter })}
          className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
        >
          <option value="all">All outcomes</option>
          <option value="delivered">Delivered</option>
          <option value="suppressed">All suppressed</option>
          <option value="suppressed:quiet-hours">— quiet hours</option>
          <option value="suppressed:dedup">— dedup</option>
          <option value="suppressed:pref-off">— pref off</option>
          <option value="suppressed:bot">— bot (humans-only / forceHideBadge)</option>
        </select>
        <select
          value={prefs.kind}
          onChange={e => updatePrefs({ kind: e.target.value as KindFilter })}
          className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
        >
          <option value="all">All kinds</option>
          <option value="signup">Signup</option>
          <option value="visitor">Visitor</option>
        </select>
        <select
          value={prefs.quiet}
          onChange={e => updatePrefs({ quiet: e.target.value as QuietFilter })}
          className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
        >
          <option value="any">Quiet: any</option>
          <option value="on">Quiet: enabled</option>
          <option value="off">Quiet: disabled</option>
        </select>
        <select
          value={prefs.bot}
          onChange={e => updatePrefs({ bot: e.target.value as BotFilter })}
          className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
          title="Filter by bot suppression — entries blocked by Humans only or forceHideBadge=true"
        >
          <option value="any">Hidden bots: any</option>
          <option value="only">Hidden bots: only</option>
          <option value="exclude">Hidden bots: exclude</option>
          <option value="force-hide-badge">Only forceHideBadge=true</option>
        </select>
        <select
          value={prefs.pageSize}
          onChange={e => updatePrefs({ pageSize: Number(e.target.value) })}
          className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
        >
          {PAGE_SIZES.map(n => <option key={n} value={n}>{n}/view</option>)}
        </select>
        <select
          value={prefs.fetchLimit}
          onChange={e => updatePrefs({ fetchLimit: Number(e.target.value) })}
          className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
          title="Max rows fetched from Firestore"
        >
          {[200, 500, 1000, 2000].map(n => <option key={n} value={n}>Fetch {n}</option>)}
        </select>
      </div>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{err}</div>
      )}

      <div className="bg-slate-900 border-2 border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
          <h3 className="text-white font-semibold">Events</h3>
          <span className="ml-auto text-xs text-[#9cb8d9]">
            Showing {visible.length} of {filtered.length} (fetched {rows.length})
          </span>
        </div>
        <div className="divide-y divide-slate-800 max-h-[700px] overflow-y-auto">
          {visible.length === 0 && !loading && (
            <div className="p-6 text-center text-[#9cb8d9] text-sm">No matching audit entries.</div>
          )}
          {visible.map(r => {
            const tz = r.prefsSnapshot?.quietTimezone || r.tzLocal || Intl.DateTimeFormat().resolvedOptions().timeZone;
            let ts: string;
            try { ts = r.timestamp.toLocaleString('en-GB', { hour12: false, timeZone: tz }); }
            catch { ts = r.timestamp.toLocaleString('en-GB', { hour12: false }); }
            return (
              <div key={r.id} className="p-3 hover:bg-slate-800/40">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${outcomeColor(r.outcome)}`}>
                        {r.outcome}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-[#9cb8d9] bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
                        {r.kind}
                      </span>
                      {r.prefsSnapshot?.quietEnabled && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5 flex items-center gap-1">
                          <BellOff className="w-3 h-3" /> quiet {r.prefsSnapshot.quietStart}–{r.prefsSnapshot.quietEnd}
                        </span>
                      )}
                    </div>
                    <div className="text-white text-sm mt-1 truncate">{r.title || '—'}</div>
                    {r.description && (
                      <div className="text-[#9cb8d9] text-xs mt-0.5 truncate">{r.description}</div>
                    )}
                    <div className="text-[#3a5a82] text-[10px] mt-1 font-mono flex items-center gap-2 flex-wrap">
                      {r.targetId && (
                        <span className="flex items-center gap-1">
                          target: {r.targetId.slice(0, 16)}…
                          <CopyBtn value={r.targetId} label="targetId" />
                        </span>
                      )}
                      {r.adminEmail && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-700">·</span>
                          admin: {r.adminEmail}
                        </span>
                      )}
                      {r.adminUid && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-700">·</span>
                          uid: {r.adminUid.slice(0, 10)}…
                          <CopyBtn value={r.adminUid} label="UID" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-[10px] text-[#3a5a82] font-mono" title={r.timestamp.toISOString()}>
                    {ts}
                    <div className="text-slate-600">({tz})</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
