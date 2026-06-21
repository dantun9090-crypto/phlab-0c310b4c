/**
 * Wallid alerting cron.
 *
 * Runs every 5 minutes (pg_cron). Surveys the current state of Wallid
 * payments and posts structured alerts through the Slack → Discord →
 * Email fallback chain in `@/lib/wallid-alerts.server`.
 *
 * Checks each run:
 *   1. `needs_review`       — ANY order → immediate critical alert.
 *   2. `stuck_orders`       — orders pending >15min; >3 → warn; >5 → critical.
 *   3. `rescue_load`        — last monitor run reconciled+flagged > 3 → warn.
 *   4. `rate_limit_attack`  — same IP blocked > 20 times in 5min → critical.
 *
 * Auto-resolution: per alert type we track `active` state in
 * `wallid_alert_state`. When the next run sees the condition cleared, we
 * fire a single ✅ Resolved message and flip `active=false`.
 *
 * Auth: `CLEANUP_SECRET` via `Authorization: Bearer` or `x-cron-secret`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import {
  sendWallidAlert,
  type WallidAlertType,
  type WallidAlertPayload,
} from "@/lib/wallid-alerts.server";

const STUCK_STATUSES = new Set([
  "pending",
  "pending_payment",
  "awaiting_payment",
  "processing_payment",
  "new",
  "processing",
]);

const STUCK_WARN = 3;
const STUCK_CRIT = 5;
const RESCUE_WARN = 3;
const RATELIMIT_ATTACK_THRESHOLD = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
  });
}

interface AlertState {
  active: boolean;
  last_count: number;
  last_alert_at: string | null;
  last_digest_at: string | null;
}

async function loadState(type: WallidAlertType): Promise<AlertState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wallid_alert_state")
    .select("active, last_count, last_alert_at, last_digest_at")
    .eq("alert_type", type)
    .maybeSingle();
  return {
    active: !!data?.active,
    last_count: data?.last_count ?? 0,
    last_alert_at: (data?.last_alert_at as string | null) ?? null,
    last_digest_at: (data?.last_digest_at as string | null) ?? null,
  };
}

async function persistState(
  type: WallidAlertType,
  patch: Partial<{
    active: boolean;
    last_count: number;
    first_alert_at: string | null;
    last_alert_at: string | null;
    last_resolved_at: string | null;
    last_digest_at: string | null;
  }>,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("wallid_alert_state")
    .upsert(
      {
        alert_type: type,
        active: patch.active ?? false,
        last_count: patch.last_count ?? 0,
        first_alert_at: patch.first_alert_at ?? null,
        last_alert_at: patch.last_alert_at ?? null,
        last_resolved_at: patch.last_resolved_at ?? null,
        last_digest_at: patch.last_digest_at ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "alert_type" },
    );
}

/**
 * Fire-or-resolve alert with severity escalation + hourly digest batching.
 * Returns the action taken for the response payload.
 */
async function fireOrResolve(
  type: WallidAlertType,
  payload: Omit<WallidAlertPayload, "type" | "resolved">,
  count: number,
  options: { immediateAtCount?: number } = {},
): Promise<{ action: "fired" | "digested" | "resolved" | "noop"; via: string }> {
  const state = await loadState(type);
  const nowIso = new Date().toISOString();
  const immediateAt = options.immediateAtCount ?? STUCK_CRIT;

  // Cleared → send resolved once.
  if (count === 0) {
    if (state.active) {
      const via = await sendWallidAlert({ ...payload, type, resolved: true });
      await persistState(type, {
        active: false,
        last_count: 0,
        last_resolved_at: nowIso,
      });
      return { action: "resolved", via };
    }
    return { action: "noop", via: "none" };
  }

  // Immediate threshold or critical severity → always send.
  if (count >= immediateAt || payload.severity === "critical") {
    const via = await sendWallidAlert({ ...payload, type, resolved: false });
    await persistState(type, {
      active: true,
      last_count: count,
      first_alert_at: state.active ? state.last_alert_at : nowIso,
      last_alert_at: nowIso,
    });
    return { action: "fired", via };
  }

  // Below immediate threshold → digest at most once per hour.
  const lastDigest = state.last_digest_at ? Date.parse(state.last_digest_at) : 0;
  if (!lastDigest || Date.now() - lastDigest >= 60 * 60_000) {
    const via = await sendWallidAlert({ ...payload, type, resolved: false });
    await persistState(type, {
      active: true,
      last_count: count,
      first_alert_at: state.active ? state.last_alert_at : nowIso,
      last_alert_at: nowIso,
      last_digest_at: nowIso,
    });
    return { action: "digested", via };
  }

  return { action: "noop", via: "none" };
}

