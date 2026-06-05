/**
 * Login rate-limit / lockout tracker.
 *
 * Records failed login attempts per email in Firestore `loginAttempts`.
 * After MAX_FAILURES within the WINDOW_MS, the email is locked for COOLDOWN_MS.
 *
 * Client-side write — Firestore rules must allow create+update on `loginAttempts`
 * for unauthenticated users (writes are tightly shaped). This is a usability
 * gate, not a single source of truth — server-side enforcement still relies on
 * Firebase Auth's own brute-force protection.
 */
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

export const MAX_FAILURES = 5;
export const COOLDOWN_MS = 15 * 60 * 1000; // 15 min
export const WINDOW_MS = 15 * 60 * 1000;

function emailKey(email: string): string {
  // Deterministic, lower-cased, no @/. for Firestore doc id safety
  return 'email_' + email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 200);
}

export interface LockoutState {
  locked: boolean;
  remainingMs: number;
  failures: number;
}

export async function checkLockout(email: string): Promise<LockoutState> {
  try {
    const ref = doc(db, 'loginAttempts', emailKey(email));
    const snap = await getDoc(ref);
    if (!snap.exists()) return { locked: false, remainingMs: 0, failures: 0 };
    const data = snap.data() as { failures?: number; lockedUntil?: Timestamp };
    const lockedUntilMs = data.lockedUntil?.toMillis() ?? 0;
    const now = Date.now();
    if (lockedUntilMs > now) {
      return { locked: true, remainingMs: lockedUntilMs - now, failures: data.failures ?? 0 };
    }
    return { locked: false, remainingMs: 0, failures: data.failures ?? 0 };
  } catch {
    return { locked: false, remainingMs: 0, failures: 0 };
  }
}

export async function recordFailure(email: string): Promise<LockoutState> {
  try {
    const ref = doc(db, 'loginAttempts', emailKey(email));
    const snap = await getDoc(ref);
    const now = Date.now();
    const prevFailures = snap.exists() ? ((snap.data() as any).failures ?? 0) : 0;
    const prevFirstMs = snap.exists() ? ((snap.data() as any).firstFailureAt?.toMillis?.() ?? now) : now;

    // Reset window if oldest failure is older than WINDOW_MS
    const windowExpired = now - prevFirstMs > WINDOW_MS;
    const failures = windowExpired ? 1 : prevFailures + 1;
    const lockedUntilMs = failures >= MAX_FAILURES ? now + COOLDOWN_MS : 0;

    await setDoc(
      ref,
      {
        emailHash: emailKey(email),
        failures,
        lastFailureAt: serverTimestamp(),
        firstFailureAt: windowExpired ? serverTimestamp() : (snap.data() as any)?.firstFailureAt ?? serverTimestamp(),
        ...(lockedUntilMs ? { lockedUntil: Timestamp.fromMillis(lockedUntilMs) } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return {
      locked: lockedUntilMs > 0,
      remainingMs: lockedUntilMs > 0 ? lockedUntilMs - now : 0,
      failures,
    };
  } catch {
    return { locked: false, remainingMs: 0, failures: 0 };
  }
}

export async function clearFailures(email: string): Promise<void> {
  try {
    const ref = doc(db, 'loginAttempts', emailKey(email));
    await setDoc(
      ref,
      { failures: 0, lockedUntil: null, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch {
    /* ignore */
  }
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
