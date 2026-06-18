import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { ShoppingCart, AlertCircle, RefreshCw, Search, AlertTriangle, Database } from 'lucide-react';

interface CartEvent {
  id: string;
  type: string;
  memoryCount?: number | null;
  storedCount?: number | null;
  source?: string | null;
  code?: string | null;
  message?: string | null;
  key?: string | null;
  userAgent?: string | null;
  extra?: string | null;
  createdAt?: Timestamp;
}

const TYPE_META: Record<string, { label: string; color: string; Icon: any }> = {
  storage_write_failure:     { label: 'Write FAILED',       color: 'red',     Icon: AlertCircle },
  storage_read_failure:      { label: 'Read FAILED',        color: 'red',     Icon: AlertCircle },
  storage_quota_exceeded:    { label: 'Quota exceeded',     color: 'red',     Icon: Database },
  add_to_cart_failure:       { label: 'Add to cart FAILED', color: 'red',     Icon: AlertCircle },
  state_mismatch:            { label: 'State mismatch',     color: 'amber',   Icon: AlertTriangle },
  hydration_drift:           { label: 'Hydration drift',    color: 'amber',   Icon: AlertTriangle },
  cart_cleared_unexpectedly: { label: 'Unexpected clear',   color: 'amber',   Icon: AlertTriangle },
  unknown_error:             { label: 'Unknown error',      color: 'red',     Icon: AlertCircle },
};

const COLOR_CLASS: Record<string, string> = {
  red:   'bg-red-500/10 text-red-300 border-red-500/30',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  slate: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
};

export default function CartEventsTab() {
  const [events, setEvents] = useState<CartEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'write' | 'drift'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'cart_events'), orderBy('createdAt', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const list: CartEvent[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
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
      if (filterType === 'write' && !/write|quota|add_to_cart|read/.test(e.type)) return false;
      if (filterType === 'drift' && !/drift|mismatch|cleared/.test(e.type)) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const hay = `${e.code || ''} ${e.message || ''} ${e.source || ''} ${e.key || ''} ${e.type}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [events, filterType, search]);

  const counts = useMemo(() => {
    let writes = 0, drift = 0;
    for (const e of events) {
      if (/drift|mismatch|cleared/.test(e.type)) drift++;
      else writes++;
    }
    return { writes, drift, total: events.length };
  }, [events]);

  const topCodes = useMemo(() => {
    const cs: Record<string, number> = {};
    for (const e of events) if (e.code) cs[e.code] = (cs[e.code] || 0) + 1;
    return Object.entries(cs).sort((a,b) => b[1] - a[1]).slice(0, 6);
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-emerald-400" /> Cart Events
          </h1>
          <p className="text-[#9cb8d9] text-sm mt-1">
            Telemetry for cart &amp; checkout: localStorage write failures, state drift between header and checkout, quota issues. Last 500 events.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-[#9cb8d9] text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Reload
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl p-4">
          <p className="text-[#3a5a82] text-xs font-medium uppercase tracking-wider">Total</p>
          <p className="text-2xl font-bold text-white mt-1">{counts.total}</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-400/70 text-xs font-medium uppercase tracking-wider">Storage failures</p>
          <p className="text-2xl font-bold text-red-300 mt-1">{counts.writes}</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-amber-400/70 text-xs font-medium uppercase tracking-wider">State drift</p>
          <p className="text-2xl font-bold text-amber-300 mt-1">{counts.drift}</p>
        </div>
      </div>

      {topCodes.length > 0 && (
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl p-4">
          <p className="text-white font-semibold mb-3 text-sm">Top error codes</p>
          <div className="flex flex-wrap gap-2">
            {topCodes.map(([code, count]) => (
              <button
                key={code}
                onClick={() => setSearch(code)}
                className="px-2.5 py-1 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-xs font-mono hover:bg-red-500/20 transition-colors"
              >
                {code} <span className="opacity-60">({count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-[#04101f]/70 border border-white/[0.08] rounded-lg overflow-hidden">
          {(['all', 'write', 'drift'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterType === t ? 'bg-emerald-500/20 text-emerald-300' : 'text-[#9cb8d9] hover:bg-white/[0.04]'}`}
            >
              {t === 'all' ? 'All' : t === 'write' ? 'Storage' : 'Drift'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by code, message, route…"
            className="w-full pl-9 pr-3 py-1.5 bg-[#04101f]/70 border border-white/[0.08] rounded-lg text-white text-sm placeholder-[#3a5a82] focus:outline-none focus:border-emerald-500/40"
          />
        </div>
        <span className="text-xs text-[#3a5a82]">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">
          Failed to load events: <span className="font-mono">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[#9cb8d9]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl p-12 text-center">
          <p className="text-[#9cb8d9]">No cart events recorded — that's a good thing.</p>
        </div>
      ) : (
        <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Time</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Event</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Counts</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Code</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Message</th>
                  <th className="text-left text-[#3a5a82] font-semibold text-xs uppercase tracking-wider px-4 py-2.5">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const meta = TYPE_META[e.type] || { label: e.type, color: 'slate', Icon: AlertCircle };
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
                      <td className="px-4 py-2.5 text-xs font-mono">
                        <span className="text-emerald-300">{e.memoryCount ?? '—'}</span>
                        <span className="text-[#3a5a82] mx-1">/</span>
                        <span className="text-blue-300">{e.storedCount ?? '—'}</span>
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
          <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-[#3a5a82]">
            Counts column = <span className="text-emerald-300">memory</span> / <span className="text-blue-300">stored</span>
          </div>
        </div>
      )}
    </div>
  );
}
