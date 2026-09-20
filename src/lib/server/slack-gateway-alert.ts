/**
 * Slack alert sink via the Lovable connector gateway.
 *
 * Posts alert messages to Slack using the linked workspace Slack
 * connection (no incoming webhook required). Used as the first sink by
 * the Wallid payment and backup security alert fan-outs.
 *
 * Env (server-only):
 *   LOVABLE_API_KEY      gateway auth (managed)
 *   SLACK_API_KEY        linked Slack connection key (managed)
 *   SLACK_ALERT_CHANNEL  channel name or ID (default: #all-phslack)
 *
 * Server-only — never import from client code.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";
const DEFAULT_CHANNEL = "#all-phslack";

export interface SlackGatewayMessage {
  /** Fallback/notification text. */
  text: string;
  /** Optional Slack attachments (same shape as incoming-webhook payloads). */
  attachments?: unknown[];
}

/**
 * Post a message to Slack through the gateway.
 * Returns true only when Slack confirms delivery (`ok: true`).
 * Never throws — alerting must not break the caller.
 */
export async function postSlackGatewayAlert(
  msg: SlackGatewayMessage,
  label = "slack-gateway",
): Promise<boolean> {
  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  const slackKey = process.env.SLACK_API_KEY?.trim();
  if (!lovableKey || !slackKey) return false;

  const channel = process.env.SLACK_ALERT_CHANNEL?.trim() || DEFAULT_CHANNEL;

  try {
    const res = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": slackKey,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, ...msg }),
    });

    const body = await res.text();
    if (!res.ok) {
      console.warn(`[${label}] gateway returned ${res.status}: ${body.slice(0, 300)}`);
      return false;
    }

    // Slack reports failures inside a 200 body.
    let parsed: { ok?: boolean; error?: string } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      console.warn(`[${label}] non-JSON response: ${body.slice(0, 200)}`);
      return false;
    }
    if (!parsed.ok) {
      console.warn(`[${label}] Slack error: ${parsed.error ?? "unknown"}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[${label}] failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}
