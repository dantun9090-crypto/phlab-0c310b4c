import { useEffect, useMemo, useState } from 'react';
import { Users, Eye, Clock, Activity, RefreshCw, CalendarIcon } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, differenceInDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { db, collection, query, where, getDocs, Timestamp, orderBy, limit } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type VisitorEvent = {
  id: string;
  type: 'pageview' | 'heartbeat';
  sessionId: string;
  path?: string;
  userAgent?: string;
  referrer?: string;
  createdAt?: { toMillis?: () => number };
};

type Preset = { label: string; days: number };
const PRESETS: Preset[] = [
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
  const [range, setRange] = useState<DateRange>(() => ({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date()),
  }));
  const [events, setEvents] = useState<VisitorEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fromMs = range.from ? range.from.getTime() : Date.now() - 7 * 86_400_000;
  const toMs   = range.to   ? range.to.getTime()   : Date.now();
  const spanDays = Math.max(1, differenceInDays(new Date(toMs), new Date(fromMs)) + 1);
  // Bucket size: hourly when ≤2 days, otherwise daily.
  const hourly = spanDays <= 2;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const q = query(
          collection(db, 'visitor_events'),
          where('createdAt', '>=', Timestamp.fromMillis(fromMs)),
          where('createdAt', '<=', Timestamp.fromMillis(toMs)),
          orderBy('createdAt', 'desc'),
          limit(20_000),
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
  }, [fromMs, toMs, refreshKey]);

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

    // Time series buckets
    const bucketMs = hourly ? 3_600_000 : 86_400_000;
    const startBucket = Math.floor(fromMs / bucketMs) * bucketMs;
    const endBucket = Math.ceil(toMs / bucketMs) * bucketMs;
    const buckets = new Map<number, { pageviews: number; sessions: Set<string> }>();
    for (let t = startBucket; t <= endBucket; t += bucketMs) {
      buckets.set(t, { pageviews: 0, sessions: new Set() });
    }
    for (const ev of events) {
      const ts = ev.createdAt?.toMillis?.() ?? 0;
      if (!ts) continue;
      const k = Math.floor(ts / bucketMs) * bucketMs;
      const b = buckets.get(k);
      if (!b) continue;
      if (ev.type === 'pageview') b.pageviews += 1;
      b.sessions.add(ev.sessionId);
    }
    const series = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, b]) => ({
        t,
        label: hourly ? format(new Date(t), 'HH:mm') : format(new Date(t), 'd MMM'),
        pageviews: b.pageviews,
        visitors: b.sessions.size,
      }));

    return { uniqueVisitors: sessions.size, totalPageviews, avgDuration, activeNow, sessionList, topPages, series };
  }, [events, fromMs, toMs, hourly]);

  const StatCard = ({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent: string }) => (
    <div className={`rounded-lg border-2 border-slate-700 bg-slate-800 p-4 flex items-center gap-3`}>
      <div className={`p-2 rounded-md bg-gradient-to-br ${accent} text-white`}><Icon size={20} /></div>
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold text-white">{value}</div>
      </div>
    </div>
  );

  const applyPreset = (days: number) => {
    setRange({
      from: startOfDay(subDays(new Date(), days - 1)),
      to: endOfDay(new Date()),
    });
  };

  const isPresetActive = (days: number) => {
    if (!range.from || !range.to) return false;
    const expectedFrom = startOfDay(subDays(new Date(), days - 1)).getTime();
    const expectedTo = endOfDay(new Date()).getTime();
    return Math.abs(range.from.getTime() - expectedFrom) < 60_000 && Math.abs(range.to.getTime() - expectedTo) < 60_000;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Visitors</h2>
          <p className="text-sm text-slate-400">First-party analytics — anonymous, sampled from real traffic.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className={`px-3 min-h-[40px] rounded-lg border-2 text-sm font-medium ${isPresetActive(p.days) ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'}`}
            >Last {p.label}</button>
          ))}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'min-h-[40px] justify-start text-left font-normal border-2 border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white',
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {range.from && range.to ? (
                  `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`
                ) : (
                  <span>Pick date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-900 border-2 border-slate-700" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) => {
                  if (!r) return;
                  setRange({
                    from: r.from ? startOfDay(r.from) : undefined,
                    to:   r.to   ? endOfDay(r.to)     : undefined,
                  });
                  if (r.from && r.to) setPickerOpen(false);
                }}
                numberOfMonths={2}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
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

      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">Traffic over time</h3>
          <span className="text-xs text-slate-400">{hourly ? 'Hourly' : 'Daily'} · {spanDays} day{spanDays === 1 ? '' : 's'}</span>
        </div>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <AreaChart data={stats.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="uvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} minTickGap={20} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />
              <Area type="monotone" dataKey="pageviews" name="Page views" stroke="#06b6d4" fill="url(#pvFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="visitors"  name="Unique visitors" stroke="#6366f1" fill="url(#uvFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
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
        Anonymous, first-party. Heartbeats pause when the tab is hidden, so duration reflects real on-page time.
        /admin and /api paths are excluded.
      </p>
    </div>
  );
}
