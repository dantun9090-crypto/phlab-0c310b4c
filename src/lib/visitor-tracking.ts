/**
 * Lightweight first-party visitor analytics.
 *
 * Captures anonymous, append-only events into Firestore `visitor_events`
 * so the admin panel can show how many people visited, how long they
 * stayed, and how many return — without GA4 / third parties.
 *
 * Identity model:
 *   - `sessionId` — per-tab (sessionStorage). One session ends when the
 *     tab is closed or after 30 min of inactivity.
 *   - `visitorId` — persistent across sessions (localStorage). Enables
 *     the "returning visitor" cohort metric.
 *   - `firstSeen` — visitor's first-ever timestamp (localStorage), sent
 *     with every event so cohorts can be computed without an extra read.
 *
 * Volume / accuracy control:
 *   - 1 `pageview` per route change (deduped against last path).
 *   - 1 `heartbeat` per 60s while the tab is visible AND the page has had
 *     user activity in the last 5 min (mouse/keyboard/touch/scroll).
 *     This prevents idle background tabs from inflating dwell time.
 *   - Heartbeats pause on `visibilitychange→hidden` / `blur`, resume on
 *     visible/focus. A final beat is flushed on `pagehide`.
 *   - Hard guard against duplicate beats inside the same 30s window
 *     (covers throttled timers firing twice when a tab wakes).
 *   - Capped at 120 heartbeats per session (~2h active dwell).
 *   - /admin, /api, /server-functions, /webhook excluded.
 */

const SESSION_KEY = 'phlabs_sid';
const VISITOR_KEY = 'phlabs_vid';
const FIRSTSEEN_KEY = 'phlabs_fs';
const HEARTBEAT_MS = 60_000;
const MAX_HEARTBEATS = 120;
const IDLE_TIMEOUT_MS = 5 * 60_000;
const DEDUPE_WINDOW_MS = 30_000;

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatsSent = 0;
let currentPath = '';
let lastBeatAt = 0;
let lastActivityAt = 0;

function makeId(): string {
  try { return crypto.randomUUID(); }
  catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}

function getSessionId(): string {
  try {
    const e = sessionStorage.getItem(SESSION_KEY);
    if (e) return e;
    const sid = makeId();
    sessionStorage.setItem(SESSION_KEY, sid);
    return sid;
  } catch { return makeId(); }
}

function getVisitorId(): string {
  try {
    const e = localStorage.getItem(VISITOR_KEY);
    if (e) return e;
    const vid = makeId();
    localStorage.setItem(VISITOR_KEY, vid);
    return vid;
  } catch { return makeId(); }
}

function getFirstSeen(): number {
  try {
    const e = localStorage.getItem(FIRSTSEEN_KEY);
    if (e) { const n = parseInt(e, 10); if (Number.isFinite(n)) return n; }
    const now = Date.now();
    localStorage.setItem(FIRSTSEEN_KEY, String(now));
    return now;
  } catch { return Date.now(); }
}

function isExcludedPath(path: string): boolean {
  return (
    path.startsWith('/admin') ||
    path.startsWith('/api') ||
    path.startsWith('/server-functions') ||
    path.startsWith('/webhook')
  );
}

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function isActive(): boolean {
  return Date.now() - lastActivityAt < IDLE_TIMEOUT_MS;
}

function markActivity(): void { lastActivityAt = Date.now(); }

async function logEvent(type: 'pageview' | 'heartbeat', path: string): Promise<void> {
  // Hard dedupe — never two beats inside DEDUPE_WINDOW_MS for same path/type.
  const now = Date.now();
  if (type === 'heartbeat' && now - lastBeatAt < DEDUPE_WINDOW_MS) return;
  lastBeatAt = now;
  try {
    const { db, collection, addDoc, Timestamp } = await import('@/lib/firebase');
    await addDoc(collection(db, 'visitor_events'), {
      type,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      firstSeen: Timestamp.fromMillis(getFirstSeen()),
      path: path.slice(0, 300),
      createdAt: Timestamp.now(),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300),
      referrer: (typeof document !== 'undefined' ? document.referrer : '').slice(0, 300),
    });
  } catch { /* analytics must never break the app */ }
}

function stopHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!isVisible() || !isActive()) return;
    if (heartbeatsSent >= MAX_HEARTBEATS) { stopHeartbeat(); return; }
    heartbeatsSent += 1;
    void logEvent('heartbeat', currentPath || (typeof location !== 'undefined' ? location.pathname : '/'));
  }, HEARTBEAT_MS);
}

export function trackVisitorPageView(path: string): void {
  if (typeof window === 'undefined') return;
  if (isExcludedPath(path)) return;
  if (path === currentPath) return;
  currentPath = path;
  markActivity();
  void logEvent('pageview', path);
}

export function initVisitorTracking(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  currentPath = location.pathname + location.search;
  if (isExcludedPath(location.pathname)) return;
  markActivity();
  void logEvent('pageview', currentPath);
  startHeartbeat();

  // Activity signals — keep idle tabs out of avg-session inflation.
  const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'focus'];
  activityEvents.forEach(ev => window.addEventListener(ev, markActivity, { passive: true } as AddEventListenerOptions));

  document.addEventListener('visibilitychange', () => {
    if (isVisible()) {
      markActivity();
      startHeartbeat();
      if (Date.now() - lastBeatAt > HEARTBEAT_MS && heartbeatsSent < MAX_HEARTBEATS) {
        heartbeatsSent += 1;
        void logEvent('heartbeat', currentPath);
      }
    } else {
      stopHeartbeat();
      if (heartbeatsSent < MAX_HEARTBEATS) {
        heartbeatsSent += 1;
        void logEvent('heartbeat', currentPath);
      }
    }
  });

  window.addEventListener('pagehide', () => {
    stopHeartbeat();
    if (heartbeatsSent < MAX_HEARTBEATS) {
      heartbeatsSent += 1;
      void logEvent('heartbeat', currentPath);
    }
  });
}
