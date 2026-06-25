// Admin toast audit logger.
// Records each Live Activity toast attempt (delivered or suppressed) so we
// can debug quiet-hours / dedup behavior from the Audit Log tab.
//
// Writes are best-effort: failures must never break the UI.

import { auth, db, collection, addDoc, Timestamp } from '@/lib/firebase';

export type ToastKind = 'signup' | 'visitor';
export type ToastOutcome =
  | 'delivered'
  | 'suppressed:pref-off'
  | 'suppressed:quiet-hours'
  | 'suppressed:dedup'
  | 'suppressed:bot';

export interface ToastAuditEntry {
  kind: ToastKind;
  outcome: ToastOutcome;
  title: string;
  description?: string;
  /** Stable identity used for dedup (visitorId or sessionId or uid). */
  targetId?: string;
  /** Snapshot of relevant prefs for replay. */
  prefsSnapshot?: {
    notifySignups: boolean;
    notifyFirstSeen: boolean;
    quietEnabled: boolean;
    quietStart: string;
    quietEnd: string;
    quietTimezone: string;
    hideBots?: boolean;
    treatForceHideBadgeAsBot?: boolean;
  };
  /** Why a session was classified as a bot (when outcome=suppressed:bot). */
  botReasons?: string[];
}

export async function logToastEvent(entry: ToastAuditEntry): Promise<void> {
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, 'toastAuditLogs'), {
      ...entry,
      adminUid: user?.uid ?? null,
      adminEmail: user?.email ?? null,
      timestamp: Timestamp.now(),
      tzLocal: typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[toast-audit] write failed', entry.outcome, err);
  }
}
