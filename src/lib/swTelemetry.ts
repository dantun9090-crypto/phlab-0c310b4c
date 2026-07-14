// SW / cache / hydration telemetry.
//
// Fire-and-forget Firestore logger so we can see how often visitors hit the
// "Update available" overlay, the blank-watchdog fallback, build-ID
// mismatches, and whether the Clear-Cache-and-Reload flow actually recovers.
//
// Events land in Firestore collection `sw_telemetry` (locked-shape rule —
// anon CREATE, admin READ). Correlated with Admin → Purge Incidents.

// Firebase is dynamically imported inside persist() so the entry chunk
// does NOT statically pull in `@/lib/firebase` (1719 lines) and the
// `vendor-firebase` chunk (~507 KB firebase SDK). swTelemetry writes are
// fire-and-forget and only run after user interaction / build-mismatch
// detection, so lazy-loading Firestore here has no user-visible impact.

export type SwTelemetryEvent =
  | 'sw_stale_reload_shown'
  | 'sw_stale_reload_accepted'
  | 'sw_stale_reload_dismissed'
  | 'sw_hydration_fallback_shown'
  | 'sw_cache_reset_clicked'
  | 'sw_cache_reset_success'
  | 'sw_build_mismatch'
  | 'sw_hydration_error';

const SESSION_KEY = 'phl-session-id';
const BUFFER_KEY = 'phl-sw-tel-buffer';
const RESET_PENDING_KEY = 'phl-sw-cache-reset-pending';
const LAST_BUILD_KEY = 'phl-last-build-id';

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'no-session';
  }
}

function currentBuildId(): string {
  try {
    const w = window as unknown as { __BUILD_ID__?: string };
    if (typeof w.__BUILD_ID__ === 'string') return w.__BUILD_ID__;
    const meta = document.querySelector('meta[name="x-build-id"]');
    return (meta?.getAttribute('content') || 'unknown').slice(0, 64);
  } catch {
    return 'unknown';
  }
}

interface BufferedEvent {
  event: SwTelemetryEvent;
  ts: number;
  buildId: string;
  url: string;
  ua: string;
  sessionId: string;
  extra?: Record<string, string | number | boolean | null>;
}

function readBuffer(): BufferedEvent[] {
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as BufferedEvent[]) : [];
  } catch {
    return [];
  }
}

function writeBuffer(items: BufferedEvent[]): void {
  try {
    sessionStorage.setItem(BUFFER_KEY, JSON.stringify(items.slice(-20)));
  } catch {
    /* ignore */
  }
}

export interface SwTelemetryDebugStats {
  queueSize: number;
  lastFlushAt: number | null;
  lastFlushStatus: 'idle' | 'ok' | 'error' | 'buffered';
  lastFlushError: string | null;
  lastEventAt: number | null;
  lastEvent: SwTelemetryEvent | null;
  writes: number;
  failures: number;
  sessionId: string;
  buildId: string;
}

const stats: SwTelemetryDebugStats = {
  queueSize: 0,
  lastFlushAt: null,
  lastFlushStatus: 'idle',
  lastFlushError: null,
  lastEventAt: null,
  lastEvent: null,
  writes: 0,
  failures: 0,
  sessionId: '',
  buildId: '',
};

function notifyStats() {
  try {
    stats.queueSize = readBuffer().length;
    window.dispatchEvent(new CustomEvent('phl-sw-tel-stats', { detail: { ...stats } }));
  } catch { /* ignore */ }
}

export function getSwTelemetryDebugStats(): SwTelemetryDebugStats {
  try {
    stats.queueSize = readBuffer().length;
    stats.sessionId = getSessionId();
    stats.buildId = currentBuildId();
  } catch { /* ignore */ }
  return { ...stats };
}

