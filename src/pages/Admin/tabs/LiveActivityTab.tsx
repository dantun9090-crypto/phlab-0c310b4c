import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Activity, RefreshCw, Mail, Clock, Globe } from 'lucide-react';
import {
  db, collection, query, orderBy, limit, getDocs, where, Timestamp,
} from '@/lib/firebase';

interface RegisteredUser {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt?: any;
  referralSource?: string;
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

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
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

export default function LiveActivityTab() {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [sessions, setSessions] = useState<OnlineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const fetchAll = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Recently registered customers
      let userDocs: any[] = [];
      try {
        const snap = await getDocs(
          query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(50))
        );
        userDocs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      } catch {
        // Fallback if missing index/field — fetch and sort client-side
        const snap = await getDocs(collection(db, 'customers'));
        userDocs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        userDocs.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        });
        userDocs = userDocs.slice(0, 50);
      }
      setUsers(userDocs as RegisteredUser[]);

      // Last online — pull recent visitor_events (last 24h), group by session
      const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
      let evSnap;
      try {
        evSnap = await getDocs(
          query(
            collection(db, 'visitor_events'),
            where('createdAt', '>=', since),
            orderBy('createdAt', 'desc'),
            limit(2000)
          )
        );
      } catch {
        evSnap = await getDocs(
          query(collection(db, 'visitor_events'), orderBy('createdAt', 'desc'), limit(2000))
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
        }
      });
      const arr = Array.from(bySession.values()).sort(
        (a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()
      );
      setSessions(arr.slice(0, 100));
    } catch (e: any) {
      console.error('LiveActivityTab error', e);
      setErr(e?.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const refresh = setInterval(fetchAll, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onlineNow = useMemo(
    () => sessions.filter(s => now - s.lastSeen.getTime() < 5 * 60 * 1000).length,
    [sessions, now]
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
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-xs uppercase tracking-wider">
            <Activity className="w-4 h-4" /> Online now (5 min)
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
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-semibold">Newest Registered Emails</h3>
          </div>
          <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
            {users.length === 0 && !loading && (
              <div className="p-6 text-center text-[#9cb8d9] text-sm">No customers yet.</div>
            )}
            {users.map(u => {
              const created = u.createdAt?.toDate?.() as Date | undefined;
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
              return (
                <div key={u.uid} className="p-3 hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-white text-sm font-medium truncate">{u.email}</span>
                      </div>
                      {name && (
                        <div className="text-[#9cb8d9] text-xs mt-1 ml-6">{name}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[#9cb8d9] text-xs">
                        {created ? timeAgo(created) : '—'}
                      </div>
                      {created && (
                        <div className="text-[#3a5a82] text-[10px] mt-0.5">
                          {created.toLocaleString('en-GB')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Last online */}
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-semibold">Last Online Visitors</h3>
          </div>
          <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
            {sessions.length === 0 && !loading && (
              <div className="p-6 text-center text-[#9cb8d9] text-sm">
                No recent visitor activity.
              </div>
            )}
            {sessions.map(s => {
              const live = now - s.lastSeen.getTime() < 5 * 60 * 1000;
              return (
                <div key={s.sessionId} className="p-3 hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-3">
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
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`text-xs font-medium ${
                          live ? 'text-emerald-400' : 'text-[#9cb8d9]'
                        }`}
                      >
                        {timeAgo(s.lastSeen)}
                      </div>
                      <div className="text-[#3a5a82] text-[10px] mt-0.5 font-mono">
                        {s.sessionId.slice(0, 8)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
