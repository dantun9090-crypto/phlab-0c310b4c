/**
 * Wallid alerting fan-out.
 *
 * Posts a single structured alert through a graceful fallback chain:
 *   1. Slack incoming webhook  (SLACK_PAYMENTS_WEBHOOK)
 *   2. Discord webhook         (DISCORD_PAYMENTS_WEBHOOK)
 *   3. Admin email             (enqueueMailOnce, idempotent per hour)
 *
 * Each sink is skipped silently if its env var is missing — keeps dev/CI
 * quiet without throwing. Email is always attempted on full-channel
 * failure so a real incident never disappears.
 *
 * Server-only — never import from client code.
 */

const ADMIN_ALERT_EMAIL = "orders@phlabs.co.uk";
const ADMIN_LINK = "https://phlabs.co.uk/admin/payments";

export type WallidAlertType =
  | "stuck_orders"
  | "needs_review"
  | "rescue_load"
  | "webhook_errors"
  | "rate_limit_attack";

export type WallidAlertSeverity = "info" | "warn" | "critical";

export interface WallidAlertPayload {
  type: WallidAlertType;
  severity: WallidAlertSeverity;
  title: string;
  summary: string;
  stuckCount?: number;
  orderIds?: string[];
  lastWebhookAt?: string | null;
  resolved?: boolean;
  extra?: Record<string, unknown>;
}

function color(p: WallidAlertPayload): string {
  if (p.resolved) return "good";
  if (p.severity === "critical") return "danger";
  if (p.severity === "warn") return "warning";
  return "#3b82f6";
}

function discordColor(p: WallidAlertPayload): number {
  if (p.resolved) return 0x22c55e;
  if (p.severity === "critical") return 0xef4444;
  if (p.severity === "warn") return 0xf59e0b;
  return 0x3b82f6;
}

function buildSlackPayload(p: WallidAlertPayload) {
  const icon = p.resolved ? "✅" : p.severity === "critical" ? "🚨" : "⚠️";
  const fields: Array<{ title: string; value: string; short: boolean }> = [
    { title: "Alert Type", value: p.type, short: true },
    { title: "Severity", value: p.severity, short: true },
  ];
  if (typeof p.stuckCount === "number") {
    fields.push({ title: "Count", value: String(p.stuckCount), short: true });
  }
  if (p.lastWebhookAt) {
    fields.push({ title: "Last Webhook", value: p.lastWebhookAt, short: true });
  }
  if (p.orderIds && p.orderIds.length) {
    fields.push({
      title: "Order IDs",
      value: p.orderIds.slice(0, 20).join(", ") + (p.orderIds.length > 20 ? ` (+${p.orderIds.length - 20} more)` : ""),
      short: false,
    });
  }
  fields.push({ title: "Admin", value: ADMIN_LINK, short: false });

  return {
    text: `${icon} Wallid Payment Alert — ${p.title}`,
    attachments: [
      {
        color: color(p),
        title: p.title,
        text: p.summary,
        fields,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

function buildDiscordPayload(p: WallidAlertPayload) {
  const icon = p.resolved ? "✅" : p.severity === "critical" ? "🚨" : "⚠️";
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: "Alert Type", value: p.type, inline: true },
    { name: "Severity", value: p.severity, inline: true },
  ];
  if (typeof p.stuckCount === "number") {
    fields.push({ name: "Count", value: String(p.stuckCount), inline: true });
  }
  if (p.lastWebhookAt) {
    fields.push({ name: "Last Webhook", value: p.lastWebhookAt, inline: true });
  }
  if (p.orderIds && p.orderIds.length) {
    fields.push({
      name: "Order IDs",
      value: (p.orderIds.slice(0, 20).join(", ") + (p.orderIds.length > 20 ? ` (+${p.orderIds.length - 20} more)` : "")).slice(0, 1000),
      inline: false,
    });
  }
  fields.push({ name: "Admin", value: ADMIN_LINK, inline: false });

  return {
    username: "PH Labs Payments",
    embeds: [
      {
        title: `${icon} ${p.title}`,
        description: p.summary,
        color: discordColor(p),
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function postJson(url: string, payload: unknown, label: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[wallid-alerts] ${label} returned ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[wallid-alerts] ${label} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Send an alert through Slack → Discord → Email with graceful fallback.
 * Returns the channel that actually delivered (or "none").
 */
export async function sendWallidAlert(
  p: WallidAlertPayload,
): Promise<"slack" | "discord" | "email" | "none"> {
  const slackUrl = process.env.SLACK_PAYMENTS_WEBHOOK?.trim();
  const discordUrl = process.env.DISCORD_PAYMENTS_WEBHOOK?.trim();

  if (slackUrl) {
    const ok = await postJson(slackUrl, buildSlackPayload(p), "Slack");
    if (ok) return "slack";
  }

  if (discordUrl) {
    const ok = await postJson(discordUrl, buildDiscordPayload(p), "Discord");
    if (ok) return "discord";
  }

  // Email fallback — idempotent per hour bucket.
  try {
    const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
    const bucket = new Date().toISOString().slice(0, 13);
    const subject = `[PH Labs] ${p.resolved ? "✅ Resolved" : "🚨"} Wallid ${p.type}`;
    const lines: string[] = [
      p.title,
      "",
      p.summary,
      "",
      `Type: ${p.type}`,
      `Severity: ${p.severity}`,
    ];
    if (typeof p.stuckCount === "number") lines.push(`Count: ${p.stuckCount}`);
    if (p.lastWebhookAt) lines.push(`Last webhook: ${p.lastWebhookAt}`);
    if (p.orderIds && p.orderIds.length) lines.push(`Order IDs: ${p.orderIds.join(", ")}`);
    lines.push("", `Admin: ${ADMIN_LINK}`);
    const text = lines.join("\n");
    const html = `<p>${text.replace(/\n/g, "<br/>")}</p>`;

    await enqueueMailOnce(`wallid-alert:${p.type}:${bucket}`, {
      to: ADMIN_ALERT_EMAIL,
      message: { subject, html, text },
      source: "wallid:alert",
    });
    return "email";
  } catch (e) {
    console.error("[wallid-alerts] All sinks failed:", e instanceof Error ? e.message : e);
    return "none";
  }
}
