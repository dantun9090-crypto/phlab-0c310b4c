/**
 * Admin-only reader for the `wallid_webhook_attempts` table + summary
 * counters for the Payment Triage dashboard.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

export interface WebhookAttemptRow {
  id: string;
  receivedAt: string;
  ip: string | null;
  userAgent: string | null;
  sigHeaderName: string | null;
  eventCount: number | null;
  outcome: string;
  httpStatus: number;
  durationMs: number;
  errorMessage: string | null;
}

export interface WebhookAttemptSummary {
  windowHours: number;
  total: number;
  accepted: number;
  failed: number;
  lastAt: string | null;
  lastFailureAt: string | null;
  slowestMs: number;
  p95Ms: number;
  breakdown: Array<{ outcome: string; count: number }>;
  activeAlerts: Array<{ alertType: string; count: number; sinceIso: string | null }>;
}

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  limit: z.number().int().min(1).max(200).optional(),
  windowHours: z.number().int().min(1).max(168).optional(),
});

export const listWebhookAttemptsAdmin = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ rows: WebhookAttemptRow[]; summary: WebhookAttemptSummary }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const limit = data.limit ?? 100;
    const windowHours = data.windowHours ?? 24;
    const since = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();

    const [{ data: rowsRaw }, { data: windowRows }, { data: alertRows }] = await Promise.all([
      supabaseAdmin
        .from("wallid_webhook_attempts")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from("wallid_webhook_attempts")
        .select("outcome, duration_ms, received_at, http_status")
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("wallid_alert_state")
        .select("alert_type, last_count, first_alert_at")
        .eq("active", true),
    ]);

    const rows: WebhookAttemptRow[] = (rowsRaw ?? []).map((r) => ({
      id: String(r.id),
      receivedAt: String(r.received_at),
      ip: r.ip ? String(r.ip) : null,
      userAgent: r.user_agent ? String(r.user_agent) : null,
      sigHeaderName: r.sig_header_name ? String(r.sig_header_name) : null,
      eventCount: r.event_count != null ? Number(r.event_count) : null,
      outcome: String(r.outcome),
      httpStatus: Number(r.http_status),
      durationMs: Number(r.duration_ms),
      errorMessage: r.error_message ? String(r.error_message) : null,
    }));

    const win = windowRows ?? [];
    const total = win.length;
    const accepted = win.filter((r) => r.outcome === "accepted").length;
    const failed = win.filter((r) => r.outcome !== "accepted" && r.outcome !== "rate_limited").length;
    const breakdownMap = new Map<string, number>();
    for (const r of win) breakdownMap.set(String(r.outcome), (breakdownMap.get(String(r.outcome)) ?? 0) + 1);
    const breakdown = [...breakdownMap.entries()]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((a, b) => b.count - a.count);
    const durations = win.map((r) => Number(r.duration_ms)).sort((a, b) => a - b);
    const slowestMs = durations.at(-1) ?? 0;
    const p95Ms = durations.length ? durations[Math.floor(durations.length * 0.95)] ?? slowestMs : 0;
    const firstFailure = win.find((r) => r.outcome !== "accepted" && r.outcome !== "rate_limited");

    const summary: WebhookAttemptSummary = {
      windowHours,
      total,
      accepted,
      failed,
      lastAt: win[0]?.received_at ? String(win[0].received_at) : null,
      lastFailureAt: firstFailure?.received_at ? String(firstFailure.received_at) : null,
      slowestMs,
      p95Ms,
      breakdown,
      activeAlerts: (alertRows ?? []).map((a) => ({
        alertType: String(a.alert_type),
        count: Number(a.last_count ?? 0),
        sinceIso: a.first_alert_at ? String(a.first_alert_at) : null,
      })),
    };

    return { rows, summary };
  });
