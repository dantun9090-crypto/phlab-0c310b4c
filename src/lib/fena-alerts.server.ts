/**
 * Fena integration alerting.
 *
 * Records structured alerts to the `fena_alerts` Firestore collection AND
 * enqueues an admin email via the Trigger Email extension (`mail`
 * collection). Throttled per-code so a single outage doesn't flood the
 * inbox.
 *
 * Server-only — never import from client code.
 *
 * Usage:
 *   await raiseFenaAlert("fena_refetch_failed", "error", {
 *     fenaPaymentId, error: e.message,
 *   });
 */
import { addDocAdmin, getDocAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";

export type FenaAlertSeverity = "warn" | "error" | "critical";

export type FenaAlertCode =
  | "fena_refetch_failed"
  | "fena_order_update_failed"
  | "fena_bank_account_write_failed"
  | "fena_webhook_unverified"
  | "fena_orphan_payment"
  | "fena_credentials_missing"
  | "fena_quota_warning"
  | "fena_quota_429"
  | "fena_retry_exhausted";

const THROTTLE_MS = 30 * 60 * 1000; // 30 min between emails per code

function adminEmail(): string {
  return (
    process.env.ADMIN_ALERT_EMAIL?.trim() ||
    process.env.INFO_MAILBOX_EMAIL?.trim() ||
    "info@phlabs.co.uk"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Record an alert. Always writes to `fena_alerts`. Sends email only if
 * the same code hasn't been emailed in the last 30 minutes (best-effort —
 * Firestore read failures fall back to "send anyway" so we never drop
 * a critical alert silently).
 */
export async function raiseFenaAlert(
  code: FenaAlertCode,
  severity: FenaAlertSeverity,
  ctx: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Always persist the alert row.
  try {
    await addDocAdmin("fena_alerts", {
      code,
      severity,
      ctx,
      createdAt: now,
      createdAtIso: nowIso,
      acknowledged: false,
    });
  } catch {
    // Never let alert logging crash the caller.
  }

  // 2) Throttled email. Track latest send timestamp per code in
  //    `fena_alert_throttles/{code}`.
  let shouldEmail = true;
  try {
    const throttle = await getDocAdmin("fena_alert_throttles", code);
    const last =
      throttle && typeof throttle.lastSentAt === "string"
        ? Date.parse(throttle.lastSentAt)
        : 0;
    if (last && now.getTime() - last < THROTTLE_MS) {
      shouldEmail = false;
    }
  } catch {
    // proceed — better an extra email than a missed alert
  }

  if (!shouldEmail) return;

  const to = adminEmail();
  if (!to) return;

  const ctxJson = JSON.stringify(ctx, null, 2);
  const subjectPrefix =
    severity === "critical" ? "[CRITICAL]" : severity === "error" ? "[ERROR]" : "[WARN]";

  try {
    await addDocAdmin("mail", {
      to,
      message: {
        subject: `${subjectPrefix} Fena integration: ${code}`,
        html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">
          <h2 style="color:${severity === "warn" ? "#f59e0b" : "#dc2626"}">Fena alert: ${escapeHtml(code)}</h2>
          <p><strong>Severity:</strong> ${escapeHtml(severity)}<br>
             <strong>Time:</strong> ${escapeHtml(nowIso)}</p>
          <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;overflow:auto;font-size:12px">${escapeHtml(ctxJson)}</pre>
          <p style="color:#64748b;font-size:12px">
            Admin panel → Fena tab → "Integration status" for context.<br>
            Further alerts for <code>${escapeHtml(code)}</code> are throttled for 30 minutes.
          </p>
        </body></html>`,
        text: `Fena alert [${severity}] ${code}\n${nowIso}\n\n${ctxJson}`,
      },
      createdAt: now,
      source: "fena:alert",
    });

    // PATCH on a missing doc creates it (Firestore REST upsert via updateMask).
    await updateDocAdmin("fena_alert_throttles", code, {
      code,
      lastSentAt: nowIso,
      lastSeverity: severity,
    }).catch(() => undefined);
  } catch {
    // mail failure already logged via Firestore alert row.
  }
}
