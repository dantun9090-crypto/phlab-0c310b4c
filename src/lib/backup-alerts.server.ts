/**
 * Firestore backup security alerting fan-out.
 *
 * Slack → Discord → Email, with graceful fallback. Mirrors
 * `wallid-alerts.server.ts` but keyed for security incidents around the
 * `/api/public/hooks/firestore-backup` endpoint. Env vars — all optional:
 *   - SLACK_SECURITY_WEBHOOK  (preferred)
 *   - SLACK_PAYMENTS_WEBHOOK  (fallback — same workspace)
 *   - DISCORD_SECURITY_WEBHOOK
 *   - DISCORD_PAYMENTS_WEBHOOK
 * Email always attempted last so a real incident never disappears.
 *
 * Server-only — never import from client code.
 */

const ADMIN_ALERT_EMAIL = "orders@phlabs.co.uk";
const ADMIN_LINK = "https://phlabs.co.uk/admin/backupauditlog";

export type BackupAlertType =
  | "firestore_backup_failure_spike"
  | "firestore_backup_ip_lockout"
  | "firestore_backup_suspicious_trigger";

export type BackupAlertSeverity = "info" | "warn" | "critical";

export interface BackupAlertPayload {
  type: BackupAlertType;
  severity: BackupAlertSeverity;
  title: string;
  summary: string;
  ip?: string | null;
  userAgent?: string | null;
  count?: number;
  windowMinutes?: number;
  reason?: string;
  extra?: Record<string, unknown>;
}

function color(p: BackupAlertPayload): string {
  if (p.severity === "critical") return "danger";
  if (p.severity === "warn") return "warning";
  return "#3b82f6";
}
function discordColor(p: BackupAlertPayload): number {
  if (p.severity === "critical") return 0xef4444;
  if (p.severity === "warn") return 0xf59e0b;
  return 0x3b82f6;
}

function fields(p: BackupAlertPayload): Array<{ k: string; v: string }> {
  const f: Array<{ k: string; v: string }> = [
    { k: "Alert", v: p.type },
    { k: "Severity", v: p.severity },
  ];
  if (p.ip) f.push({ k: "IP", v: p.ip });
  if (p.userAgent) f.push({ k: "User-Agent", v: p.userAgent.slice(0, 200) });
  if (typeof p.count === "number") f.push({ k: "Count", v: String(p.count) });
  if (typeof p.windowMinutes === "number") f.push({ k: "Window", v: `${p.windowMinutes} min` });
  if (p.reason) f.push({ k: "Reason", v: p.reason.slice(0, 200) });
  f.push({ k: "Admin", v: ADMIN_LINK });
  return f;
}

function buildSlackPayload(p: BackupAlertPayload) {
  const icon = p.severity === "critical" ? "🚨" : "⚠️";
  return {
    text: `${icon} Backup security alert — ${p.title}`,
    attachments: [
      {
        color: color(p),
        title: p.title,
        text: p.summary,
        fields: fields(p).map((f) => ({ title: f.k, value: f.v, short: f.k !== "Admin" && f.k !== "User-Agent" })),
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

function buildDiscordPayload(p: BackupAlertPayload) {
  const icon = p.severity === "critical" ? "🚨" : "⚠️";
  return {
    username: "PH Labs Security",
    embeds: [
      {
        title: `${icon} ${p.title}`,
        description: p.summary,
        color: discordColor(p),
        fields: fields(p).map((f) => ({ name: f.k, value: f.v, inline: f.k !== "Admin" && f.k !== "User-Agent" })),
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
      console.warn(`[backup-alerts] ${label} returned ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[backup-alerts] ${label} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

export async function sendBackupAlert(
  p: BackupAlertPayload,
): Promise<"slack" | "discord" | "email" | "none"> {
  const slackUrl =
    process.env.SLACK_SECURITY_WEBHOOK?.trim() ||
    process.env.SLACK_PAYMENTS_WEBHOOK?.trim();
  const discordUrl =
    process.env.DISCORD_SECURITY_WEBHOOK?.trim() ||
    process.env.DISCORD_PAYMENTS_WEBHOOK?.trim();

  if (slackUrl) {
    const ok = await postJson(slackUrl, buildSlackPayload(p), "Slack");
    if (ok) return "slack";
  }
  if (discordUrl) {
    const ok = await postJson(discordUrl, buildDiscordPayload(p), "Discord");
    if (ok) return "discord";
  }

  try {
    const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
    const bucket = new Date().toISOString().slice(0, 13);
    const subject = `[PH Labs] 🚨 Backup security: ${p.type}`;
    const lines: string[] = [
      p.title,
      "",
      p.summary,
      "",
      `Type: ${p.type}`,
      `Severity: ${p.severity}`,
    ];
    if (p.ip) lines.push(`IP: ${p.ip}`);
    if (p.userAgent) lines.push(`UA: ${p.userAgent}`);
    if (typeof p.count === "number") lines.push(`Count: ${p.count}`);
    if (typeof p.windowMinutes === "number") lines.push(`Window: ${p.windowMinutes} min`);
    if (p.reason) lines.push(`Reason: ${p.reason}`);
    lines.push("", `Admin: ${ADMIN_LINK}`);
    const text = lines.join("\n");
    const html = `<p>${text.replace(/\n/g, "<br/>")}</p>`;

    await enqueueMailOnce(`backup-alert:${p.type}:${p.ip ?? "noip"}:${bucket}`, {
      to: ADMIN_ALERT_EMAIL,
      message: { subject, html, text },
      source: "backup:alert",
    });
    return "email";
  } catch (e) {
    console.error("[backup-alerts] All sinks failed:", e instanceof Error ? e.message : e);
    return "none";
  }
}
