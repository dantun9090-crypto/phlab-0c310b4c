/**
 * Generic security event logger — used by ErrorBoundary, lockout, idle logout,
 * and the F2 generic error message in production.
 *
 * Writes to Firestore `securityEvents` collection. Fire-and-forget; never throws.
 */
import { db, auth } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type SecurityEventType =
  | 'error_boundary'
  | 'login_lockout'
  | 'admin_login_failure'
  | 'admin_idle_logout'
  | 'admin_login_blocked'
  | 'password_changed'
  | 'session_revoke_request'
  | 'compliance_violation';

export interface SecurityEventInput {
  type: SecurityEventType;
  route?: string | null;
  errorType?: string | null;
  message?: string | null;
  meta?: Record<string, unknown>;
}

function safe(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  return String(s).slice(0, max).replace(/[\r\n\t\u0000-\u001F]+/g, ' ').trim() || null;
}

export function logSecurityEvent(input: SecurityEventInput): void {
  try {
    const route = input.route ?? (typeof window !== 'undefined' ? window.location.pathname : null);
    const userAgent = typeof navigator !== 'undefined' ? safe(navigator.userAgent, 300) : null;
    const uid = auth.currentUser?.uid ?? null;

    const payload = {
      type: input.type,
      route: safe(route, 300),
      userAgent,
      uid,
      errorType: safe(input.errorType ?? null, 120),
      message: safe(input.message ?? null, 500),
      meta: input.meta ?? null,
      // IP is captured server-side via the dedicated server function below
      // when the caller passes it; here client cannot know its public IP.
      createdAt: serverTimestamp(),
    };

    // Fire-and-forget — never block on the write
    addDoc(collection(db, 'securityEvents'), payload).catch(() => {});
  } catch {
    /* logging must never break the app */
  }
}
