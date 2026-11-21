/**
 * Client facade for the server-side login lockout.
 *
 * 2026-11-21: Firestore `loginAttempts` is no longer touched from the
 * browser (rules: read admin-only, write denied) — everything goes through
 * POST /api/public/login-lockout, which owns the counter via the service
 * account. Fail-open by design: any network/endpoint error is treated as
 * "not locked", because Firebase Auth's native throttling is the
 * authoritative brute-force protection underneath this UX gate.
 */

export const MAX_FAILURES = 5;
export const COOLDOWN_MS = 15 * 60 * 1000; // 15 min
export const WINDOW_MS = 15 * 60 * 1000;

export interface LockoutState {
  locked: boolean;
  remainingMs: number;
  failures: number;
}

const OPEN: LockoutState = { locked: false, remainingMs: 0, failures: 0 };

async function callEndpoint(action: 'check' | 'fail' | 'clear', email: string): Promise<LockoutState> {
  try {
    const res = await fetch('/api/public/login-lockout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, email }),
    });
    if (!res.ok) return OPEN;
    const d = (await res.json()) as Partial<LockoutState>;
    return {
      locked: d.locked === true,
      remainingMs: typeof d.remainingMs === 'number' ? d.remainingMs : 0,
      failures: typeof d.failures === 'number' ? d.failures : 0,
    };
  } catch {
    return OPEN;
  }
}

export function checkLockout(email: string): Promise<LockoutState> {
  return callEndpoint('check', email);
}

export function recordFailure(email: string): Promise<LockoutState> {
  return callEndpoint('fail', email);
}

export async function clearFailures(email: string): Promise<void> {
  await callEndpoint('clear', email);
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
