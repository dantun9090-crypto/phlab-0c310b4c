/**
 * Structured Firebase Auth event logger.
 *
 * Records every login / register / Google SSO / logout / password reset
 * attempt — success AND failure — into the `auth_events` Firestore collection
 * and the browser console with a stable shape.
 *
 * Read by Admin → Auth Events tab. Writes are open (so unauthenticated failed
 * logins still log) but Firestore rules pin the document shape and ban edits.
 *
 * Never include the password / OAuth token in the payload.
 */

import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type AuthEventType =
  | 'login_success'
  | 'login_failure'
  | 'register_success'
  | 'register_failure'
  | 'google_success'
  | 'google_failure'
  | 'password_reset_request'
  | 'password_reset_failure'
  | 'logout'
  | 'auth_state_signed_in'
  | 'auth_state_signed_out';

export interface AuthEventInput {
  type: AuthEventType;
  email?: string | null;
  uid?: string | null;
  /** Firebase auth error code, e.g. `auth/invalid-credential` */
  code?: string | null;
  /** Short, non-sensitive human message — never include passwords */
  message?: string | null;
  /** Where the event was triggered (route, e.g. `/login`) */
  source?: string | null;
}

/** Bound to a small allowlist — extra keys are silently dropped. */
const ALLOWED_TYPES: ReadonlySet<AuthEventType> = new Set<AuthEventType>([
  'login_success',
  'login_failure',
  'register_success',
  'register_failure',
  'google_success',
  'google_failure',
  'password_reset_request',
  'password_reset_failure',
  'logout',
  'auth_state_signed_in',
  'auth_state_signed_out',
]);

function safe(str: string | null | undefined, max: number): string | null {
  if (!str) return null;
  const trimmed = String(str).slice(0, max);
  // Strip newlines / control chars that could mess up console output
  return trimmed.replace(/[\r\n\t\u0000-\u001F]+/g, ' ').trim() || null;
}

function pickUA(): string | null {
  if (typeof navigator === 'undefined') return null;
  return safe(navigator.userAgent, 300);
}

function pickPath(): string | null {
  if (typeof window === 'undefined') return null;
  return safe(window.location.pathname + window.location.search, 200);
}

/**
 * Log an auth event. Fire-and-forget — never throws, never blocks the caller.
 */
export function logAuthEvent(input: AuthEventInput): void {
  try {
    if (!ALLOWED_TYPES.has(input.type)) return;

    const payload = {
      type: input.type,
      email: safe(input.email ?? null, 320),
      uid: safe(input.uid ?? null, 64),
      code: safe(input.code ?? null, 100),
      message: safe(input.message ?? null, 300),
      source: safe(input.source ?? pickPath(), 200),
      userAgent: pickUA(),
      // Server-side timestamp — protects against client clock skew
      createdAt: serverTimestamp(),
    };

    // Console log with consistent shape — makes DevTools triage trivial
    const tag = input.type.startsWith('login_failure') || input.type.endsWith('_failure')
      ? 'warn'
      : 'log';
    // eslint-disable-next-line no-console
    console[tag](
      `[auth-event] ${payload.type}`,
      {
        email: payload.email,
        uid: payload.uid,
        code: payload.code,
        message: payload.message,
        source: payload.source,
        ts: new Date().toISOString(),
      },
    );

    // Fire-and-forget Firestore write — don't await, don't block UX
    addDoc(collection(db, 'auth_events'), payload).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[auth-event] Firestore write failed', e?.code || e?.message || e);
    });
  } catch (e) {
    // Logging must NEVER break auth flow
    // eslint-disable-next-line no-console
    console.warn('[auth-event] logger crashed', e);
  }
}

/** Convenience helper for catch blocks — extracts code + message from a Firebase error. */
export function logAuthFailure(
  type: Extract<AuthEventType, `${string}_failure`>,
  err: unknown,
  extra: Pick<AuthEventInput, 'email' | 'uid' | 'source'> = {},
): void {
  const e = err as { code?: string; message?: string } | undefined;
  logAuthEvent({
    type,
    code: e?.code ?? 'unknown',
    message: e?.message ?? 'Unknown error',
    ...extra,
  });
}
