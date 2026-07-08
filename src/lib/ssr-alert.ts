/**
 * SSR error alerter — fire-and-forget notification when the SSR pipeline
 * throws (renderToReadableStream, module-init failures, h3-swallowed
 * errors). Delivers to Slack Incoming Webhook and/or Resend email; all
 * channels are opt-in via env vars and silently skipped when unset.
 *
 * Env vars (server-only, read inside the worker):
 *   SSR_ALERT_WEBHOOK_URL   Slack-compatible incoming webhook
 *   RESEND_API_KEY          Resend API key
 *   SSR_ALERT_EMAIL_TO      Comma-separated recipients (falls back to ALERT_EMAIL_TO)
 *   ALERT_EMAIL_TO          Fallback recipients used by other monitors
 *   ALERT_EMAIL_FROM        From address on verified Resend domain
 *                           (default: alerts@phlabs.co.uk)
 *
 * Alerts are throttled per-isolate: the same error signature (first line
 * of the stack + normalised pathname) fires at most once per THROTTLE_MS.
 * Preview hosts (`*.lovable.app`, `*.lovableproject.com`) are skipped —
 * we only want production noise on phlabs.co.uk.
 */

const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const recent = new Map<string, number>();

type Ctx = { waitUntil?: (p: Promise<unknown>) => void } | undefined;

interface NotifyArgs {
  error: unknown;
  url: URL;
  method?: string;
  ctx?: Ctx;
  /** Free-form label for the failure site (e.g. "renderToReadableStream", "h3-swallowed"). */
  kind?: string;
}

export function notifySsrError({ error, url, method = "GET", ctx, kind = "ssr" }: NotifyArgs): void {
  try {
    const host = url.hostname;
    // Only alert on the canonical production host — preview / lovable.app noise clogs the channel.
    if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return;

    const err = error instanceof Error ? error : new Error(String(error));
    const firstStackLine = (err.stack ?? err.message).split("\n").slice(0, 2).join(" | ").slice(0, 200);
    const sig = `${kind}|${url.pathname}|${firstStackLine}`;

    const now = Date.now();
    const last = recent.get(sig);
    if (last && now - last < THROTTLE_MS) return;
    recent.set(sig, now);
    if (recent.size > 200) {
      // prevent unbounded growth
      const cutoff = now - THROTTLE_MS;
      for (const [k, v] of recent) if (v < cutoff) recent.delete(k);
    }

    const payload = {
      error: err,
      url,
      method,
      kind,
    };

    const p = deliverAlert(payload).catch((e) => {
      // Never let alert failures crash the request path.
      console.error("[ssr-alert] deliver failed:", e);
    });
    if (ctx?.waitUntil) ctx.waitUntil(p);
  } catch (e) {
    console.error("[ssr-alert] notify failed:", e);
  }
}

async function deliverAlert(args: {
  error: Error;
  url: URL;
  method: string;
  kind: string;
}): Promise<void> {
  const webhook = process.env.SSR_ALERT_WEBHOOK_URL;
  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.SSR_ALERT_EMAIL_TO || process.env.ALERT_EMAIL_TO;
  const emailFrom = process.env.ALERT_EMAIL_FROM || "alerts@phlabs.co.uk";

  if (!webhook && !(resendKey && emailTo)) return;

  const title = `SSR error on ${args.url.hostname}${args.url.pathname}`;
  const body = [
    `Kind: ${args.kind}`,
    `URL: ${args.url.toString()}`,
    `Method: ${args.method}`,
    `Message: ${args.error.message}`,
    "",
    "Stack:",
    (args.error.stack ?? "(no stack)").slice(0, 3000),
  ].join("\n");

  const tasks: Promise<unknown>[] = [];

  if (webhook) {
    tasks.push(
      fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `:rotating_light: *${title}*`,
          blocks: [
            { type: "header", text: { type: "plain_text", text: `🚨 ${title}` } },
            { type: "section", text: { type: "mrkdwn", text: "```" + body.slice(0, 2800) + "```" } },
          ],
        }),
      }),
    );
  }

  if (resendKey && emailTo) {
    const escaped = body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    tasks.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: emailFrom,
          to: emailTo.split(",").map((s) => s.trim()).filter(Boolean),
          subject: `🚨 ${title}`,
          html: `<h2>${title}</h2><pre style="font:12px/1.4 ui-monospace,monospace;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;white-space:pre-wrap">${escaped}</pre>`,
        }),
      }),
    );
  }

  await Promise.allSettled(tasks);
}
