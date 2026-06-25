/**
 * Public endpoint that ingests client-side error events (404, 5xx, 429),
 * persists them to Firestore (`error_events`), and triggers an email/Slack
 * alert when the rolling-window count for a given type exceeds a threshold.
 *
 * Thresholds and the rolling window are configurable via Firestore
 * `settings/errorMonitoring`:
 *   { windowMinutes: 5,
 *     thresholds: { page_not_found: 25, server_error: 10, rate_limited: 10 },
 *     alertEmail: "info@phlabs.co.uk",
 *     slackWebhookUrl?: string,   // overrides env SLACK_ALERT_WEBHOOK_URL
 *     alertCooldownMinutes: 30 }
 *
 * The route is intentionally permissive (CORS-open, no auth) but rate-limits
 * per IP and validates input strictly.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  addDocAdmin,
  getDocAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";

const ALLOWED_ORIGINS = new Set<string>([
  "https://phlabs.co.uk",
  "https://www.phlabs.co.uk",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host.endsWith(".lovable.app") || host.endsWith(".lovable.dev")) return true;
  } catch {
    return false;
  }
  return false;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && isAllowedOrigin(origin) ? origin : "https://phlabs.co.uk";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin",
  };
}

// --- per-isolate rate limit (best-effort) ---
const HITS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || cur.resetAt < now) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count++;
  return cur.count > MAX_PER_WINDOW;
}

const EVENT_TYPES = [
  "page_not_found",
  "server_error",
  "rate_limited",
  "research_overlay",
  "compound_overlay",
] as const;
type EventType = (typeof EVENT_TYPES)[number];

const Body = z.object({
  type: z.enum(EVENT_TYPES),
  path: z.string().trim().max(500),
  status: z.number().int().min(0).max(599).optional(),
  referrer: z.string().trim().max(500).optional(),
  userAgent: z.string().trim().max(500).optional(),
  message: z.string().trim().max(500).optional(),
  /** Optional detector metadata (e.g. which DOM markers matched). */
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const DEFAULT_THRESHOLDS: Record<EventType, number> = {
  page_not_found: 25,
  server_error: 10,
  rate_limited: 10,
  research_overlay: 1,
  compound_overlay: 1,
};
const DEFAULT_WINDOW_MIN = 5;
const DEFAULT_COOLDOWN_MIN = 30;
const DEFAULT_ALERT_EMAIL = "info@phlabs.co.uk";

interface MonitorSettings {
  windowMinutes: number;
  thresholds: Record<EventType, number>;
  alertEmail: string;
  slackWebhookUrl?: string;
  alertCooldownMinutes: number;
}

async function loadSettings(): Promise<MonitorSettings> {
  let doc: Record<string, unknown> | null = null;
  try {
    doc = await getDocAdmin("settings", "errorMonitoring");
  } catch {
    /* fall back to defaults */
  }
  const t = (doc?.thresholds ?? {}) as Partial<Record<EventType, number>>;
  return {
    windowMinutes: Number(doc?.windowMinutes ?? DEFAULT_WINDOW_MIN) || DEFAULT_WINDOW_MIN,
    thresholds: {
      page_not_found: Number(t.page_not_found ?? DEFAULT_THRESHOLDS.page_not_found),
      server_error: Number(t.server_error ?? DEFAULT_THRESHOLDS.server_error),
      rate_limited: Number(t.rate_limited ?? DEFAULT_THRESHOLDS.rate_limited),
    },
    alertEmail: typeof doc?.alertEmail === "string" ? doc.alertEmail : DEFAULT_ALERT_EMAIL,
    slackWebhookUrl:
      typeof doc?.slackWebhookUrl === "string" && doc.slackWebhookUrl.startsWith("https://hooks.slack.com/")
        ? (doc.slackWebhookUrl as string)
        : process.env.SLACK_ALERT_WEBHOOK_URL,
    alertCooldownMinutes:
      Number(doc?.alertCooldownMinutes ?? DEFAULT_COOLDOWN_MIN) || DEFAULT_COOLDOWN_MIN,
  };
}

interface CounterDoc {
  type: EventType;
  windowStart: string;
  count: number;
  lastAlertAt?: string;
  samplePaths?: string[];
}

