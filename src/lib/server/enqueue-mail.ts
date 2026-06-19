/**
 * Idempotent mail enqueue for the Firebase Trigger-Email extension.
 *
 * Writes to the `mail` collection with a DETERMINISTIC document ID so the
 * same logical send (e.g. "payment confirmed for order PHP-XXX") cannot
 * be double-enqueued when multiple paths fire — the Wallid webhook, the
 * /api/payments/status poller, and the reconcile cron all race on a
 * successful payment, and without idempotency the user gets 2–3 copies of
 * the same email.
 *
 * Firestore REST returns 409 ALREADY_EXISTS when a document with the same
 * id already exists — we swallow that one error and treat it as success.
 * Any other failure is rethrown so the caller can log.
 *
 * Server-only: bypasses Firestore security rules via the admin SDK path.
 */
import { addDocAdmin } from "./firestore-admin";

export interface MailPayload {
  to: string;
  message: { subject: string; html: string; text: string };
  source?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

export async function enqueueMailOnce(
  docId: string,
  payload: MailPayload,
): Promise<{ enqueued: boolean; duplicate: boolean }> {
  // Sanitise the id — Firestore doc ids must not contain "/" or be empty.
  const safeId = docId.replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 1500);
  try {
    await addDocAdmin(
      "mail",
      {
        ...payload,
        createdAt: new Date(),
      },
      safeId,
    );
    return { enqueued: true, duplicate: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Firestore REST returns 409 ALREADY_EXISTS when documentId collides.
    if (/409/.test(msg) || /ALREADY_EXISTS/i.test(msg)) {
      return { enqueued: false, duplicate: true };
    }
    throw err;
  }
}
