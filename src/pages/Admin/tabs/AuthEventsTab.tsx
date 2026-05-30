import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { Activity, AlertCircle, CheckCircle2, LogIn, LogOut, UserPlus, KeyRound, RefreshCw, Search } from 'lucide-react';

interface AuthEvent {
  id: string;
  type: string;
  email?: string | null;
  uid?: string | null;
  code?: string | null;
  message?: string | null;
  source?: string | null;
  userAgent?: string | null;
  createdAt?: Timestamp;
}

const TYPE_META: Record<string, { label: string; color: string; Icon: any }> = {
  login_success:           { label: 'Login OK',         color: 'emerald', Icon: LogIn },
  login_failure:           { label: 'Login FAILED',     color: 'red',     Icon: AlertCircle },
  register_success:        { label: 'Register OK',      color: 'emerald', Icon: UserPlus },
  register_failure:        { label: 'Register FAILED',  color: 'red',     Icon: AlertCircle },
  google_success:          { label: 'Google OK',        color: 'emerald', Icon: LogIn },
  google_failure:          { label: 'Google FAILED',    color: 'red',     Icon: AlertCircle },
  password_reset_request:  { label: 'Reset request',    color: 'blue',    Icon: KeyRound },
  password_reset_failure:  { label: 'Reset FAILED',     color: 'red',     Icon: AlertCircle },
  logout:                  { label: 'Logout',           color: 'slate',   Icon: LogOut },
  auth_state_signed_in:    { label: 'Session start',    color: 'slate',   Icon: CheckCircle2 },
  auth_state_signed_out:   { label: 'Session end',      color: 'slate',   Icon: LogOut },
};

const COLOR_CLASS: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  red:     'bg-red-500/10 text-red-300 border-red-500/30',
  blue:    'bg-blue-500/10 text-blue-300 border-blue-500/30',
  slate:   'bg-slate-500/10 text-slate-300 border-slate-500/30',
};

export default function AuthEventsTab() {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'failure' | 'success'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'auth_events'), orderBy('createdAt', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const list: AuthEvent[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setEvents(list);
      setLoading(false);
      setError(null);
    }, (err) => {
      setError(err?.code || err?.message || 'Failed to load events');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterType === 'failure' && !e.type.endsWith('_failure')) return false;
      if (filterType === 'success' && !e.type.endsWith('_success')) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const hay = `${e.email || ''} ${e.uid || ''} ${e.code || ''} ${e.type}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [events, filterType, search]);

  const counts = useMemo(() => {
    let success = 0, failure = 0;
    for (const e of events) {
      if (e.type.endsWith('_success')) success++;
      else if (e.type.endsWith('_failure')) failure++;
    }
    return { success, failure, total: events.length };
  }, [events]);

  // Top error codes (last 500 events)
  const topCodes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) if (e.type.endsWith('_failure') && e.code) counts[e.code] = (counts[e.code] || 0) + 1;
    return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 6);
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-blue-400" /> Auth Events
          </h1>
          <p className="text-[#9cb8d9] text-sm mt-1">
            Real-time log of every login, register, Google SSO, password reset and logout — success and failure. Last 500 events.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-[#9cb8d9] text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Reload
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl p-4">
          <p className="text-[#3a5a82] text-xs font-medium uppercase tracking-wider">Total</p>
          <p className="text-2xl font-bold text-white mt-1">{counts.total}</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-emerald-400/70 text-xs font-medium uppercase tracking-wider">Successful</p>
          <p className="text-2xl font-bold text-emerald-300 mt-1">{counts.success}</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-400/70 text-xs font-medium uppercase tracking-wider">Failed</p>
          <p className="text-2xl font-bold text-red-300 mt-1">{counts.failure}</p>
        </div>
      </div>

      {/* Top error codes */}
      {topCodes.length > 0 && (
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl p-4">
          <p className="text-white font-semibold mb-3 text-sm">Top error codes</p>
          <div className="flex flex-wrap gap-2">
            {topCodes.map(([code, count]) => (
              <button
                key={code}
                onClick={() => { setSearch(code); setFilterType('failure'); }}
                className="px-2.5 py-1 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-xs font-mono hover:bg-red-500/20 transition-colors"
              >
                {code} <span className="opacity-60">({count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-[#04101f]/70 border border-white/[0.08] rounded-lg overflow-hidden">
          {(['all', 'failure', 'success'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterType === t ? 'bg-blue-500/20 text-blue-300' : 'text-[#9cb8d9] hover:bg-white/[0.04]'}`}
            >
              {t === 'all' ? 'All' : t === 'failure' ? 'Failures' : 'Successes'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by email, uid, error code…"
            className="w-full pl-9 pr-3 py-1.5 bg-[#04101f]/70 border border-white/[0.08] rounded-lg text-white text-sm placeholder-[#3a5a82] focus:outline-none focus:border-blue-500/40"
          />
        </div>
        <span className="text-xs text-[#3a5a82]">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
      </div>

      {/* Events list */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">
          Failed to load events: <span className="font-mono">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[#9cb8d9]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl p-12 text-center">
          <p className="text-[#9cb8d9]">No events match your filters.</p>
        </div>
      ) : (
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Time</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Event</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Email / UID</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Code</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Message</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const meta = TYPE_META[e.type] || { label: e.type, color: 'slate', Icon: Activity };
                  const Icon = meta.Icon;
                  const ts = e.createdAt instanceof Timestamp ? e.createdAt.toDate() : null;
                  return (
                    <tr key={e.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-[#9cb8d9] text-xs whitespace-nowrap">
                        {ts ? ts.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-md text-xs font-medium ${COLOR_CLASS[meta.color]}`}>
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-white text-xs">
                        {e.email ? <div className="font-medium">{e.email}</div> : <span className="text-[#3a5a82]">—</span>}
                        {e.uid && <div className="text-[#3a5a82] font-mono text-[10px]">{e.uid.slice(0, 12)}…</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        {e.code ? <span className="font-mono text-xs text-red-300">{e.code}</span> : <span className="text-[#3a5a82]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#9cb8d9] text-xs max-w-[300px] truncate" title={e.message ?? ''}>
                        {e.message || <span className="text-[#3a5a82]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#3a5a82] text-xs font-mono">{e.source || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
