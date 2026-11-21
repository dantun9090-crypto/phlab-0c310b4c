/**
 * Server-side login lockout — pure state machine (no I/O).
 *
 * 2026-11-21: the previous lockout lived entirely in the browser. Reads of
 * `loginAttempts` were admin-only while the login form ran anonymously, so
 * every check failed open and the gate silently never engaged. The counter
 * is now owned by /api/public/login-lockout via the service account; these
 * pure functions are the single source of truth for the window/cooldown
 * logic and are pinned by tests/login-lockout-core.test.ts.
 */

export const MAX_FAILURES = 5;
export const COOLDOWN_MS = 15 * 60 * 1000; // lock duration
export const WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count
export const MIN_FAILURE_INTERVAL_MS = 3_000; // scripted-flood brake

export interface LockoutDocShape {
  failures?: number;
  firstFailureAtMs?: number | null;
  lastFailureAtMs?: number | null;
  lockedUntilMs?: number | null;
}

export interface LockoutState {
  locked: boolean;
  remainingMs: number;
  failures: number;
}

/** Deterministic doc id per email — MUST match the legacy client scheme. */
export function emailKey(email: string): string {
  return 'email_' + email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 200);
}

export function evaluate(doc: LockoutDocShape | null, nowMs: number): LockoutState {
  if (!doc) return { locked: false, remainingMs: 0, failures: 0 };
  const lockedUntil = doc.lockedUntilMs ?? 0;
  if (lockedUntil > nowMs) {
    return { locked: true, remainingMs: lockedUntil - nowMs, failures: doc.failures ?? 0 };
  }
  return { locked: false, remainingMs: 0, failures: doc.failures ?? 0 };
}

export interface FailureComputation {
  state: LockoutState;
  /** null = do not write (locked already, or below the flood interval). */
  patch: Record<string, unknown> | null;
}

export function nextFailure(doc: LockoutDocShape | null, nowMs: number): FailureComputation {
  // Never extend an active lock — a lock can therefore never exceed
  // COOLDOWN_MS no matter how hard someone hammers the endpoint.
  if (doc && (doc.lockedUntilMs ?? 0) > nowMs) {
    return { state: evaluate(doc, nowMs), patch: null };
  }

  // Scripted-flood brake: real wrong-password attempts take seconds each;
  // increments faster than this are a bot hitting the endpoint directly.
  const lastMs = doc?.lastFailureAtMs ?? null;
  if (lastMs != null && nowMs - lastMs < MIN_FAILURE_INTERVAL_MS) {
    return { state: evaluate(doc, nowMs), patch: null };
  }

  const firstMs = doc?.firstFailureAtMs ?? null;
  const windowExpired = firstMs == null || nowMs - firstMs > WINDOW_MS;
  const failures = windowExpired ? 1 : (doc?.failures ?? 0) + 1;
  const locked = failures >= MAX_FAILURES;

  return {
    state: { locked, remainingMs: locked ? COOLDOWN_MS : 0, failures },
    patch: {
      failures,
      firstFailureAt: new Date(windowExpired || firstMs == null ? nowMs : firstMs),
      lastFailureAt: new Date(nowMs),
      lockedUntil: locked ? new Date(nowMs + COOLDOWN_MS) : null,
      updatedAt: new Date(nowMs),
    },
  };
}
