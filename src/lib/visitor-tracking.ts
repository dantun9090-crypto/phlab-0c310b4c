/**
 * Lightweight first-party visitor analytics.
 *
 * Captures anonymous, append-only events into Firestore `visitor_events` so
 * the admin panel can show "how many people visited and how long they
 * stayed" without depending on GA4 / external APIs.
 *
 * Volume control:
 *   - 1 `pageview` event per route change.
 *   - 1 `heartbeat` event per 60s while the tab is visible.
 *   - Capped at 60 heartbeats per session (≈ 60 min of dwell time).
 *   - Disabled on /admin* paths to avoid logging staff sessions.
 *
 * Session duration is derived in the admin tab as `max(createdAt) -
 * min(createdAt)` per sessionId.
 */

const STORAGE_KEY = 'phlabs_sid';
const HEARTBEAT_MS = 60_000;
const MAX_HEARTBEATS = 60;

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatsSent = 0;
let currentPath = '';

function makeSid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const sid = makeSid();
    sessionStorage.setItem(STORAGE_KEY, sid);
    return sid;
  } catch {
    return makeSid();
  }
}

function isExcludedPath(path: string): boolean {
  return (
    path.startsWith('/admin') ||
    path.startsWith('/api') ||
    path.startsWith('/server-functions') ||
    path.startsWith('/webhook')
  );
}

async function logEvent(type: 'pageview' | 'heartbeat', path: string): Promise<void> {
  try {
    const { db, collection, addDoc, serverTimestamp } = await import('@/lib/firebase');
    const sid = getSessionId();
    await addDoc(collection(db, 'visitor_events'), {
      type,
      sessionId: sid,
      path: path.slice(0, 300),
      createdAt: serverTimestamp(),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300),
      referrer: (typeof document !== 'undefined' ? document.referrer : '').slice(0, 300),
    });
  } catch { /* silent — analytics must never break the app */ }
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (heartbeatsSent >= MAX_HEARTBEATS) {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      return;
    }
    heartbeatsSent += 1;
    void logEvent('heartbeat', currentPath || (typeof location !== 'undefined' ? location.pathname : '/'));
  }, HEARTBEAT_MS);
}

/** Record a page view. Safe to call on every route change. */
export function trackVisitorPageView(path: string): void {
  if (typeof window === 'undefined') return;
  if (isExcludedPath(path)) return;
  currentPath = path;
  void logEvent('pageview', path);
}

/** Initialize once per tab. Call from a top-level Layout useEffect. */
export function initVisitorTracking(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  currentPath = location.pathname + location.search;
  if (isExcludedPath(location.pathname)) return;
  void logEvent('pageview', currentPath);
  startHeartbeat();
}
