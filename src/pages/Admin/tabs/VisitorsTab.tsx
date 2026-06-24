import { useEffect, useMemo, useRef, useState } from 'react';
import { Users, Eye, Clock, Activity, RefreshCw, CalendarIcon, Download, X, AlertTriangle, Repeat, Search, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, differenceInDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { db, auth, collection, query, where, getDocs, Timestamp, orderBy, limit } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { listVisitorSessions, type VisitorSessionRow, type SessionCursor } from '@/lib/visitor-sessions.functions';


type VisitorEvent = {
  id: string;
  type: 'pageview' | 'heartbeat';
  sessionId: string;
  visitorId?: string;
  firstSeen?: { toMillis?: () => number };
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

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const [pathFilter, setPathFilter] = useState<string | null>(null);

  // Server-side cursor-paginated sessions for the drill-down table.
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionSearchInput, setSessionSearchInput] = useState('');
  const [sessionPageSize, setSessionPageSize] = useState(50);
  // Cursor stack — index = page number; entry = cursor to fetch THAT page.
  // page 0 always uses null cursor.
  const [cursorStack, setCursorStack] = useState<Array<SessionCursor | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<SessionCursor | null>(null);
  const [serverSessions, setServerSessions] = useState<VisitorSessionRow[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverScanned, setServerScanned] = useState(0);
  const [serverTruncated, setServerTruncated] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsErr, setSessionsErr] = useState<string | null>(null);
  const lastErrToastRef = useRef<string | null>(null);

  const fromMs = range.from ? range.from.getTime() : Date.now() - 7 * 86_400_000;
  const toMs   = range.to   ? range.to.getTime()   : Date.now();
  const spanDays = Math.max(1, differenceInDays(new Date(toMs), new Date(fromMs)) + 1);
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

  // Debounce the sessions search box (300ms).
  useEffect(() => {
    const id = setTimeout(() => {
      setSessionSearch(sessionSearchInput.trim());
      setSessionPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [sessionSearchInput]);

  // Reset to page 0 when window / filters change.
  useEffect(() => { setSessionPage(0); }, [fromMs, toMs, pathFilter, sessionPageSize]);

  // Server-side fetch for the paginated sessions table.
  useEffect(() => {
    let cancelled = false;
    setSessionsLoading(true); setSessionsErr(null);
    (async () => {
      try {
        const u = auth.currentUser;
        if (!u) throw new Error('Not signed in');
        const idToken = await u.getIdToken();
        const res = await listVisitorSessions({
          data: {
            idToken,
            fromMs, toMs,
            pathFilter: pathFilter ?? null,
            search: sessionSearch || null,
            page: sessionPage,
            pageSize: sessionPageSize,
            maxEvents: 20_000,
          },
        });
        if (cancelled) return;
        setServerSessions(res.sessions);
        setServerTotal(res.total);
        setServerScanned(res.eventsScanned);
        setServerTruncated(res.truncated);
      } catch (e) {
        if (!cancelled) setSessionsErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromMs, toMs, pathFilter, sessionSearch, sessionPage, sessionPageSize, refreshKey]);


  // Events for drill-down (path filter applies to all per-page metrics).
  const filteredEvents = useMemo(
    () => pathFilter ? events.filter(e => (e.path || '/') === pathFilter) : events,
    [events, pathFilter],
  );

  const stats = useMemo(() => {
    const sessions = new Map<string, {
      min: number; max: number; pageviews: number;
      lastPath?: string; ua?: string;
      visitorId?: string; firstSeen?: number;
    }>();
    const visitorFirstSeen = new Map<string, number>();
    let totalPageviews = 0;
    const activeCutoff = Date.now() - 2 * 60_000;
    let activeNow = 0;

    for (const ev of filteredEvents) {
      const ts = ev.createdAt?.toMillis?.() ?? 0;
      if (!ts) continue;
      const sid = ev.sessionId;
      const s = sessions.get(sid) ?? {
        min: ts, max: ts, pageviews: 0, lastPath: ev.path, ua: ev.userAgent,
        visitorId: ev.visitorId, firstSeen: ev.firstSeen?.toMillis?.(),
      };
      s.min = Math.min(s.min, ts);
      s.max = Math.max(s.max, ts);
      if (ev.type === 'pageview') { s.pageviews += 1; totalPageviews += 1; }
      sessions.set(sid, s);
      if (ev.visitorId) {
        const fs = ev.firstSeen?.toMillis?.() ?? ts;
        const prev = visitorFirstSeen.get(ev.visitorId);
        if (prev == null || fs < prev) visitorFirstSeen.set(ev.visitorId, fs);
      }
    }

    let totalDuration = 0;
    const sessionList: Array<{ sid: string; vid?: string; start: number; end: number; durationMs: number; pageviews: number; lastPath?: string; ua?: string; returning: boolean }> = [];
    for (const [sid, s] of sessions) {
      const durationMs = s.max - s.min;
      totalDuration += durationMs;
      if (s.max >= activeCutoff) activeNow += 1;
      const returning = s.firstSeen != null && s.firstSeen < s.min - 60_000;
      sessionList.push({ sid, vid: s.visitorId, start: s.min, end: s.max, durationMs, pageviews: s.pageviews, lastPath: s.lastPath, ua: s.ua, returning });
    }
    sessionList.sort((a, b) => b.end - a.end);
    const avgDuration = sessions.size ? totalDuration / sessions.size : 0;

    // Returning-visitor cohorts.
    const uniqueVisitorIds = new Set<string>();
    let returningInRange = 0;
    let newInRange = 0;
    let within7d = 0;
    let within30d = 0;
    for (const [vid, firstMs] of visitorFirstSeen) {
      uniqueVisitorIds.add(vid);
      const firstInRange = firstMs >= fromMs;
      if (firstInRange) newInRange += 1; else returningInRange += 1;
      const ageDays = (fromMs - firstMs) / 86_400_000;
      if (!firstInRange && ageDays <= 7) within7d += 1;
      if (!firstInRange && ageDays <= 30) within30d += 1;
    }
    const returningPct = uniqueVisitorIds.size ? Math.round((returningInRange / uniqueVisitorIds.size) * 100) : 0;

    // Top pages — always from unfiltered events so user can drill in.
    const pageCounts = new Map<string, number>();
    for (const ev of events) {
      if (ev.type !== 'pageview') continue;
      const p = ev.path || '/';
      pageCounts.set(p, (pageCounts.get(p) ?? 0) + 1);
    }
    const topPages = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

    // Time series.
    const bucketMs = hourly ? 3_600_000 : 86_400_000;
    const startBucket = Math.floor(fromMs / bucketMs) * bucketMs;
    const endBucket = Math.ceil(toMs / bucketMs) * bucketMs;
    const buckets = new Map<number, { pageviews: number; sessions: Set<string> }>();
    for (let t = startBucket; t <= endBucket; t += bucketMs) {
      buckets.set(t, { pageviews: 0, sessions: new Set() });
    }
    for (const ev of filteredEvents) {
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

    // Anomaly detection — mean+stddev on the pageview series, flag any
    // bucket > mean + 2σ (spike) or < mean − 2σ (drop, ignored if mean<3).
    const values = series.map(s => s.pageviews);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const variance = values.length ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length : 0;
    const stddev = Math.sqrt(variance);
    type Anomaly = { kind: 'spike' | 'drop'; label: string; value: number; expected: number };
    const anomalies: Anomaly[] = [];
    if (stddev > 0 && values.length >= 4) {
      for (const s of series) {
        if (s.pageviews > mean + 2 * stddev && s.pageviews >= Math.max(3, mean * 1.5)) {
          anomalies.push({ kind: 'spike', label: s.label, value: s.pageviews, expected: Math.round(mean) });
        } else if (mean >= 3 && s.pageviews < Math.max(0, mean - 2 * stddev)) {
          anomalies.push({ kind: 'drop', label: s.label, value: s.pageviews, expected: Math.round(mean) });
        }
      }
    }

    return {
      uniqueVisitors: sessions.size,
      uniqueVisitorIds: uniqueVisitorIds.size,
      returningInRange, newInRange, returningPct, within7d, within30d,
      totalPageviews, avgDuration, activeNow, sessionList, topPages, series, anomalies,
    };
  }, [filteredEvents, events, fromMs, toMs, hourly]);

  const StatCard = ({ icon: Icon, label, value, sub, accent }: { icon: typeof Users; label: string; value: string; sub?: string; accent: string }) => (
    <div className="rounded-lg border-2 border-slate-700 bg-slate-800 p-4 flex items-center gap-3">
      <div className={`p-2 rounded-md bg-gradient-to-br ${accent} text-white`}><Icon size={20} /></div>
      <div className="min-w-0">
        <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold text-white truncate">{value}</div>
        {sub && <div className="text-xs text-slate-400 truncate">{sub}</div>}
      </div>
    </div>
  );

  const applyPreset = (days: number) => {
    setRange({ from: startOfDay(subDays(new Date(), days - 1)), to: endOfDay(new Date()) });
  };
  const isPresetActive = (days: number) => {
    if (!range.from || !range.to) return false;
    const ef = startOfDay(subDays(new Date(), days - 1)).getTime();
    const et = endOfDay(new Date()).getTime();
    return Math.abs(range.from.getTime() - ef) < 60_000 && Math.abs(range.to.getTime() - et) < 60_000;
  };

  const exportSessions = () => {
    const rows: string[][] = [
      ['sessionId', 'visitorId', 'returning', 'start', 'end', 'durationSeconds', 'pageviews', 'lastPath', 'userAgent'],
      ...stats.sessionList.map(s => [
        s.sid, s.vid ?? '', s.returning ? 'yes' : 'no',
        new Date(s.start).toISOString(), new Date(s.end).toISOString(),
        String(Math.round(s.durationMs / 1000)), String(s.pageviews),
        s.lastPath ?? '', s.ua ?? '',
      ]),
    ];
    const tag = pathFilter ? `-${pathFilter.replace(/[^a-z0-9]+/gi, '_')}` : '';
    downloadCsv(`visitors-sessions-${format(new Date(fromMs), 'yyyyMMdd')}-${format(new Date(toMs), 'yyyyMMdd')}${tag}.csv`, rows);
  };

  const exportEvents = () => {
    const rows: string[][] = [
      ['eventId', 'type', 'sessionId', 'visitorId', 'path', 'createdAt', 'referrer', 'userAgent'],
      ...filteredEvents.map(e => [
        e.id, e.type, e.sessionId, e.visitorId ?? '',
        e.path ?? '',
        e.createdAt?.toMillis ? new Date(e.createdAt.toMillis()).toISOString() : '',
        e.referrer ?? '', e.userAgent ?? '',
      ]),
    ];
    const tag = pathFilter ? `-${pathFilter.replace(/[^a-z0-9]+/gi, '_')}` : '';
    downloadCsv(`visitors-events-${format(new Date(fromMs), 'yyyyMMdd')}-${format(new Date(toMs), 'yyyyMMdd')}${tag}.csv`, rows);
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
              <Button variant="outline" className={cn('min-h-[40px] justify-start text-left font-normal border-2 border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {range.from && range.to
                  ? `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`
                  : <span>Pick date range</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-900 border-2 border-slate-700" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) => {
                  if (!r) return;
                  setRange({ from: r.from ? startOfDay(r.from) : undefined, to: r.to ? endOfDay(r.to) : undefined });
                  if (r.from && r.to) setPickerOpen(false);
                }}
                numberOfMonths={2}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
          <button onClick={exportSessions} className="px-3 min-h-[40px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white hover:bg-slate-700 inline-flex items-center gap-2 text-sm">
            <Download size={16} /> Sessions CSV
          </button>
          <button onClick={exportEvents} className="px-3 min-h-[40px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white hover:bg-slate-700 inline-flex items-center gap-2 text-sm">
            <Download size={16} /> Events CSV
          </button>
          <button onClick={() => setRefreshKey(k => k + 1)} className="px-3 min-h-[40px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white hover:bg-slate-700 inline-flex items-center gap-2">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {pathFilter && (
        <div className="rounded-lg border-2 border-emerald-700 bg-emerald-950/40 p-3 flex items-center justify-between">
          <div className="text-emerald-200 text-sm">
            <span className="text-emerald-400 font-semibold">Filtered to page:</span>{' '}
            <span className="font-mono">{pathFilter}</span>
          </div>
          <button onClick={() => setPathFilter(null)} className="inline-flex items-center gap-1 text-emerald-200 hover:text-white text-sm">
            <X size={14} /> Clear filter
          </button>
        </div>
      )}

      {err && <div className="rounded-lg border-2 border-red-700 bg-red-950 p-4 text-red-200 text-sm">{err}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Unique visitors" value={loading ? '…' : stats.uniqueVisitorIds.toLocaleString()} sub={`${stats.uniqueVisitors.toLocaleString()} sessions`} accent="from-indigo-500 to-indigo-600" />
        <StatCard icon={Eye} label="Page views" value={loading ? '…' : stats.totalPageviews.toLocaleString()} accent="from-cyan-500 to-cyan-600" />
        <StatCard icon={Clock} label="Avg. session" value={loading ? '…' : fmtDuration(stats.avgDuration)} accent="from-emerald-500 to-emerald-600" />
        <StatCard icon={Activity} label="Active now" value={loading ? '…' : stats.activeNow.toLocaleString()} accent="from-amber-500 to-amber-600" />
        <StatCard icon={Repeat} label="Returning" value={loading ? '…' : `${stats.returningInRange.toLocaleString()} (${stats.returningPct}%)`} sub={`${stats.newInRange.toLocaleString()} new in range`} accent="from-fuchsia-500 to-fuchsia-600" />
        <StatCard icon={Repeat} label="Returned ≤7d" value={loading ? '…' : stats.within7d.toLocaleString()} sub="first-seen within 7 days before range" accent="from-pink-500 to-pink-600" />
        <StatCard icon={Repeat} label="Returned ≤30d" value={loading ? '…' : stats.within30d.toLocaleString()} sub="first-seen within 30 days before range" accent="from-rose-500 to-rose-600" />
        <StatCard icon={AlertTriangle} label="Anomalies" value={loading ? '…' : stats.anomalies.length.toLocaleString()} sub={stats.anomalies.length ? 'in this window' : 'all clear'} accent="from-orange-500 to-orange-600" />
      </div>

      {stats.anomalies.length > 0 && (
        <div className="rounded-lg border-2 border-orange-700 bg-orange-950/40 p-4">
          <div className="flex items-center gap-2 mb-2 text-orange-200 font-semibold">
            <AlertTriangle size={18} /> Traffic anomalies detected
          </div>
          <ul className="space-y-1 text-sm">
            {stats.anomalies.slice(0, 12).map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-orange-100">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${a.kind === 'spike' ? 'bg-orange-700' : 'bg-blue-700'}`}>
                  {a.kind === 'spike' ? 'SPIKE' : 'DROP'}
                </span>
                <span className="font-mono">{a.label}</span>
                <span>— {a.value} views (expected ~{a.expected})</span>
              </li>
            ))}
          </ul>
          {stats.anomalies.length > 12 && (
            <div className="text-xs text-orange-300 mt-2">+{stats.anomalies.length - 12} more</div>
          )}
        </div>
      )}

      <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">Traffic over time{pathFilter ? ` — ${pathFilter}` : ''}</h3>
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
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} labelStyle={{ color: '#cbd5e1' }} />
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />
              <Area type="monotone" dataKey="pageviews" name="Page views" stroke="#06b6d4" fill="url(#pvFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="visitors" name="Unique visitors" stroke="#6366f1" fill="url(#uvFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
          <h3 className="text-white font-semibold mb-3">Top pages <span className="text-xs text-slate-400 font-normal">— click to drill in</span></h3>
          {stats.topPages.length === 0 ? (
            <div className="text-slate-400 text-sm">No data yet for this window.</div>
          ) : (
            <ul className="space-y-1">
              {stats.topPages.map(([path, count]) => {
                const active = path === pathFilter;
                return (
                  <li key={path}>
                    <button
                      onClick={() => setPathFilter(active ? null : path)}
                      className={`w-full flex items-center justify-between text-sm py-1 px-2 rounded border-b border-slate-800 last:border-0 text-left transition-colors ${active ? 'bg-emerald-900/40 border-emerald-700' : 'hover:bg-slate-800'}`}
                    >
                      <span className="text-slate-200 truncate mr-3" title={path}>{path}</span>
                      <span className="text-slate-400 tabular-nums">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-lg border-2 border-slate-700 bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-white font-semibold">
              Recent sessions{pathFilter ? ` — ${pathFilter}` : ''}
              <span className="ml-2 text-xs text-slate-400 font-normal">
                {sessionsLoading ? 'loading…' : `${serverTotal.toLocaleString()} match${serverTotal === 1 ? '' : 'es'}`}
                {serverTruncated && (
                  <span className="ml-2 text-amber-300" title={`Capped at ${serverScanned.toLocaleString()} events`}>
                    · truncated
                  </span>
                )}
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  value={sessionSearchInput}
                  onChange={(e) => setSessionSearchInput(e.target.value)}
                  placeholder="Search id / path / UA"
                  className="pl-7 pr-2 min-h-[36px] text-sm rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-56"
                />
              </div>
              <select
                value={sessionPageSize}
                onChange={(e) => setSessionPageSize(Number(e.target.value))}
                className="min-h-[36px] text-sm rounded-lg border-2 border-slate-600 bg-slate-800 text-white px-2"
                aria-label="Rows per page"
              >
                {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}/page</option>)}
              </select>
            </div>
          </div>

          {sessionsErr && (
            <div className="rounded-lg border-2 border-red-700 bg-red-950 p-3 text-red-200 text-xs mb-3">{sessionsErr}</div>
          )}

          <div className="max-h-[420px] overflow-auto">
            {!sessionsLoading && serverSessions.length === 0 ? (
              <div className="text-slate-400 text-sm">No sessions match{sessionSearch ? ` "${sessionSearch}"` : ''} in this window.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-400 uppercase sticky top-0 bg-slate-900">
                  <tr><th className="py-1">Last seen</th><th>Duration</th><th>Views</th><th>Type</th><th>Last path</th></tr>
                </thead>
                <tbody>
                  {serverSessions.map(s => (
                    <tr key={s.sid} className="border-t border-slate-800">
                      <td className="py-1 text-slate-200 whitespace-nowrap pr-3">{fmtDate(s.end)}</td>
                      <td className="text-slate-200 tabular-nums pr-3">{fmtDuration(s.durationMs)}</td>
                      <td className="text-slate-200 tabular-nums pr-3">{s.pageviews}</td>
                      <td className="pr-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${s.returning ? 'bg-fuchsia-900 text-fuchsia-200' : 'bg-slate-700 text-slate-200'}`}>
                          {s.returning ? 'Returning' : 'New'}
                        </span>
                      </td>
                      <td className="text-slate-300 truncate max-w-[180px]" title={s.lastPath ?? undefined}>{s.lastPath ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {serverTotal > sessionPageSize && (
            <div className="flex items-center justify-between mt-3 text-xs text-slate-300">
              <div>
                Page {sessionPage + 1} of {Math.max(1, Math.ceil(serverTotal / sessionPageSize))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSessionPage(p => Math.max(0, p - 1))}
                  disabled={sessionPage === 0 || sessionsLoading}
                  className="px-2 min-h-[32px] rounded-md border-2 border-slate-600 bg-slate-800 text-white disabled:opacity-40 inline-flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  onClick={() => setSessionPage(p => p + 1)}
                  disabled={(sessionPage + 1) * sessionPageSize >= serverTotal || sessionsLoading}
                  className="px-2 min-h-[32px] rounded-md border-2 border-slate-600 bg-slate-800 text-white disabled:opacity-40 inline-flex items-center gap-1"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>


      <p className="text-xs text-slate-500">
        Anonymous, first-party. Heartbeats pause when the tab is hidden or idle (5 min no activity), with duplicate-suppression on wake.
        Returning visitors are matched by persistent visitorId. Anomalies flagged at ±2σ from the window mean. /admin and /api paths excluded.
      </p>
    </div>
  );
}