async function persist(ev: BufferedEvent): Promise<void> {
  try {
    const [{ addDoc, collection, serverTimestamp }, { db }] = await Promise.all([
      import('firebase/firestore'),
      import('@/lib/firebase'),
    ]);
    await addDoc(collection(db, 'sw_telemetry'), {
      event: ev.event,
      clientTs: ev.ts,
      buildId: ev.buildId,
      url: ev.url.slice(0, 500),
      userAgent: ev.ua.slice(0, 300),
      sessionId: ev.sessionId,
      extra: ev.extra ? JSON.stringify(ev.extra).slice(0, 500) : null,
      createdAt: serverTimestamp(),
    });
    stats.writes += 1;
    stats.lastFlushAt = Date.now();
    stats.lastFlushStatus = 'ok';
    stats.lastFlushError = null;
    notifyStats();
  } catch (err) {
    stats.failures += 1;
    stats.lastFlushAt = Date.now();
    stats.lastFlushStatus = 'error';
    stats.lastFlushError = String((err as Error)?.message || err).slice(0, 240);
    notifyStats();
    throw err;
  }
}

export function logSwTelemetry(
  event: SwTelemetryEvent,
  extra?: Record<string, string | number | boolean | null>,
): void {
  if (typeof window === 'undefined') return;
  const item: BufferedEvent = {
    event,
    ts: Date.now(),
    buildId: currentBuildId(),
    url: location.href,
    ua: navigator.userAgent || '',
    sessionId: getSessionId(),
    extra,
  };
  stats.lastEvent = event;
  stats.lastEventAt = item.ts;
  try {
    console.info('[sw-telemetry]', event, extra || '');
  } catch {
    /* ignore */
  }
  persist(item).catch(() => {
    // Buffer for next page load if Firestore is unreachable
    const buf = readBuffer();
    buf.push(item);
    writeBuffer(buf);
    stats.lastFlushStatus = 'buffered';
    notifyStats();
  });
}

function flushBuffer(): void {
  const buf = readBuffer();
  if (buf.length === 0) return;
  writeBuffer([]);
  for (const item of buf) {
    persist(item).catch(() => {
      // Re-buffer single item, don't loop infinitely
      const cur = readBuffer();
      cur.push(item);
      writeBuffer(cur);
      stats.lastFlushStatus = 'buffered';
      notifyStats();
    });
  }
}

/**
 * Run once early in client boot. Detects:
 *   - build-id mismatch (last seen vs current)
 *   - successful clear-cache-and-reload (?_r=… present + pending flag)
 *   - flushes any buffered events from previous session
 */
export function initSwTelemetry(): void {
  if (typeof window === 'undefined') return;

  // Expose for inline recovery scripts in __root.tsx (which can't import ESM).
  try {
    (window as unknown as {
      __phlSwTelemetry?: (e: SwTelemetryEvent, x?: Record<string, string | number | boolean | null>) => void;
    }).__phlSwTelemetry = (e, x) => logSwTelemetry(e, x);
  } catch {
    /* ignore */
  }

  // Build-id mismatch detection
  try {
    const current = currentBuildId();
    const last = localStorage.getItem(LAST_BUILD_KEY);
    if (last && current && current !== 'unknown' && last !== current) {
      logSwTelemetry('sw_build_mismatch', { previous: last, current });
    }
    if (current && current !== 'unknown') {
      localStorage.setItem(LAST_BUILD_KEY, current);
    }
  } catch {
    /* ignore */
  }

  // Cache-reset success detection: hardReloadClean sets `?_r=…` and stores a
  // pending flag. If both are present on this load → recovery worked.
  try {
    const params = new URLSearchParams(location.search);
    const cameFromReset = params.has('_r') || params.has('fresh');
    const pending = sessionStorage.getItem(RESET_PENDING_KEY);
    if (cameFromReset && pending) {
      logSwTelemetry('sw_cache_reset_success', { token: pending.slice(0, 32) });
      sessionStorage.removeItem(RESET_PENDING_KEY);
    }
  } catch {
    /* ignore */
  }

  // Flush any buffered events that failed to send last session
  setTimeout(flushBuffer, 2000);
}

/** Helper for inline scripts that trigger hardReloadClean — marks a pending
 *  reset so the next page load can confirm success. */
export function markCacheResetPending(): void {
  try {
    sessionStorage.setItem(RESET_PENDING_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
