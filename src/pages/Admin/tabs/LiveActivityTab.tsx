import { useEffect, useMemo, useRef, useState } from 'react';
import {
  UserPlus, Activity, Mail, Clock, Globe, Search, Copy, Check,
  ChevronLeft, ChevronRight, BellOff, Radio, RotateCcw, Trash2, ShieldOff, Info,
  Download, Upload, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  db, collection, query, orderBy, limit, onSnapshot, where, Timestamp,
  doc, getDoc, setDoc,
} from '@/lib/firebase';
import {
  isQuietNow, shouldSuppressToast, COMMON_TIMEZONES, detectLocalTimezone,
} from '@/lib/quiet-hours';
import { logToastEvent, type ToastKind } from '@/lib/toast-audit';
import {
  detectBotReasons, isBotSession, BOT_REASON_LABELS,
  DEFAULT_ALLOWLIST_UAS, DEFAULT_ALLOWLIST_REFERRERS,
  parseAndValidateList,
  type BotDetectionOptions,
} from '@/lib/bot-detection';

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

const LS_KEY = 'phl_liveactivity_prefs_v2';
interface Prefs {
  windowMin: WindowMin;
  userPageSize: number;
  sessionPageSize: number;
  notifySignups: boolean;
  notifyFirstSeen: boolean;
  userSearch: string;
  sessionSearch: string;
  userPage: number;
  sessionPage: number;
  quietEnabled: boolean;
  quietStart: string; // "HH:MM"
  quietEnd: string;   // "HH:MM"
  quietTimezone: string; // IANA, e.g. "Europe/London"
  toastDedupTtlH: number; // hours; entries older than this are forgotten
  toastAuditRetentionDays: number; // retention for toastAuditLogs cleanup job
  hideBots: boolean; // exclude bot/crawler user-agents from live visitors
  treatForceHideBadgeAsBot: boolean; // when false, forceHideBadge sessions are NOT auto-classified
  allowlistUAs: string[]; // UA substrings always treated as human (operator tools)
  allowlistReferrers: string[]; // referrer hostnames always treated as human

}
const DEFAULT_PREFS: Prefs = {
  windowMin: 5,
  userPageSize: 25,
  sessionPageSize: 25,
  notifySignups: true,
  notifyFirstSeen: false,
  userSearch: '',
  sessionSearch: '',
  userPage: 1,
  sessionPage: 1,
  quietEnabled: false,
  quietStart: '22:00',
  quietEnd: '08:00',
  quietTimezone: typeof window !== 'undefined' ? detectLocalTimezone() : 'UTC',
  toastDedupTtlH: 24,
  toastAuditRetentionDays: 30,
  hideBots: true,
  treatForceHideBadgeAsBot: true,
  allowlistUAs: [],
  allowlistReferrers: [],
};

// Detection logic + UA/path regex live in '@/lib/bot-detection' (fully tested).




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

// Persistent toast dedup — survives snapshot re-fires and remounts.
const DEDUP_KEY = 'phl_liveactivity_toast_dedup_v1';
type DedupMap = Record<string, number>; // key -> ms timestamp

