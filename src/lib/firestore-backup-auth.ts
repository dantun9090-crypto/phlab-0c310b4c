/**
 * Auth verification + failure-spike tracker for the Firestore backup trigger.
 *
 * Split out of the route file so it can be unit-tested without pulling in
 * TanStack route wiring or the Supabase admin client.
 *
 * Least-privilege note: the Google service account behind
 * `triggerFirestoreExport` MUST have ONLY `roles/datastore.importExportAdmin`
 * scoped to the target GCS bucket. This code path never writes Firestore
 * documents outside `backup_audit_log` and `securityEvents`, and never
 * writes Supabase rows outside `firestore_backups`.
 */

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult =
  | { ok: true; method: "apikey" | "cron_secret" }
  | { ok: false; status: number; reason: "missing" | "invalid" };

export interface BackupAuthEnv {
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  CLEANUP_SECRET?: string;
}

/**
 * Accept ONLY:
 *   1. `apikey` header EXACT match (timing-safe) against the configured
 *      Supabase publishable/anon key — this is the pg_cron path.
 *   2. `x-cron-secret` header EXACT match against CLEANUP_SECRET — this is
 *      the manual curl / GitHub Actions path.
 * Every other value is rejected with 401. Any non-empty string used to be
 * accepted here — do not regress that behaviour.
 */
export function verifyBackupCaller(
  request: Request,
  env: BackupAuthEnv,
): VerifyResult {
  const apikey = request.headers.get("apikey");
  const secret = request.headers.get("x-cron-secret");
  if (!apikey && !secret) return { ok: false, status: 401, reason: "missing" };

  if (apikey) {
    const expectedKeys = [
      env.SUPABASE_PUBLISHABLE_KEY,
      env.SUPABASE_ANON_KEY,
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ].filter((v): v is string => typeof v === "string" && v.length > 0);
    if (expectedKeys.some((k) => timingSafeStringEqual(apikey, k))) {
      return { ok: true, method: "apikey" };
    }
  }
  if (secret) {
    const expected = env.CLEANUP_SECRET;
    if (expected && timingSafeStringEqual(secret, expected)) {
      return { ok: true, method: "cron_secret" };
    }
  }
  return { ok: false, status: 401, reason: "invalid" };
}

/**
 * In-isolate ring buffer of recent failure timestamps. When 3+ failures
 * land in a 15 minute window, `noteFailure` returns true so the caller
 * can emit a spike alert into `securityEvents`. Cleared as entries age out.
 */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FAILURE_THRESHOLD = 3;
const failures: number[] = [];

export function noteBackupFailure(now: number = Date.now()): {
  count: number;
  spike: boolean;
} {
  const cutoff = now - FAILURE_WINDOW_MS;
  while (failures.length && failures[0] < cutoff) failures.shift();
  failures.push(now);
  return { count: failures.length, spike: failures.length >= FAILURE_THRESHOLD };
}

/**
 * Per-IP temporary lockout for repeated bad-auth on this endpoint.
 *
 * Counts bad-auth events per IP inside `BAD_AUTH_WINDOW_MS`. If an IP hits
 * `BAD_AUTH_THRESHOLD` inside the window, it is locked out for
 * `LOCKOUT_MS`. Runs per-Worker isolate — an attacker hitting many POPs
 * gets independent counters, so pair with the existing bad-auth rate
 * limiter (which returns 429) for a broader signal.
 */
const BAD_AUTH_WINDOW_MS = 10 * 60 * 1000;
const BAD_AUTH_THRESHOLD = 5;
const LOCKOUT_MS = 30 * 60 * 1000;
const MAX_TRACKED_IPS = 5_000;

interface IpState {
  events: number[]; // recent bad-auth timestamps inside window
  lockedUntil: number; // 0 when not locked
}

const ipStates = new Map<string, IpState>();

function gcIpStates(now: number): void {
  if (ipStates.size < MAX_TRACKED_IPS) return;
  let toDrop = Math.ceil(MAX_TRACKED_IPS / 10);
  for (const [key, s] of ipStates) {
    if (toDrop-- <= 0) break;
    if (s.lockedUntil <= now && s.events.every((t) => t < now - BAD_AUTH_WINDOW_MS)) {
      ipStates.delete(key);
    }
  }
}

export interface LockoutStatus {
  locked: boolean;
  lockedUntil: number;
  retryAfterSec: number;
  recentBadAuth: number;
}

/** Read-only check — does NOT record an event. */
export function checkIpLockout(ip: string, now: number = Date.now()): LockoutStatus {
  const s = ipStates.get(ip);
  if (!s) return { locked: false, lockedUntil: 0, retryAfterSec: 0, recentBadAuth: 0 };
  if (s.lockedUntil > now) {
    return {
      locked: true,
      lockedUntil: s.lockedUntil,
      retryAfterSec: Math.ceil((s.lockedUntil - now) / 1000),
      recentBadAuth: s.events.length,
    };
  }
  return { locked: false, lockedUntil: 0, retryAfterSec: 0, recentBadAuth: s.events.length };
}

/**
 * Record a bad-auth event for `ip` and return the resulting lockout status.
 * When the threshold trips, `justLocked=true` so the caller can fire a
 * one-shot alert instead of re-firing on every subsequent request.
 */
export function noteBadAuth(
  ip: string,
  now: number = Date.now(),
): LockoutStatus & { justLocked: boolean } {
  gcIpStates(now);
  const cutoff = now - BAD_AUTH_WINDOW_MS;
  const s = ipStates.get(ip) ?? { events: [], lockedUntil: 0 };
  while (s.events.length && s.events[0] < cutoff) s.events.shift();
  s.events.push(now);

  let justLocked = false;
  if (s.lockedUntil <= now && s.events.length >= BAD_AUTH_THRESHOLD) {
    s.lockedUntil = now + LOCKOUT_MS;
    justLocked = true;
  }
  ipStates.set(ip, s);

  return {
    locked: s.lockedUntil > now,
    lockedUntil: s.lockedUntil,
    retryAfterSec: s.lockedUntil > now ? Math.ceil((s.lockedUntil - now) / 1000) : 0,
    recentBadAuth: s.events.length,
    justLocked,
  };
}

export const BACKUP_LOCKOUT_CONFIG = Object.freeze({
  BAD_AUTH_WINDOW_MS,
  BAD_AUTH_THRESHOLD,
  LOCKOUT_MS,
});

export function _resetFailureTrackerForTests(): void {
  failures.length = 0;
  ipStates.clear();
}

