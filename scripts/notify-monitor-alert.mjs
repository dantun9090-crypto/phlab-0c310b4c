#!/usr/bin/env node
/**
 * Sends monitor-head-get failure alerts to Slack (incoming webhook) and
 * email (Resend HTTP API). Each channel is opt-in via env var; missing
 * config is silently skipped so the workflow never fails on notify.
 *
 * Env:
 *   SLACK_WEBHOOK_URL   Slack Incoming Webhook (optional)
 *   RESEND_API_KEY      Resend API key (optional, required for email)
 *   ALERT_EMAIL_TO      Comma-separated recipient(s) (optional)
 *   ALERT_EMAIL_FROM    From address on a verified Resend domain
 *                       (default: alerts@phlabs.co.uk)
 *   ALERT_TITLE         Header text (default: HEAD vs GET Monitor FAILED)
 *   ALERT_LOG_PATH      Path to monitor log to embed (default /tmp/monitor.log)
 *   ALERT_RUN_URL       Link back to the CI run
 */
import { readFileSync } from "node:fs";

const {
  SLACK_WEBHOOK_URL,
  RESEND_API_KEY,
  ALERT_EMAIL_TO,
  ALERT_EMAIL_FROM = "alerts@phlabs.co.uk",
  ALERT_TITLE = "HEAD vs GET Monitor FAILED",
  ALERT_LOG_PATH = "/tmp/monitor.log",
  ALERT_RUN_URL = "",
} = process.env;

let log = "";
try { log = readFileSync(ALERT_LOG_PATH, "utf8"); } catch { log = "(no log captured)"; }
const throttleSummary = process.env.ALERT_THROTTLE_SUMMARY || "";
const prefixed = throttleSummary ? `${throttleSummary}\n\n${log}` : log;
const trimmed = prefixed.length > 3500 ? prefixed.slice(-3500) : prefixed;

const results = [];

if (SLACK_WEBHOOK_URL) {
  try {
    const r = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: *${ALERT_TITLE}*`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `🚨 ${ALERT_TITLE}` } },
          ALERT_RUN_URL && {
            type: "section",
            text: { type: "mrkdwn", text: `<${ALERT_RUN_URL}|Open CI run>` },
          },
          { type: "section", text: { type: "mrkdwn", text: "```" + trimmed + "```" } },
        ].filter(Boolean),
      }),
    });
    results.push(`slack: ${r.status}`);
  } catch (e) { results.push(`slack: ERR ${e.message}`); }
} else results.push("slack: skipped (no SLACK_WEBHOOK_URL)");

if (RESEND_API_KEY && ALERT_EMAIL_TO) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: ALERT_EMAIL_FROM,
        to: ALERT_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `🚨 ${ALERT_TITLE}`,
        html: `<h2>${ALERT_TITLE}</h2>${
          ALERT_RUN_URL ? `<p><a href="${ALERT_RUN_URL}">Open CI run</a></p>` : ""
        }<pre style="font:12px/1.4 ui-monospace,monospace;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;white-space:pre-wrap">${
          trimmed.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))
        }</pre>`,
      }),
    });
    results.push(`email: ${r.status}`);
  } catch (e) { results.push(`email: ERR ${e.message}`); }
} else results.push("email: skipped (no RESEND_API_KEY / ALERT_EMAIL_TO)");

console.log("notify results:", results.join(" | "));
