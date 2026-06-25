import { useEffect, useMemo, useRef, useState } from 'react';
import {
  UserPlus, Activity, RefreshCw, Mail, Clock, Globe, Search, Copy, Check,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  db, collection, query, orderBy, limit, getDocs, where, Timestamp,
} from '@/lib/firebase';

interface RegisteredUser {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt?: any;
}

interface OnlineSession {
  sessionId: string;
  visitorId?: string;
  path?: string;
  userAgent?: string;
  referrer?: string;
  lastSeen: Date;
  firstSeen?: Date;
  eventCount: number;
}

type WindowMin = 1 | 5 | 15 | 30 | 60;
const WINDOW_OPTIONS: WindowMin[] = [1, 5, 15, 30, 60];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const LS_KEY = 'phl_liveactivity_prefs_v1';
interface Prefs {
  windowMin: WindowMin;
  userPageSize: number;
  sessionPageSize: number;
  notifySignups: boolean;
  notifyFirstSeen: boolean;
}
const DEFAULT_PREFS: Prefs = {
  windowMin: 5,
  userPageSize: 25,
  sessionPageSize: 25,
  notifySignups: true,
  notifyFirstSeen: false,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fullTs(d: Date): string {
  // ISO-style with local timezone abbrev
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${d.toLocaleString('en-GB', { hour12: false })} (${tz})`;
}

function shortUA(ua?: string): string {
  if (!ua) return 'Unknown';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            toast.success(`${label || 'Value'} copied`);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error('Copy failed'),
        );
      }}
      title={`Copy ${label || 'value'}`}
      className="p-1 rounded hover:bg-slate-700/60 text-[#9cb8d9] hover:text-white transition-colors shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function LiveActivityTab() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const updatePrefs = (patch: Partial<Prefs>) =>
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });

  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [sessions, setSessions] = useState<OnlineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const [userSearch, setUserSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [sessionPage, setSessionPage] = useState(1);

  // Track seen ids for notifications (avoid firing on initial load)
  const seenUserIdsRef = useRef<Set<string> | null>(null);
  const seenSessionIdsRef = useRef<Set<string> | null>(null);

  const fetchAll = async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setErr(null);
    try {
      // Recently registered customers
      let userDocs: any[] = [];
      try {
        const snap = await getDocs(
          query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(200))
        );
        userDocs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      } catch {
        const snap = await getDocs(collection(db, 'customers'));
        userDocs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        userDocs.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        });
        userDocs = userDocs.slice(0, 200);
      }

      // Notify new signups
      const userIds = new Set(userDocs.map((u: any) => u.uid));
      if (seenUserIdsRef.current && prefs.notifySignups) {
        const fresh = userDocs.filter((u: any) => !seenUserIdsRef.current!.has(u.uid));
        fresh.slice(0, 3).forEach((u: any) => {
          toast.success('New customer registered', {
            description: u.email || u.uid,
          });
        });
      }
      seenUserIdsRef.current = userIds;
      setUsers(userDocs as RegisteredUser[]);

      // Last online — visitor_events last 24h, group by session
      const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
      let evSnap;
      try {
        evSnap = await getDocs(
          query(
            collection(db, 'visitor_events'),
            where('createdAt', '>=', since),
            orderBy('createdAt', 'desc'),
            limit(3000)
          )
        );
      } catch {
        evSnap = await getDocs(
          query(collection(db, 'visitor_events'), orderBy('createdAt', 'desc'), limit(3000))
        );
      }
      const bySession = new Map<string, OnlineSession>();
      evSnap.docs.forEach(doc => {
        const d: any = doc.data();
        const sid = d.sessionId || doc.id;
        const ts: Date = d.createdAt?.toDate?.() || new Date();
        const existing = bySession.get(sid);
        if (!existing) {
          bySession.set(sid, {
            sessionId: sid,
            visitorId: d.visitorId,
            path: d.path,
            userAgent: d.userAgent,
            referrer: d.referrer,
            lastSeen: ts,
            firstSeen: d.firstSeen?.toDate?.() || ts,
            eventCount: 1,
          });
        } else {
          existing.eventCount += 1;
          if (ts > existing.lastSeen) {
            existing.lastSeen = ts;
            existing.path = d.path || existing.path;
          }
          if (d.firstSeen?.toDate && (!existing.firstSeen || d.firstSeen.toDate() < existing.firstSeen)) {
            existing.firstSeen = d.firstSeen.toDate();
          }
        }
      });
      const arr = Array.from(bySession.values()).sort(
        (a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()
      );

      // Notify newly first-seen sessions
      const sessIds = new Set(arr.map(s => s.sessionId));
      if (seenSessionIdsRef.current && prefs.notifyFirstSeen) {
        const fresh = arr.filter(s => !seenSessionIdsRef.current!.has(s.sessionId));
        fresh.slice(0, 3).forEach(s => {
          toast('New visitor online', {
            description: `${s.path || '/'} · ${shortUA(s.userAgent)}`,
          });
        });
      }
      seenSessionIdsRef.current = sessIds;
      setSessions(arr);
    } catch (e: any) {
      console.error('LiveActivityTab error', e);
      setErr(e?.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const refresh = setInterval(() => fetchAll({ silent: true }), 30_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.notifySignups, prefs.notifyFirstSeen]);

  const windowMs = prefs.windowMin * 60_000;
  const onlineNow = useMemo(
    () => sessions.filter(s => now - s.lastSeen.getTime() < windowMs).length,
    [sessions, now, windowMs]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.uid || '').toLowerCase().includes(q) ||
      `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(s =>
      (s.sessionId || '').toLowerCase().includes(q) ||
      (s.visitorId || '').toLowerCase().includes(q) ||
      (s.path || '').toLowerCase().includes(q)
    );
  }, [sessions, sessionSearch]);

  // Reset to first page when search changes
  useEffect(() => { setUserPage(1); }, [userSearch, prefs.userPageSize]);
  useEffect(() => { setSessionPage(1); }, [sessionSearch, prefs.sessionPageSize]);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / prefs.userPageSize));
  const sessionTotalPages = Math.max(1, Math.ceil(filteredSessions.length / prefs.sessionPageSize));
  const pagedUsers = filteredUsers.slice(
    (userPage - 1) * prefs.userPageSize,
    userPage * prefs.userPageSize
  );
  const pagedSessions = filteredSessions.slice(
    (sessionPage - 1) * prefs.sessionPageSize,
    sessionPage * prefs.sessionPageSize
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" /> Live Activity
          </h2>
          <p className="text-[#9cb8d9] text-sm mt-1">
            Newest registered emails and the most recently online visitors.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-[#9cb8d9] bg-slate-900 border-2 border-slate-700 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={prefs.notifySignups}
              onChange={e => updatePrefs({ notifySignups: e.target.checked })}
            />
            Notify signups
          </label>
          <label className="flex items-center gap-2 text-xs text-[#9cb8d9] bg-slate-900 border-2 border-slate-700 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={prefs.notifyFirstSeen}
              onChange={e => updatePrefs({ notifyFirstSeen: e.target.checked })}
            />
            Notify new visitors
          </label>
          <button
            onClick={() => fetchAll()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-400 text-xs uppercase tracking-wider">
              <Activity className="w-4 h-4" /> Online now
            </div>
            <select
              value={prefs.windowMin}
              onChange={e => updatePrefs({ windowMin: Number(e.target.value) as WindowMin })}
              className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded px-2 py-1"
            >
              {WINDOW_OPTIONS.map(w => (
                <option key={w} value={w}>{w} min</option>
              ))}
            </select>
          </div>
          <div className="text-white text-3xl font-bold mt-2">{onlineNow}</div>
        </div>
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-400 text-xs uppercase tracking-wider">
            <Globe className="w-4 h-4" /> Sessions (24h)
          </div>
          <div className="text-white text-3xl font-bold mt-2">{sessions.length}</div>
        </div>
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-purple-400 text-xs uppercase tracking-wider">
            <UserPlus className="w-4 h-4" /> Newest signups
          </div>
          <div className="text-white text-3xl font-bold mt-2">{users.length}</div>
        </div>
      </div>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registered emails */}
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-semibold">Newest Registered Emails</h3>
            <span className="ml-auto text-xs text-[#9cb8d9]">{filteredUsers.length} match</span>
          </div>
          <div className="p-3 border-b border-slate-800 flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-[#9cb8d9] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search email, name, or UID…"
                className="w-full pl-8 pr-2 py-2 bg-slate-800 border-2 border-slate-600 text-white text-sm rounded-lg min-h-[40px]"
              />
            </div>
            <select
              value={prefs.userPageSize}
              onChange={e => updatePrefs({ userPageSize: Number(e.target.value) })}
              className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}/page</option>)}
            </select>
          </div>
          <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
            {pagedUsers.length === 0 && !loading && (
              <div className="p-6 text-center text-[#9cb8d9] text-sm">No matching customers.</div>
            )}
            {pagedUsers.map(u => {
              const created = u.createdAt?.toDate?.() as Date | undefined;
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
              return (
                <div key={u.uid} className="p-3 hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-white text-sm font-medium truncate">{u.email}</span>
                        {u.email && <CopyBtn value={u.email} label="Email" />}
                      </div>
                      {name && (
                        <div className="text-[#9cb8d9] text-xs mt-1 ml-6">{name}</div>
                      )}
                      <div className="text-[#3a5a82] text-[10px] mt-0.5 ml-6 font-mono flex items-center gap-1">
                        {u.uid}
                        <CopyBtn value={u.uid} label="UID" />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[#9cb8d9] text-xs">
                        {created ? timeAgo(created) : '—'}
                      </div>
                      {created && (
                        <div className="text-[#3a5a82] text-[10px] mt-0.5">
                          {fullTs(created)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-[#9cb8d9]">
            <span>Page {userPage} / {userTotalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setUserPage(p => Math.max(1, p - 1))}
                disabled={userPage <= 1}
                className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))}
                disabled={userPage >= userTotalPages}
                className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Last online */}
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-semibold">Last Online Visitors</h3>
            <span className="ml-auto text-xs text-[#9cb8d9]">{filteredSessions.length} match</span>
          </div>
          <div className="p-3 border-b border-slate-800 flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-[#9cb8d9] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                placeholder="Search visitorId, sessionId, or path…"
                className="w-full pl-8 pr-2 py-2 bg-slate-800 border-2 border-slate-600 text-white text-sm rounded-lg min-h-[40px]"
              />
            </div>
            <select
              value={prefs.sessionPageSize}
              onChange={e => updatePrefs({ sessionPageSize: Number(e.target.value) })}
              className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded-lg px-2 py-2 min-h-[40px]"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}/page</option>)}
            </select>
          </div>
          <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
            {pagedSessions.length === 0 && !loading && (
              <div className="p-6 text-center text-[#9cb8d9] text-sm">
                No matching visitor activity.
              </div>
            )}
            {pagedSessions.map(s => {
              const live = now - s.lastSeen.getTime() < windowMs;
              return (
                <div key={s.sessionId} className="p-3 hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            live
                              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
                              : 'bg-slate-600'
                          }`}
                        />
                        <span className="text-white text-sm font-mono truncate">
                          {s.path || '/'}
                        </span>
                      </div>
                      <div className="text-[#9cb8d9] text-xs mt-1 ml-4 flex items-center gap-2 flex-wrap">
                        <span>{shortUA(s.userAgent)}</span>
                        <span className="text-[#3a5a82]">·</span>
                        <span>{s.eventCount} ev</span>
                        {s.referrer && (
                          <>
                            <span className="text-[#3a5a82]">·</span>
                            <span className="truncate max-w-[160px]">
                              ref: {s.referrer.replace(/^https?:\/\//, '')}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-[#3a5a82] text-[10px] mt-1 ml-4 font-mono flex items-center gap-1 flex-wrap">
                        <span>sid: {s.sessionId.slice(0, 12)}…</span>
                        <CopyBtn value={s.sessionId} label="Session ID" />
                        {s.visitorId && (
                          <>
                            <span className="text-slate-700">·</span>
                            <span>vid: {s.visitorId.slice(0, 12)}…</span>
                            <CopyBtn value={s.visitorId} label="Visitor ID" />
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`text-xs font-medium ${
                          live ? 'text-emerald-400' : 'text-[#9cb8d9]'
                        }`}
                      >
                        {timeAgo(s.lastSeen)}
                      </div>
                      <div className="text-[#3a5a82] text-[10px] mt-0.5 max-w-[180px]" title={s.lastSeen.toISOString()}>
                        {fullTs(s.lastSeen)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-[#9cb8d9]">
            <span>Page {sessionPage} / {sessionTotalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSessionPage(p => Math.max(1, p - 1))}
                disabled={sessionPage <= 1}
                className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSessionPage(p => Math.min(sessionTotalPages, p + 1))}
                disabled={sessionPage >= sessionTotalPages}
                className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