function loadDedup(): DedupMap {
  try {
    const raw = localStorage.getItem(DEDUP_KEY);
    return raw ? (JSON.parse(raw) as DedupMap) : {};
  } catch {
    return {};
  }
}
function saveDedup(map: DedupMap) {
  try { localStorage.setItem(DEDUP_KEY, JSON.stringify(map)); } catch { /* noop */ }
}
function pruneDedup(map: DedupMap, ttlH: number): DedupMap {
  const cutoff = Date.now() - ttlH * 3_600_000;
  const out: DedupMap = {};
  for (const [k, v] of Object.entries(map)) if (v >= cutoff) out[k] = v;
  return out;
}

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fullTs(d: Date, tz?: string): string {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    return `${d.toLocaleString('en-GB', { hour12: false, timeZone: zone })} (${zone})`;
  } catch {
    return `${d.toLocaleString('en-GB', { hour12: false })} (${zone})`;
  }
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

  // Persisted UI state
  const userSearch = prefs.userSearch;
  const sessionSearch = prefs.sessionSearch;
  const userPage = prefs.userPage;
  const sessionPage = prefs.sessionPage;
  const setUserSearch = (v: string) => updatePrefs({ userSearch: v, userPage: 1 });
  const setSessionSearch = (v: string) => updatePrefs({ sessionSearch: v, sessionPage: 1 });
  const setUserPage = (v: number) => updatePrefs({ userPage: v });
  const setSessionPage = (v: number) => updatePrefs({ sessionPage: v });

  // Track seen ids + initial-load flag for notifications (avoid firing on first snapshot)
  const seenUserIdsRef = useRef<Set<string> | null>(null);
  const seenSessionIdsRef = useRef<Set<string> | null>(null);

  // Persistent dedup map for first-seen toasts (survives remounts + snapshots).
  const dedupRef = useRef<DedupMap>(loadDedup());

  // Keep latest prefs accessible in snapshot callbacks without resubscribing
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  // Load retention setting from Firestore (settings/toastAudit.retentionDays) once.
  const retentionLoadedRef = useRef(false);
  useEffect(() => {
    if (retentionLoadedRef.current) return;
    retentionLoadedRef.current = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'toastAudit'));
        const v = snap.exists() ? (snap.data() as any).retentionDays : undefined;
        if (typeof v === 'number' && Number.isFinite(v)) {
          setPrefs(prev => {
            const next = { ...prev, toastAuditRetentionDays: Math.max(1, Math.min(365, Math.floor(v))) };
            savePrefs(next);
            return next;
          });
        }
      } catch (e) {
        console.warn('[live-activity] load retention failed', e);
      }
    })();
  }, []);

  const saveRetention = async (days: number) => {
    const clamped = Math.max(1, Math.min(365, Math.floor(days)));
    updatePrefs({ toastAuditRetentionDays: clamped });
    try {
      await setDoc(doc(db, 'settings', 'toastAudit'), {
        retentionDays: clamped,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      toast.success(`Audit retention saved (${clamped}d)`);
    } catch (e: any) {
      toast.error('Failed to save retention', { description: e?.message });
    }
  };

  const resetDedup = () => {
    dedupRef.current = {};
    try { localStorage.removeItem(DEDUP_KEY); } catch { /* noop */ }
    toast.success('Dedup cache reset', {
      description: 'First-seen toasts will fire again immediately.',
    });
  };


  const maybeToast = (
    kind: ToastKind,
    title: string,
    description: string,
    targetId?: string,
  ) => {
    const p = prefsRef.current;
    const snapshot = {
      notifySignups: p.notifySignups,
      notifyFirstSeen: p.notifyFirstSeen,
      quietEnabled: p.quietEnabled,
      quietStart: p.quietStart,
      quietEnd: p.quietEnd,
      quietTimezone: p.quietTimezone,
      hideBots: p.hideBots,
      treatForceHideBadgeAsBot: p.treatForceHideBadgeAsBot,
    };

    // 1) dedup — once per targetId within TTL.
    if (targetId) {
      const ttlMs = p.toastDedupTtlH * 3_600_000;
      const last = dedupRef.current[targetId];
      if (last && Date.now() - last < ttlMs) {
        logToastEvent({
          kind, outcome: 'suppressed:dedup', title, description, targetId,
          prefsSnapshot: snapshot,
        });
        return;
      }
    }

    // 2) pref / quiet-hours suppression (shared logic).
    const verdict = shouldSuppressToast(kind, {
      notifySignups: p.notifySignups,
      notifyFirstSeen: p.notifyFirstSeen,
      quiet: {
        enabled: p.quietEnabled, start: p.quietStart, end: p.quietEnd,
        timezone: p.quietTimezone,
      },
    });
    if (verdict.suppressed) {
      logToastEvent({
        kind,
        outcome: verdict.reason === 'pref-off' ? 'suppressed:pref-off' : 'suppressed:quiet-hours',
        title, description, targetId, prefsSnapshot: snapshot,
      });
      return;
    }

    // 3) deliver + remember.
    if (kind === 'signup') toast.success(title, { description });
    else toast(title, { description });

    if (targetId) {
      dedupRef.current[targetId] = Date.now();
      dedupRef.current = pruneDedup(dedupRef.current, p.toastDedupTtlH);
      saveDedup(dedupRef.current);
    }
    logToastEvent({
      kind, outcome: 'delivered', title, description, targetId,
      prefsSnapshot: snapshot,
    });
  };

  // Realtime: customers
  useEffect(() => {
    setLoading(true);
    const qUsers = query(
      collection(db, 'customers'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(
      qUsers,
      (snap) => {
        const docs = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) as RegisteredUser[];
        const ids = new Set(docs.map(u => u.uid));
        if (seenUserIdsRef.current) {
          const fresh = docs.filter(u => !seenUserIdsRef.current!.has(u.uid));
          fresh.slice(0, 3).forEach(u => {
            maybeToast('signup', 'New customer registered', u.email || u.uid, u.uid);
          });
        }
        seenUserIdsRef.current = ids;
        setUsers(docs);
        setLoading(false);
      },
      (e) => {
        console.error('LiveActivity customers snapshot error', e);
        setErr(e?.message || 'Failed to load customers');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Realtime: visitor_events (last 24h)
  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const qEvents = query(
      collection(db, 'visitor_events'),
      where('createdAt', '>=', since),
      orderBy('createdAt', 'desc'),
      limit(3000)
    );
    const unsub = onSnapshot(
      qEvents,
      (snap) => {
        const bySession = new Map<string, OnlineSession>();
        snap.docs.forEach(doc => {
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
        const allArr = Array.from(bySession.values()).sort(
          (a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()
        );
        const ids = new Set(allArr.map(s => s.sessionId));
        if (seenSessionIdsRef.current) {
          const fresh = allArr.filter(s => !seenSessionIdsRef.current!.has(s.sessionId));
          fresh.slice(0, 3).forEach(s => {
            const p = prefsRef.current;
            const botOpts: BotDetectionOptions = {
              treatForceHideBadgeAsBot: p.treatForceHideBadgeAsBot,
              allowlistUAs: p.allowlistUAs,
              allowlistReferrers: p.allowlistReferrers,
            };
            const reasons = detectBotReasons(s, botOpts);
            const hitsForceHide = reasons.includes('force-hide-badge');
            const isBot = reasons.length > 0;
            // forceHideBadge toggle is independent of hideBots: when enabled,
            // suppress (and log) even with humans-only OFF.
            if ((p.treatForceHideBadgeAsBot && hitsForceHide) || (p.hideBots && isBot)) {
              logToastEvent({
                kind: 'visitor',
                outcome: 'suppressed:bot',
                title: 'New visitor online',
                description: `${s.path || '/'} · ${shortUA(s.userAgent)}`,
                targetId: s.visitorId || s.sessionId,
                prefsSnapshot: {
                  notifySignups: p.notifySignups,
                  notifyFirstSeen: p.notifyFirstSeen,
                  quietEnabled: p.quietEnabled,
                  quietStart: p.quietStart,
                  quietEnd: p.quietEnd,
                  quietTimezone: p.quietTimezone,
                  hideBots: p.hideBots,
                  treatForceHideBadgeAsBot: p.treatForceHideBadgeAsBot,
                },
                botReasons: reasons,
              });
              return;
            }
            maybeToast(
              'visitor',
              'New visitor online',
              `${s.path || '/'} · ${shortUA(s.userAgent)}`,
              s.visitorId || s.sessionId,
            );
          });
        }
        seenSessionIdsRef.current = ids;
        setSessions(allArr);
      },
      (e) => {
        console.error('LiveActivity visitor_events snapshot error', e);
      }
    );
    return () => unsub();
  }, []);

  // Tick for relative timestamps + online window
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, []);

  const windowMs = prefs.windowMin * 60_000;
  const botOpts = useMemo<BotDetectionOptions>(() => ({
    treatForceHideBadgeAsBot: prefs.treatForceHideBadgeAsBot,
    allowlistUAs: prefs.allowlistUAs,
    allowlistReferrers: prefs.allowlistReferrers,
  }), [prefs.treatForceHideBadgeAsBot, prefs.allowlistUAs, prefs.allowlistReferrers]);

  // Annotate every session once with its bot reasons — used by the row badge.
  const annotated = useMemo(
    () => sessions.map(s => ({ session: s, reasons: detectBotReasons(s, botOpts) })),
    [sessions, botOpts]
  );
  const visibleAnnotated = useMemo(
    () => (prefs.hideBots ? annotated.filter(a => a.reasons.length === 0) : annotated),
    [annotated, prefs.hideBots]
  );
  const visibleSessions = useMemo(() => visibleAnnotated.map(a => a.session), [visibleAnnotated]);
  const botCount = useMemo(
    () => annotated.reduce((n, a) => n + (a.reasons.length > 0 ? 1 : 0), 0),
    [annotated]
  );
  const onlineNow = useMemo(
    () => visibleSessions.filter(s => now - s.lastSeen.getTime() < windowMs).length,
    [visibleSessions, now, windowMs]
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

  const filteredAnnotated = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) return visibleAnnotated;
    return visibleAnnotated.filter(a =>
      (a.session.sessionId || '').toLowerCase().includes(q) ||
      (a.session.visitorId || '').toLowerCase().includes(q) ||
      (a.session.path || '').toLowerCase().includes(q)
    );
  }, [visibleAnnotated, sessionSearch]);
  const filteredSessions = useMemo(() => filteredAnnotated.map(a => a.session), [filteredAnnotated]);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / prefs.userPageSize));
  const sessionTotalPages = Math.max(1, Math.ceil(filteredAnnotated.length / prefs.sessionPageSize));
  const safeUserPage = Math.min(userPage, userTotalPages);
  const safeSessionPage = Math.min(sessionPage, sessionTotalPages);
  const pagedUsers = filteredUsers.slice(
    (safeUserPage - 1) * prefs.userPageSize,
    safeUserPage * prefs.userPageSize
  );
  const pagedAnnotated = filteredAnnotated.slice(
    (safeSessionPage - 1) * prefs.sessionPageSize,
    safeSessionPage * prefs.sessionPageSize
  );

  const quietActive = prefs.quietEnabled && isQuietNow(prefs.quietStart, prefs.quietEnd, new Date(), prefs.quietTimezone);


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
          <p className="text-[#3a5a82] text-[11px] mt-1 flex items-center gap-1.5 flex-wrap">
            <Clock className="w-3 h-3" />
            Timestamps & quiet hours in <span className="text-emerald-400 font-mono">{prefs.quietTimezone}</span>
            {quietActive && (
              <span className="ml-1 text-amber-400 uppercase tracking-wider">· quiet hours active</span>
            )}
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
          <label className="flex items-center gap-2 text-xs text-[#9cb8d9] bg-slate-900 border-2 border-slate-700 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={prefs.quietEnabled}
              onChange={e => updatePrefs({ quietEnabled: e.target.checked })}
            />
            <BellOff className="w-3.5 h-3.5" /> Quiet hours
            <input
              type="time"
              value={prefs.quietStart}
              onChange={e => updatePrefs({ quietStart: e.target.value })}
              disabled={!prefs.quietEnabled}
              className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded px-1.5 py-0.5 disabled:opacity-50"
            />
            <span>–</span>
            <input
              type="time"
              value={prefs.quietEnd}
              onChange={e => updatePrefs({ quietEnd: e.target.value })}
              disabled={!prefs.quietEnabled}
              className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded px-1.5 py-0.5 disabled:opacity-50"
            />
            <select
              value={prefs.quietTimezone}
              onChange={e => updatePrefs({ quietTimezone: e.target.value })}
              disabled={!prefs.quietEnabled}
              title="Quiet-hours timezone"
              className="bg-slate-800 border-2 border-slate-600 text-white text-xs rounded px-1.5 py-0.5 disabled:opacity-50 max-w-[140px]"
            >
              {(COMMON_TIMEZONES.includes(prefs.quietTimezone)
                ? COMMON_TIMEZONES
                : [prefs.quietTimezone, ...COMMON_TIMEZONES]).map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            {quietActive && (
              <span className="text-amber-400 text-[10px] uppercase tracking-wider">muted</span>
            )}
          </label>
          <button
            type="button"
            onClick={resetDedup}
            title="Clear the first-seen toast dedup cache (re-fires toasts for already-seen visitors/sessions)"
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-[#9cb8d9] hover:text-white hover:border-amber-500/50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset dedup
          </button>
          <label
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-[#9cb8d9] cursor-pointer hover:text-white"
            title="Hide bots, crawlers, prerenderers and uptime monitors from the live visitors list"
          >
            <input
              type="checkbox"
              checked={prefs.hideBots}
              onChange={e => updatePrefs({ hideBots: e.target.checked })}
              className="accent-emerald-500"
            />
            Humans only
            {prefs.hideBots && botCount > 0 && (
              <span className="text-slate-500">({botCount} bot{botCount === 1 ? '' : 's'} hidden)</span>
            )}
          </label>
          <label
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-[#9cb8d9] cursor-pointer hover:text-white"
            title="When ON, sessions hitting /?forceHideBadge=true (Google Merchant trust-badge iframe) are always classified as bots — even with Humans-only OFF. Turn OFF to inspect those sessions."
          >
            <input
              type="checkbox"
              checked={prefs.treatForceHideBadgeAsBot}
              onChange={e => updatePrefs({ treatForceHideBadgeAsBot: e.target.checked })}
              className="accent-amber-500"
            />
            forceHideBadge = bot
          </label>
          <label
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-[#9cb8d9]"
            title="Comma-separated UA substrings that always pass as human (your own monitoring/QA tools). Case-insensitive."
          >
            <span>Allow UAs</span>
            <input
              type="text"
              placeholder="phlabs-internal, my-qa-bot"
              defaultValue={prefs.allowlistUAs.join(', ')}
              onBlur={e => updatePrefs({
                allowlistUAs: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              })}
              className="w-48 bg-slate-800 border-2 border-slate-600 text-white text-xs rounded px-1.5 py-0.5 font-mono"
            />
          </label>
          <label
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-[#9cb8d9]"
            title="Comma-separated referrer hostnames that always pass as human."
          >
            <span>Allow refs</span>
            <input
              type="text"
              placeholder="ops.phlabs.co.uk"
              defaultValue={prefs.allowlistReferrers.join(', ')}
              onBlur={e => updatePrefs({
                allowlistReferrers: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
              })}
              className="w-44 bg-slate-800 border-2 border-slate-600 text-white text-xs rounded px-1.5 py-0.5 font-mono"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[#9cb8d9] bg-slate-900 border-2 border-slate-700 rounded-lg px-3 py-2">
            <Trash2 className="w-3.5 h-3.5" /> Audit retention
            <input
              type="number"
              min={1}
              max={365}
              value={prefs.toastAuditRetentionDays}
              onChange={e => updatePrefs({ toastAuditRetentionDays: Number(e.target.value) || 1 })}
              onBlur={e => saveRetention(Number(e.target.value) || 30)}
              className="w-16 bg-slate-800 border-2 border-slate-600 text-white text-xs rounded px-1.5 py-0.5"
            />
            <span>days</span>
          </label>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-2 border-slate-700 rounded-lg text-xs text-[#9cb8d9]">
            <Radio className={`w-3.5 h-3.5 ${loading ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`} />
            {loading ? 'Connecting…' : 'Live'}
          </div>
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
          <div className="text-white text-3xl font-bold mt-2">{visibleSessions.length}</div>
          {prefs.hideBots && botCount > 0 && (
            <div className="text-[10px] text-slate-500 mt-1">{botCount} bot{botCount === 1 ? '' : 's'} hidden</div>
          )}
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
                          {fullTs(created, prefs.quietTimezone)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-[#9cb8d9]">
            <span>Page {safeUserPage} / {userTotalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setUserPage(Math.max(1, safeUserPage - 1))}
                disabled={userPage <= 1}
                className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setUserPage(Math.min(userTotalPages, safeUserPage + 1))}
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
            {pagedAnnotated.length === 0 && !loading && (
              <div className="p-6 text-center text-[#9cb8d9] text-sm">
                No matching visitor activity.
              </div>
            )}
            {pagedAnnotated.map(({ session: s, reasons }) => {
              const live = now - s.lastSeen.getTime() < windowMs;
              const isBot = reasons.length > 0;
              const reasonTitle = isBot
                ? `Hidden bot — ${reasons.map(r => BOT_REASON_LABELS[r]).join('; ')}`
                : '';
              return (
                <div key={s.sessionId} className={`p-3 hover:bg-slate-800/40 transition-colors ${isBot ? 'bg-amber-500/[0.03]' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {isBot && (
                          <span
                            title={reasonTitle}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] uppercase tracking-wider"
                          >
                            <ShieldOff className="w-3 h-3" />
                            hidden bot
                            <span className="text-amber-400/70 normal-case tracking-normal">
                              · {reasons[0]}
                            </span>
                            <Info className="w-3 h-3 opacity-70" />
                          </span>
                        )}
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
                        {fullTs(s.lastSeen, prefs.quietTimezone)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-between text-xs text-[#9cb8d9]">
            <span>Page {safeSessionPage} / {sessionTotalPages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSessionPage(Math.max(1, safeSessionPage - 1))}
                disabled={sessionPage <= 1}
                className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSessionPage(Math.min(sessionTotalPages, safeSessionPage + 1))}
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
