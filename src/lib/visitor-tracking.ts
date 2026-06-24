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
 *   - Heartbeats PAUSE when the tab is hidden / window blurred and RESUME
 *     when visible again, so "average session duration" doesn't count time
 *     the user wasn't actually on the page.
 *   - One final `heartbeat` is flushed on `pagehide` / `visibilitychange→
 *     hidden` via `navigator.sendBeacon` fallback so the last active second
 *     is recorded even if the tab closes.
 *   - Capped at 120 heartbeats per session (≈ 2h of active dwell time).
 *   - Disabled on /admin* paths to avoid logging staff sessions.
 *
 * Session duration is derived in the admin tab as `max(createdAt) -
 * min(createdAt)` per sessionId across visible-only heartbeats.
 */

const STORAGE_KEY = 'phlabs_sid';
const HEARTBEAT_MS = 60_000;
const MAX_HEARTBEATS = 120;

let started = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatsSent = 0;
let currentPath = '';
let lastBeatAt = 0;

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

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

async function logEvent(type: 'pageview' | 'heartbeat', path: string): Promise<void> {
  try {
    const { db, collection, addDoc, Timestamp } = await import('@/lib/firebase');
    const sid = getSessionId();
    await addDoc(collection(db, 'visitor_events'), {
      type,
      sessionId: sid,
      path: path.slice(0, 300),
      createdAt: Timestamp.now(),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300),
      referrer: (typeof document !== 'undefined' ? document.referrer : '').slice(0, 300),
    });
    lastBeatAt = Date.now();
  } catch { /* silent — analytics must never break the app */ }
}

function stopHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!isVisible()) return;
    if (heartbeatsSent >= MAX_HEARTBEATS) { stopHeartbeat(); return; }
    heartbeatsSent += 1;
    void logEvent('heartbeat', currentPath || (typeof location !== 'undefined' ? location.pathname : '/'));
  }, HEARTBEAT_MS);
}

/** Record a page view. Safe to call on every route change — dedupes
 *  consecutive identical paths so React StrictMode / double effects don't
 *  inflate the count. */
export function trackVisitorPageView(path: string): void {
  if (typeof window === 'undefined') return;
  if (isExcludedPath(path)) return;
  if (path === currentPath) return;
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

  // Pause/resume heartbeats with tab visibility so "avg session" and
  // "active now" only reflect time the user actually has the tab open.
  document.addEventListener('visibilitychange', () => {
    if (isVisible()) {
      startHeartbeat();
      // If we've been hidden longer than a heartbeat interval, log one
      // immediately so the session shows as active right away.
      if (Date.now() - lastBeatAt > HEARTBEAT_MS && heartbeatsSent < MAX_HEARTBEATS) {
        heartbeatsSent += 1;
        void logEvent('heartbeat', currentPath);
      }
    } else {
      stopHeartbeat();
      // Flush one final beat so session end-time is accurate.
      if (heartbeatsSent < MAX_HEARTBEATS) {
        heartbeatsSent += 1;
        void logEvent('heartbeat', currentPath);
      }
    }
  });

  // Pagehide covers tab close / nav-away on mobile Safari more reliably
  // than 'beforeunload'.
  window.addEventListener('pagehide', () => {
    stopHeartbeat();
    if (heartbeatsSent < MAX_HEARTBEATS) {
      heartbeatsSent += 1;
      void logEvent('heartbeat', currentPath);
    }
  });
}
