import { useEffect, useMemo, useState } from 'react';
import { Users, Eye, Clock, Activity, RefreshCw } from 'lucide-react';
import { db, collection, query, where, getDocs, Timestamp, orderBy, limit } from '@/lib/firebase';

type VisitorEvent = {
  id: string;
  type: 'pageview' | 'heartbeat';
  sessionId: string;
  path?: string;
  userAgent?: string;
  referrer?: string;
  createdAt?: { toMillis?: () => number };
};

type Bucket = { label: string; days: number };
const BUCKETS: Bucket[] = [
  { label: '24h', days: 1 },
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
];

function fmtDuration(ms: number): string {
  if (!ms || ms < 0) return '0s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('en-GB');
}

export default function VisitorsTab() {
  const [days, setDays] = useState(7);
  const [events, setEvents] = useState<VisitorEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);
        const q = query(
          collection(db, 'visitor_events'),
          where('createdAt', '>=', since),
          orderBy('createdAt', 'desc'),
          limit(10_000),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setEvents(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<VisitorEvent, 'id'>) })));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days, refreshKey]);

  const stats = useMemo(() => {
    const sessions = new Map<string, { min: number; max: number; pageviews: number; lastPath?: string; ua?: string }>();
    let totalPageviews = 0;
    const activeCutoff = Date.now() - 2 * 60_000;
    let activeNow = 0;

    for (const ev of events) {
      const ts = ev.createdAt?.toMillis?.() ?? 0;
      if (!ts) continue;
      const sid = ev.sessionId;
      const s = sessions.get(sid) ?? { min: ts, max: ts, pageviews: 0, lastPath: ev.path, ua: ev.userAgent };
      s.min = Math.min(s.min, ts);
      s.max = Math.max(s.max, ts);
      if (ev.type === 'pageview') { s.pageviews += 1; totalPageviews += 1; }
      sessions.set(sid, s);
    }
    let totalDuration = 0;
    const sessionList: Array<{ sid: string; start: number; end: number; durationMs: number; pageviews: number; lastPath?: string; ua?: string }> = [];
    for (const [sid, s] of sessions) {
      const durationMs = s.max - s.min;
      totalDuration += durationMs;
      if (s.max >= activeCutoff) activeNow += 1;
      sessionList.push({ sid, start: s.min, end: s.max, durationMs, pageviews: s.pageviews, lastPath: s.lastPath, ua: s.ua });
    }
    sessionList.sort((a, b) => b.end - a.end);
    const avgDuration = sessions.size ? totalDuration / sessions.size : 0;

    // Top pages
    const pageCounts = new Map<string, number>();
    for (const ev of events) {
      if (ev.type !== 'pageview') continue;
      const p = ev.path || '/';
      pageCounts.set(p, (pageCounts.get(p) ?? 0) + 1);
    }
    const topPages = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

    return { uniqueVisitors: sessions.size, totalPageviews, avgDuration, activeNow, sessionList, topPages };
  }, [events]);

  const StatCard = ({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent: string }) => (
    <div className={`rounded-lg border-2 border-slate-700 bg-slate-800 p-4 flex items-center gap-3`}>
      <div className={`p-2 rounded-md bg-gradient-to-br ${accent} text-white`}><Icon size={20} /></div>
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold text-white">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Visitors</h2>
          <p className="text-sm text-slate-400">First-party analytics — anonymous, sampled from real traffic.</p>
        </div>
        <div className="flex items-center gap-2">
          {BUCKETS.map(b => (
            <button
              key={b.label}
              onClick={() => setDays(b.days)}
              className={`px-3 min-h-[40px] rounded-lg border-2 text-sm font-medium ${days === b.days ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'}`}
            >Last {b.label}</button>
          ))}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="px-3 min-h-[40px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white hover:bg-slate-700 inline-flex items-center gap-2"
          ><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border-2 border-red-700 bg-red-950 p-4 text-red-200 text-sm">{err}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Unique visitors" value={loading ? '…' : stats.uniqueVisitors.toLocaleString()} accent="from-indigo-500 to-indigo-600" />
        <StatCard icon={Eye}   label="Page views"      value={loading ? '…' : stats.totalPageviews.toLocaleString()} accent="from-cyan-500 to-cyan-600" />
        <StatCard icon={Clock} label="Avg. session"    value={loading ? '…' : fmtDuration(stats.avgDuration)} accent="from-emerald-500 to-emerald-600" />
        <StatCard icon={Activity} label="Active now"   value={loading ? '…' : stats.activeNow.toLocaleString()} accent="from-amber-500 to-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
          <h3 className="text-white font-semibold mb-3">Top pages</h3>
          {stats.topPages.length === 0 ? (
            <div className="text-slate-400 text-sm">No data yet for this window.</div>
          ) : (
            <ul className="space-y-1">
              {stats.topPages.map(([path, count]) => (
                <li key={path} className="flex items-center justify-between text-sm py-1 border-b border-slate-800 last:border-0">
                  <span className="text-slate-200 truncate mr-3" title={path}>{path}</span>
                  <span className="text-slate-400 tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
          <h3 className="text-white font-semibold mb-3">Recent sessions</h3>
          <div className="max-h-[420px] overflow-auto">
            {stats.sessionList.length === 0 ? (
              <div className="text-slate-400 text-sm">No sessions in this window.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-400 uppercase">
                  <tr><th className="py-1">Last seen</th><th>Duration</th><th>Views</th><th>Last path</th></tr>
                </thead>
                <tbody>
                  {stats.sessionList.slice(0, 50).map(s => (
                    <tr key={s.sid} className="border-t border-slate-800">
                      <td className="py-1 text-slate-200 whitespace-nowrap pr-3">{fmtDate(s.end)}</td>
                      <td className="text-slate-200 tabular-nums pr-3">{fmtDuration(s.durationMs)}</td>
                      <td className="text-slate-200 tabular-nums pr-3">{s.pageviews}</td>
                      <td className="text-slate-300 truncate max-w-[180px]" title={s.lastPath}>{s.lastPath ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Anonymous, first-party. One pageview per route change + one heartbeat per minute while the tab is visible (capped at 60).
        Sessions reset when the tab closes. /admin and /api paths are excluded.
      </p>
    </div>
  );
}