async function bumpCounter(
  type: EventType,
  path: string,
  windowMinutes: number,
): Promise<CounterDoc> {
  const docId = `counter_${type}`;
  const now = new Date();
  const existing = (await getDocAdmin("error_events", docId)) as
    | (CounterDoc & Record<string, unknown>)
    | null;

  const windowMs = windowMinutes * 60_000;
  const fresh =
    !existing ||
    !existing.windowStart ||
    now.getTime() - new Date(existing.windowStart).getTime() > windowMs;

  const next: CounterDoc = fresh
    ? {
        type,
        windowStart: now.toISOString(),
        count: 1,
        samplePaths: [path],
        lastAlertAt: existing?.lastAlertAt,
      }
    : {
        type,
        windowStart: existing.windowStart,
        count: (existing.count ?? 0) + 1,
        samplePaths: Array.from(new Set([...(existing.samplePaths ?? []), path])).slice(0, 25),
        lastAlertAt: existing.lastAlertAt,
      };

  if (existing) {
    await updateDocAdmin("error_events", docId, next as unknown as Record<string, unknown>);
  } else {
    await addDocAdmin("error_events", next as unknown as Record<string, unknown>, docId);
  }
  return next;
}

function alertSubject(type: EventType, count: number, windowMin: number): string {
  const label =
    type === "page_not_found"
      ? "404 spike"
      : type === "server_error"
      ? "5xx error spike"
      : "429 rate-limit spike";
  return `[PH Labs] ${label}: ${count} in ${windowMin}m`;
}

function alertHtml(
  type: EventType,
  counter: CounterDoc,
  windowMin: number,
  threshold: number,
): string {
  const samples = (counter.samplePaths ?? []).slice(0, 25).map((p) => `<li><code>${escape(p)}</code></li>`).join("");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;">
    <h2>PH Labs error monitor — ${escape(type)}</h2>
    <p><strong>${counter.count}</strong> events in the last <strong>${windowMin} minutes</strong>
       (threshold: ${threshold}).</p>
    <p>Window started: ${escape(counter.windowStart)}</p>
    <h3>Sample paths</h3>
    <ul>${samples || "<li>(none)</li>"}</ul>
    <p style="color:#64748b;font-size:12px;">
      Configure thresholds in Firestore <code>settings/errorMonitoring</code>.
    </p>
  </body></html>`;
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function postSlack(webhookUrl: string, text: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[error-monitor] slack post failed", err);
  }
}

async function maybeAlert(
  counter: CounterDoc,
  settings: MonitorSettings,
): Promise<boolean> {
  const threshold = settings.thresholds[counter.type];
  if (counter.count < threshold) return false;

  // Cooldown to avoid email floods.
  if (counter.lastAlertAt) {
    const since = Date.now() - new Date(counter.lastAlertAt).getTime();
    if (since < settings.alertCooldownMinutes * 60_000) return false;
  }

  const subject = alertSubject(counter.type, counter.count, settings.windowMinutes);
  const html = alertHtml(counter.type, counter, settings.windowMinutes, threshold);

  // Email via Firebase Trigger-Email extension (writes to `mail` collection).
  try {
    await addDocAdmin("mail", {
      to: settings.alertEmail,
      message: { subject, html },
      createdAt: new Date(),
      source: `error-monitor:${counter.type}`,
    });
  } catch (err) {
    console.error("[error-monitor] email enqueue failed", err);
  }

  // Optional Slack
  if (settings.slackWebhookUrl) {
    const samples = (counter.samplePaths ?? []).slice(0, 10).join("\n• ");
    await postSlack(
      settings.slackWebhookUrl,
      `:rotating_light: *${subject}*\nWindow started: ${counter.windowStart}\nSample paths:\n• ${samples || "(none)"}`,
    );
  }

  await updateDocAdmin("error_events", `counter_${counter.type}`, {
    lastAlertAt: new Date().toISOString(),
  });
  return true;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/error-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!isAllowedOrigin(origin)) {
          return new Response(JSON.stringify({ error: "forbidden_origin" }), {
            status: 403,
            headers: { "content-type": "application/json", ...corsHeaders(origin) },
          });
        }
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
        if (rateLimited(ip)) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "content-type": "application/json", ...corsHeaders(origin) },
          });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { "content-type": "application/json", ...corsHeaders(origin) },
          });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "invalid_input", details: parsed.error.flatten() }),
            { status: 400, headers: { "content-type": "application/json", ...corsHeaders(origin) } },
          );
        }
        const ev = parsed.data;

        try {
          // 1) Persist the raw event (best-effort, capped via natural Firestore TTL/cleanup).
          await addDocAdmin("error_events", {
            ...ev,
            ip,
            createdAt: new Date(),
          });

          // 2) Bump the per-type rolling counter and possibly alert.
          const settings = await loadSettings();
          const counter = await bumpCounter(ev.type, ev.path, settings.windowMinutes);
          const alerted = await maybeAlert(counter, settings);

          return new Response(
            JSON.stringify({ ok: true, count: counter.count, alerted }),
            { status: 200, headers: { "content-type": "application/json", ...corsHeaders(origin) } },
          );
        } catch (err) {
          console.error("[api/public/error-monitor] failed", err);
          return json({ error: "monitor_failed" }, 500);
        }
      },
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      },
    },
  },
});
