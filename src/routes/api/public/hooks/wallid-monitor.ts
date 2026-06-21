/**
 * Wallid webhook-delivery monitor + nightly sweep.
 *
 * Runs every 15 minutes (and again at 02:00 daily for a wider sweep). For
 * each Firestore order that is:
 *
 *   - paymentProvider == "wallid"
 *   - status in {pending, pending_payment, awaiting_payment, processing_payment}
 *   - older than 10 minutes
 *   - newer than the lookback window (default 24h, daily run = 48h)
 *
 * we:
 *
 *   1. Check whether any `wallid_webhook_events` row exists for that order.
 *      If yes, the webhook fired but the transition raced or the order is
 *      still legitimately pending at the bank — leave the 5-min reconcile
 *      cron to handle it.
 *   2. If NO webhook event was ever logged, poll Wallid /status directly
 *      via the api_payment_id from wallid_payments, then atomically
 *      transition the Firestore order (same path as the webhook + cron).
 *   3. If Wallid still reports PENDING/PROCESSING after >60 minutes, flag
 *      the order as `needs_review` so it surfaces in the admin panel
 *      instead of silently rotting.
 *   4. If more than 3 distinct orders had to be auto-reconciled in the
 *      last hour, enqueue an admin alert email via the `mail` collection.
 *
 * Security: server-only shared secret (`CLEANUP_SECRET`) in `Authorization:
 * Bearer …` or `x-cron-secret`. /api/public/* bypasses Lovable edge auth,
 * so the secret IS the gate — without it the endpoint must 401.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getWallidStatus, WallidError } from "@/lib/wallid.server";
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";

const STUCK_STATUSES = new Set([
  "pending",
  "pending_payment",
  "awaiting_payment",
  "processing_payment",
]);

const ADMIN_ALERT_EMAIL = "orders@phlabs.co.uk";
const STUCK_ALERT_THRESHOLD = 3; // > N reconciles in an hour triggers email

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
  });
}

function mapStatus(s: string): "SUCCESS" | "FAILED" | "EXPIRED" | "PENDING" | "OTHER" {
  const u = String(s || "").toUpperCase();
  if (u === "SUCCESS" || u === "PAID" || u === "COMPLETED") return "SUCCESS";
  if (u === "FAILED" || u === "DECLINED" || u === "CANCELLED" || u === "CANCELED") return "FAILED";
  if (u === "EXPIRED") return "EXPIRED";
  if (u === "NEW" || u === "PENDING" || u === "PROCESSING") return "PENDING";
  return "OTHER";
}

export const Route = createFileRoute("/api/public/hooks/wallid-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const rl = checkRateLimit(ip, "wallid:monitor", 6, 60_000);
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

        // Optional `?window=hours` override for the nightly broader sweep.
        let windowHours = 24;
        try {
          const url = new URL(request.url);
          const w = Number(url.searchParams.get("window") || 0);
          if (Number.isFinite(w) && w >= 1 && w <= 168) windowHours = w;
        } catch { /* ignore */ }

        const { listDocsAdmin, transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");

        // Query recent orders by createdAt; filter in-code on provider +
        // status to avoid needing a composite Firestore index.
        const nowMs = Date.now();
        const stuckCutoffMs = nowMs - 10 * 60_000; // older than 10 min
        const reviewCutoffMs = nowMs - 60 * 60_000; // older than 60 min → needs_review
        const lookbackMs = nowMs - windowHours * 60 * 60_000;

        const orders = await listDocsAdmin("orders", {
          orderBy: "createdAt",
          direction: "DESCENDING",
          limit: 200,
        }).catch((e) => {
          console.error("[Wallid monitor] order list failed:", e instanceof Error ? e.message : e);
          return [] as Array<Record<string, unknown> & { id: string }>;
        });

        const candidates = orders.filter((o) => {
          const provider = String((o.paymentProvider as string) || "").toLowerCase();
          const method = String((o.paymentMethod as string) || "").toLowerCase();
          if (provider !== "wallid" && method !== "pay_by_bank") return false;
          const status = String((o.status as string) || "").toLowerCase();
          if (!STUCK_STATUSES.has(status)) return false;
          const createdAt = o.createdAt;
          let createdMs = 0;
          if (typeof createdAt === "string") createdMs = Date.parse(createdAt);
          else if (createdAt instanceof Date) createdMs = createdAt.getTime();
          else if (typeof createdAt === "number") createdMs = createdAt;
          if (!createdMs) return false;
          return createdMs <= stuckCutoffMs && createdMs >= lookbackMs;
        });

        let checked = 0;
        let reconciled = 0;
        let flaggedReview = 0;
        let webhookMissing = 0;
        const transitions: Array<{ orderId: string; to: string }> = [];

        for (const order of candidates) {
          checked += 1;
          const orderId = order.id;

          // 1) Has any webhook event row been logged for this order?
          const { data: evRows } = await supabaseAdmin
            .from("wallid_webhook_events")
            .select("event_id, status")
            .eq("order_id", orderId)
            .limit(1);
          const webhookSeen = !!(evRows && evRows.length > 0);

          // 2) Find the latest wallid_payments row so we can poll status.
          const { data: payRows } = await supabaseAdmin
            .from("wallid_payments")
            .select("api_payment_id, status")
            .eq("order_id", orderId)
            .order("created_at", { ascending: false })
            .limit(1);
          const apiPaymentId = payRows?.[0]?.api_payment_id || null;

          if (!webhookSeen) webhookMissing += 1;

          if (!apiPaymentId) {
            // Order was never linked to a Wallid session — flag for review.
            const createdMs =
              typeof order.createdAt === "string" ? Date.parse(order.createdAt) : 0;
            if (createdMs && createdMs <= reviewCutoffMs) {
              const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
                allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment"],
                updates: {
                  status: "needs_review",
                  paymentFailureReason: "No Wallid payment session linked after 60 min",
                  paymentUpdatedAt: new Date(),
                },
              });
              if (transitioned) flaggedReview += 1;
            }
            continue;
          }

          // 3) Poll Wallid directly.
          let remoteStatus = "";
          try {
            const remote = await getWallidStatus(apiPaymentId);
            remoteStatus = String(remote.status || "").toUpperCase();
          } catch (e) {
            if (e instanceof WallidError) {
              console.warn(`[Wallid monitor] ${orderId} status fetch failed: ${e.status}`);
            } else {
              console.warn(`[Wallid monitor] ${orderId} unexpected:`, e);
            }
            continue;
          }

          // Persist remote status on the supabase row.
          await supabaseAdmin
            .from("wallid_payments")
            .update({ status: remoteStatus })
            .eq("api_payment_id", apiPaymentId);

          const mapped = mapStatus(remoteStatus);
          if (mapped === "PENDING") {
            // Still pending at the bank. After 60 min flag as needs_review
            // so the order surfaces in the admin panel.
            const createdMs =
              typeof order.createdAt === "string" ? Date.parse(order.createdAt) : 0;
            if (createdMs && createdMs <= reviewCutoffMs) {
              const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
                allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment"],
                updates: {
                  status: "needs_review",
                  paymentFailureReason: `Wallid still ${remoteStatus} after 60 min`,
                  paymentUpdatedAt: new Date(),
                },
              });
              if (transitioned) flaggedReview += 1;
            }
            continue;
          }

          if (mapped === "OTHER") {
            const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
              allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment"],
              updates: {
                status: "needs_review",
                paymentFailureReason: `Unknown Wallid status: ${remoteStatus}`,
                paymentUpdatedAt: new Date(),
              },
            });
            if (transitioned) flaggedReview += 1;
            continue;
          }

          const firestoreStatus =
            mapped === "SUCCESS" ? "paid" : mapped === "FAILED" ? "failed" : "expired";

          const { transitioned, prior } = await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", "needs_review", ""],
            updates: {
              status: firestoreStatus,
              paymentProvider: "wallid",
              paymentRef: apiPaymentId,
              paymentUpdatedAt: new Date(),
              reconciledViaMonitor: true,
              ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
              ...(firestoreStatus !== "paid"
                ? { paymentFailureReason: remoteStatus }
                : {}),
            },
          });

          if (!transitioned) continue;
          reconciled += 1;
          transitions.push({ orderId, to: firestoreStatus });

          if (firestoreStatus === "paid" && prior) {
            const customerObj = (prior.customer as Record<string, unknown> | undefined) || {};
            const to = String(prior.customerEmail ?? prior.email ?? customerObj.email ?? "");
            if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
              try {
                const { paymentConfirmedEmail } = await import("@/templates/paymentConfirmedEmail");
                const firstName =
                  String(
                    (prior.firstName as string) ||
                      (customerObj.firstName as string) ||
                      (prior.customerName as string) ||
                      "",
                  ).split(" ")[0] || "there";
                const amount = Number(
                  (prior.totalAmount as number) ?? (prior.total as number) ?? 0,
                );
                const reference = String(prior.orderNumber ?? orderId);
                const { subject, html, text } = paymentConfirmedEmail({
                  firstName,
                  orderNumber: reference,
                  amount,
                  paymentMethod: "Open Banking (Wallid)",
                  paidAt: new Date(),
                });
                await enqueueMailOnce(`payment-confirmed:${orderId}`, {
                  to,
                  message: { subject, html, text },
                  source: "wallid:monitor",
                });
              } catch (mailErr) {
                console.warn(
                  "[Wallid monitor] Mail enqueue failed:",
                  mailErr instanceof Error ? mailErr.message : mailErr,
                );
              }
            }
          }
        }

        // 4) Admin alert when > threshold orders had to be rescued in the
        // last hour (this run only — idempotent across the hour bucket).
        if (reconciled + flaggedReview > STUCK_ALERT_THRESHOLD) {
          const bucketHour = new Date(nowMs).toISOString().slice(0, 13); // YYYY-MM-DDTHH
          const subject = `[PH Labs] Wallid auto-reconciled ${reconciled + flaggedReview} stuck order(s)`;
          const lines = transitions
            .map((t) => `  • ${t.orderId} → ${t.to}`)
            .join("\n") || "  (none reconciled — all stuck orders flagged needs_review)";
          const text =
            `Wallid monitor swept ${checked} candidate order(s) in window=${windowHours}h.\n\n` +
            `Reconciled: ${reconciled}\nFlagged needs_review: ${flaggedReview}\n` +
            `Webhook never delivered for: ${webhookMissing}\n\n` +
            `Transitions:\n${lines}\n\n` +
            `Investigate the Wallid webhook URL + delivery logs.`;
          const html = `<p>${text.replace(/\n/g, "<br/>")}</p>`;
          try {
            await enqueueMailOnce(`wallid-monitor-alert:${bucketHour}`, {
              to: ADMIN_ALERT_EMAIL,
              message: { subject, html, text },
              source: "wallid:monitor-alert",
            });
          } catch (e) {
            console.warn("[Wallid monitor] alert enqueue failed:", e instanceof Error ? e.message : e);
          }
        }

        // Persist last-run summary so /wallid-alerts can read rescue load.
        try {
          await supabaseAdmin
            .from("app_config")
            .upsert(
              {
                key: "wallid:last-monitor-run",
                value: JSON.stringify({
                  at: new Date(nowMs).toISOString(),
                  checked,
                  reconciled,
                  flaggedReview,
                  webhookMissing,
                  windowHours,
                  transitions: transitions.slice(0, 50),
                }),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key" },
            );
        } catch (e) {
          console.warn("[Wallid monitor] last-run persist failed:", e instanceof Error ? e.message : e);
        }

        return json({
          checked,
          reconciled,
          flaggedReview,
          webhookMissing,
          windowHours,
          transitions,
        });
      },
    },
  },
});
