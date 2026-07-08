/**
 * Webhook attempt logging + throttled alerting for the Wallid endpoint.
 *
 * Two responsibilities:
 *   1. Record every POST to `/api/webhooks/wallid` (accepted or rejected)
 *      into `wallid_webhook_attempts` so admins can see which deliveries
 *      failed, why, and how long they took.
 *   2. Fire a Telegram alert on infrastructure-level failures (invalid
 *      signature, DB insert failure, retryable 503, missing secret,
 *      timeout) using `wallid_alert_state` as a per-alert-type throttle
 *      so we don't spam the on-call channel.
 *
 * All calls are best-effort — logging or alert failures must never
 * propagate into the webhook response.
 */
export type WebhookOutcome =
  | "accepted"
  | "rate_limited"
  | "no_secret"
  | "invalid_body"
  | "invalid_json"
  | "missing_timestamp"
  | "stale_timestamp"
  | "invalid_signature"
  | "event_insert_failed"
  | "retryable_error"
  | "handler_exception";

const ALERT_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes per alert type
const DIGEST_INTERVAL_MS = 60 * 60 * 1000; // 1 hour rollup while active

export interface WebhookAttemptLog {
  route?: string;
  ip?: string | null;
  userAgent?: string | null;
  sigHeaderName?: string | null;
  timestampHeader?: string | null;
  eventIdHeader?: string | null;
  eventCount?: number | null;
  contentLength?: number | null;
  outcome: WebhookOutcome;
  httpStatus: number;
  durationMs: number;
  errorMessage?: string | null;
  notes?: Record<string, unknown> | null;
}

/** Fire-and-forget insert into `wallid_webhook_attempts`. Never throws. */
export async function logWebhookAttempt(log: WebhookAttemptLog): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wallid_webhook_attempts").insert({
      route: log.route ?? "/api/webhooks/wallid",
      ip: log.ip ?? null,
      user_agent: log.userAgent ? log.userAgent.slice(0, 400) : null,
      sig_header_name: log.sigHeaderName ?? null,
      timestamp_header: log.timestampHeader ?? null,
      event_id_header: log.eventIdHeader ?? null,
      event_count: log.eventCount ?? null,
      content_length: log.contentLength ?? null,
      outcome: log.outcome,
      http_status: log.httpStatus,
      duration_ms: log.durationMs,
      error_message: log.errorMessage ? log.errorMessage.slice(0, 2000) : null,
      notes: (log.notes as never) ?? null,
    });
  } catch (e) {
    console.warn(
      "[webhook-alerts] logWebhookAttempt failed:",
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Fire a Telegram alert for a webhook-level failure. Throttled per
 * `alertType` via `wallid_alert_state`:
 *   - First failure in a window → send alert, mark active=true.
 *   - Subsequent failures within 15 min → only bump last_count.
 *   - Every hour while still active → send a digest with the count.
 *
 * `alertType` should be a stable slug (e.g. "webhook_invalid_signature").
 */
export async function alertWebhookIssue(
  alertType: string,
  headline: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTelegramAlert } = await import("@/lib/server/telegram-alert");
    const now = new Date();

    const { data: state } = await supabaseAdmin
      .from("wallid_alert_state")
      .select("*")
      .eq("alert_type", alertType)
      .maybeSingle();

    const lastAlertAt = state?.last_alert_at ? new Date(state.last_alert_at as string).getTime() : 0;
    const lastDigestAt = state?.last_digest_at ? new Date(state.last_digest_at as string).getTime() : 0;
    const active = Boolean(state?.active);
    const sinceLast = now.getTime() - lastAlertAt;
    const sinceDigest = now.getTime() - lastDigestAt;

    const shouldSendFresh = !active || sinceLast >= ALERT_THROTTLE_MS;
    const shouldSendDigest = active && !shouldSendFresh && sinceDigest >= DIGEST_INTERVAL_MS;

    const nextCount = (state?.last_count ?? 0) + 1;

    if (shouldSendFresh) {
      const text = formatAlertText(alertType, headline, meta, { fresh: true, count: nextCount });
      await sendTelegramAlert(text);
      await supabaseAdmin.from("wallid_alert_state").upsert(
        {
          alert_type: alertType,
          active: true,
          last_count: nextCount,
          first_alert_at: state?.first_alert_at ?? now.toISOString(),
          last_alert_at: now.toISOString(),
          last_digest_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "alert_type" },
      );
      return;
    }

    if (shouldSendDigest) {
      const text = formatAlertText(alertType, headline, meta, { fresh: false, count: nextCount });
      await sendTelegramAlert(text);
      await supabaseAdmin
        .from("wallid_alert_state")
        .update({
          last_count: nextCount,
          last_digest_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("alert_type", alertType);
      return;
    }

    // Suppressed — bump the count so the next digest reflects reality.
    await supabaseAdmin
      .from("wallid_alert_state")
      .update({ last_count: nextCount, updated_at: now.toISOString() })
      .eq("alert_type", alertType);
  } catch (e) {
    console.warn(
      "[webhook-alerts] alertWebhookIssue failed:",
      e instanceof Error ? e.message : e,
    );
  }
}

/** Mark an alert type as resolved (called when a webhook succeeds again). */
export async function clearWebhookAlert(alertType: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: state } = await supabaseAdmin
      .from("wallid_alert_state")
      .select("active")
      .eq("alert_type", alertType)
      .maybeSingle();
    if (!state?.active) return;
    await supabaseAdmin
      .from("wallid_alert_state")
      .update({
        active: false,
        last_resolved_at: new Date().toISOString(),
        last_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("alert_type", alertType);
    // Optional recovery ping.
    const { sendTelegramAlert } = await import("@/lib/server/telegram-alert");
    await sendTelegramAlert(`✅ <b>Wallid webhook recovered</b>\n<code>${alertType}</code>`);
  } catch {
    /* non-blocking */
  }
}

function formatAlertText(
  alertType: string,
  headline: string,
  meta: Record<string, unknown> | undefined,
  ctx: { fresh: boolean; count: number },
): string {
  const prefix = ctx.fresh ? "🚨 <b>Wallid webhook failure</b>" : "📊 <b>Wallid webhook — still failing</b>";
  const lines = [
    prefix,
    `<code>${alertType}</code>`,
    headline,
    `Occurrences (since first alert): <b>${ctx.count}</b>`,
  ];
  if (meta && Object.keys(meta).length > 0) {
    const short = Object.entries(meta)
      .slice(0, 8)
      .map(([k, v]) => `• ${escapeHtml(k)}: <code>${escapeHtml(String(v)).slice(0, 120)}</code>`)
      .join("\n");
    lines.push(short);
  }
  lines.push(
    `<a href="https://phlabs.co.uk/admin?tab=paymenttriage">Open Payment Triage</a>`,
  );
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