export const Route = createFileRoute("/api/public/hooks/wallid-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const rl = checkRateLimit(ip, "wallid:alerts", 12, 60_000);
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);

        const authHeader = request.headers.get("authorization") || "";
        const bearer = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        const provided = bearer || request.headers.get("x-cron-secret") || "";
        const expected = process.env.CLEANUP_SECRET || "";
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { listDocsAdmin } = await import("@/lib/server/firestore-admin");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const nowMs = Date.now();
        const stuckCutoffMs = nowMs - 15 * 60_000;

        // ----- 1+2. Inspect orders -----
        const orders = await listDocsAdmin("orders", {
          orderBy: "createdAt",
          direction: "DESCENDING",
          limit: 300,
        }).catch(() => [] as Array<Record<string, unknown> & { id: string }>);

        const stuckOrders: string[] = [];
        const reviewOrders: string[] = [];

        for (const o of orders) {
          const provider = String((o.paymentProvider as string) || "").toLowerCase();
          const method = String((o.paymentMethod as string) || "").toLowerCase();
          if (provider !== "wallid" && method !== "pay_by_bank") continue;
          const status = String((o.status as string) || "").toLowerCase();
          const createdAt = o.createdAt;
          let createdMs = 0;
          if (typeof createdAt === "string") createdMs = Date.parse(createdAt);
          else if (createdAt instanceof Date) createdMs = createdAt.getTime();
          else if (typeof createdAt === "number") createdMs = createdAt;

          if (status === "needs_review") {
            reviewOrders.push(String(o.id));
            continue;
          }
          if (STUCK_STATUSES.has(status) && createdMs && createdMs <= stuckCutoffMs) {
            stuckOrders.push(String(o.id));
          }
        }

        // Last webhook timestamp from supabase for context.
        const { data: lastEv } = await supabaseAdmin
          .from("wallid_webhook_events")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const lastWebhookAt = (lastEv?.created_at as string | undefined) ?? null;

        const results: Record<string, unknown> = {};

        // 1. needs_review — immediate critical.
        results.needs_review = await fireOrResolve(
          "needs_review",
          {
            severity: "critical",
            title: `${reviewOrders.length} Wallid order(s) need manual review`,
            summary:
              "Orders were marked needs_review because their payment status was unknown, ambiguous, or stuck > 60min at the bank. Investigate in admin.",
            stuckCount: reviewOrders.length,
            orderIds: reviewOrders,
            lastWebhookAt,
          },
          reviewOrders.length,
          { immediateAtCount: 1 },
        );

        // 2. stuck_orders — warn at >3, critical at >5.
        const stuckSeverity: WallidAlertPayload["severity"] =
          stuckOrders.length > STUCK_CRIT ? "critical" : "warn";
        results.stuck_orders =
          stuckOrders.length > STUCK_WARN || stuckOrders.length === 0
            ? await fireOrResolve(
                "stuck_orders",
                {
                  severity: stuckSeverity,
                  title: `${stuckOrders.length} Wallid order(s) stuck > 15min`,
                  summary:
                    "Orders started a Wallid Pay-by-Bank session > 15min ago and never transitioned to a terminal status. Cron reconcile + monitor will retry; if this persists check Wallid webhook delivery.",
                  stuckCount: stuckOrders.length,
                  orderIds: stuckOrders,
                  lastWebhookAt,
                },
                stuckOrders.length,
                { immediateAtCount: STUCK_CRIT + 1 },
              )
            : { action: "noop", via: "none" };

        // 3. rescue_load — read last monitor run summary from app_config.
        const { data: cfg } = await supabaseAdmin
          .from("app_config")
          .select("value")
          .eq("key", "wallid:last-monitor-run")
          .maybeSingle();
        let rescueCount = 0;
        let rescueIds: string[] = [];
        if (cfg?.value) {
          try {
            const parsed = JSON.parse(cfg.value as string) as {
              reconciled?: number;
              flaggedReview?: number;
              transitions?: Array<{ orderId: string }>;
              at?: string;
            };
            // Only consider runs within last 20min so we don't alert on stale data.
            const at = parsed.at ? Date.parse(parsed.at) : 0;
            if (at && nowMs - at < 20 * 60_000) {
              rescueCount = (parsed.reconciled ?? 0) + (parsed.flaggedReview ?? 0);
              rescueIds = (parsed.transitions ?? []).map((t) => t.orderId);
            }
          } catch {
            /* ignore */
          }
        }
        results.rescue_load =
          rescueCount > RESCUE_WARN || rescueCount === 0
            ? await fireOrResolve(
                "rescue_load",
                {
                  severity: "warn",
                  title: `Monitor rescued ${rescueCount} stuck order(s) in last run`,
                  summary:
                    "Webhook delivery may be failing — monitor cron had to reconcile or flag more orders than expected. Verify Wallid webhook URL + Cloudflare logs.",
                  stuckCount: rescueCount,
                  orderIds: rescueIds,
                  lastWebhookAt,
                },
                rescueCount,
                { immediateAtCount: RESCUE_WARN + 1 },
              )
            : { action: "noop", via: "none" };

        // 4. rate_limit_attack — any IP blocked > 20 times in last 5 min.
        const sinceIso = new Date(nowMs - 5 * 60_000).toISOString();
        const { data: rateRows } = await supabaseAdmin
          .from("wallid_rate_limits")
          .select("ip")
          .gte("created_at", sinceIso);
        const ipCounts = new Map<string, number>();
        for (const r of rateRows || []) {
          const k = String((r as { ip: string }).ip || "");
          ipCounts.set(k, (ipCounts.get(k) || 0) + 1);
        }
        const attackers = [...ipCounts.entries()]
          .filter(([, c]) => c >= RATELIMIT_ATTACK_THRESHOLD)
          .map(([ip2, c]) => `${ip2} (${c})`);
        results.rate_limit_attack =
          attackers.length > 0
            ? await fireOrResolve(
                "rate_limit_attack",
                {
                  severity: "critical",
                  title: `Possible Wallid webhook abuse: ${attackers.length} IP(s) over rate limit`,
                  summary:
                    "One or more IPs exceeded the per-IP webhook rate limit in the last 5 minutes. May be a scanner or replay attempt.",
                  stuckCount: attackers.length,
                  orderIds: attackers,
                  lastWebhookAt,
                },
                attackers.length,
                { immediateAtCount: 1 },
              )
            : { action: "noop", via: "none" };

        return json({
          checked: {
            orders: orders.length,
            stuck: stuckOrders.length,
            needs_review: reviewOrders.length,
            rescue: rescueCount,
            rate_limit_attackers: attackers.length,
          },
          results,
        });
      },
    },
  },
});
