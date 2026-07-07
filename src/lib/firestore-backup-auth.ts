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

export function _resetFailureTrackerForTests(): void {
  failures.length = 0;
}
