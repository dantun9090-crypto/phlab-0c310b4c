import { useEffect, useMemo, useState } from 'react';
import { Activity, Filter, RefreshCw, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';

interface EventDoc {
  id: string;
  type: string;
  message?: string | null;
  route?: string | null;
  userAgent?: string | null;
  uid?: string | null;
  createdAt?: Timestamp | null;
}

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'login_lockout', label: 'Lockouts' },
  { id: 'admin_login_failure', label: 'Admin login failed' },
  { id: 'admin_login_blocked', label: 'Admin blocked' },
  { id: 'admin_idle_logout', label: 'Idle logout' },
  { id: 'password_changed', label: 'Password change' },
  { id: 'compliance_violation', label: 'Compliance' },
  { id: 'error_boundary', label: 'Errors' },
];

const TYPE_BADGE: Record<string, string> = {
  login_lockout: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  admin_login_failure: 'bg-red-500/10 text-red-300 border-red-500/30',
  admin_login_blocked: 'bg-red-500/10 text-red-300 border-red-500/30',
  admin_idle_logout: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  password_changed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  compliance_violation: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  error_boundary: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

export default function SecurityEventsTab() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'securityEvents'),
        orderBy('createdAt', 'desc'),
        limit(50),
      );
      const snap = await getDocs(q);
      setEvents(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventDoc, 'id'>) })),
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to load security events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (activeFilter === 'all' ? events : events.filter((e) => e.type === activeFilter)),
    [events, activeFilter],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" />
            Security Events
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Last 50 entries from <code className="text-slate-300">securityEvents</code> (lockouts, admin failures, idle logouts, compliance blocks).
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border-2 border-slate-600 hover:bg-slate-700 text-white text-sm min-h-[48px]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-slate-400">
          <Filter className="w-3 h-3" /> Filter
        </span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold ${
              activeFilter === f.id
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border-2 border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Route</th>
              <th className="px-4 py-2 text-left">UID</th>
              <th className="px-4 py-2 text-left">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No events for this filter.
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-2 text-slate-400 whitespace-nowrap">
                  {e.createdAt?.toDate?.().toLocaleString() ?? '—'}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-[11px] uppercase tracking-wider ${
                      TYPE_BADGE[e.type] ?? 'bg-slate-700/40 text-slate-300 border-slate-600'
                    }`}
                  >
                    {e.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-300 font-mono text-xs max-w-[200px] truncate">
                  {e.route ?? '—'}
                </td>
                <td className="px-4 py-2 text-slate-400 font-mono text-xs">
                  {e.uid ? e.uid.slice(0, 10) + '…' : '—'}
                </td>
                <td className="px-4 py-2 text-slate-300 text-xs max-w-[420px] truncate">
                  {e.message ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
