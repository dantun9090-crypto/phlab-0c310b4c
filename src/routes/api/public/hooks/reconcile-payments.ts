/**
 * Payment reconciliation cron.
 *
 * URL: POST https://phlabs.co.uk/api/public/hooks/reconcile-payments
 * Auth: `x-cron-secret: ${CRON_SECRET}` header (constant-time compare).
 *
 * Called every 5 minutes by the `wallid-reconcile.yml` GitHub Actions
 * workflow. Two responsibilities:
 *
 *   1. Drain `retryQueue` — events the webhook failed to fully apply.
 *      For each ready item (nextAttemptAt <= now, attemptCount < 5):
 *        - re-run the Firestore order transition using the stored payload,
 *        - honour `isStatusConflict` (downgrades are refused, doc marked
 *          `conflict` in webhookEvents),
 *        - on success: mirror to webhookEvents, append timeline event,
 *          delete the retryQueue row,
 *        - on failure: bump attemptCount + push nextAttemptAt forward
 *          using the shared backoff schedule.
 *
 *   2. Stuck-order sweep — orders still `pending`/`pending_payment` after
 *      30 minutes with no lastWebhookAt/lastReconciledAt. Poll Wallid
 *      directly and, if it reports a terminal state, apply it.
 *
 * Idempotent by construction: same api_payment_id keys the retryQueue row
 * and the Supabase `wallid_webhook_events.event_id` UNIQUE index still
 * dedups any Wallid re-deliveries that arrive alongside.
 */
import { createFileRoute } from "@tanstack/react-router";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import {
  mapWallidStatusToInternal,
  isStatusConflict,
  RETRY_BACKOFF_MINUTES,
} from "@/lib/paymentStatus";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
  });
}

/**
 * Fetch the current provider status for a Wallid payment. Returns the
 * raw status string (e.g. "SUCCESS", "FAILED", "PENDING") or null if
 * the call fails / the payment is unknown.
 */
async function queryWallidPaymentStatus(apiPaymentId: string): Promise<string | null> {
  if (!apiPaymentId) return null;
  try {
    const { getWallidStatus } = await import("@/lib/wallid.server");
    const r = await getWallidStatus(apiPaymentId);
    return r.status ? String(r.status) : null;
  } catch (e) {
    console.warn("[reconcile] Wallid status fetch failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Look up the latest Wallid api_payment_id for an order from Supabase
 * when the Firestore order doc has no paymentRef yet (webhook never
 * fired, so we never wrote it back). Returns null if none found.
 */
async function lookupApiPaymentIdForOrder(orderId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("wallid_payments")
      .select("api_payment_id")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.api_payment_id ? String(data.api_payment_id) : null;
  } catch (e) {
    console.warn("[reconcile] wallid_payments lookup failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function sendPaymentConfirmedEmail(
  orderId: string,
  apiPaymentId: string,
  prior: Record<string, unknown>,
): Promise<void> {
  const customerObj = (prior.customer as Record<string, unknown> | undefined) || {};
  const to = String(prior.customerEmail ?? prior.email ?? customerObj.email ?? "");
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return;
  try {
    const { paymentConfirmedEmail } = await import("@/templates/paymentConfirmedEmail");
    const firstName =
      String(
        (prior.firstName as string) ||
          (customerObj.firstName as string) ||
          (prior.customerName as string) ||
          "",
      ).split(" ")[0] || "there";
    const amount = Number((prior.totalAmount as number) ?? (prior.total as number) ?? 0);
    const reference = String(prior.orderNumber ?? orderId);
    const { subject, html, text } = paymentConfirmedEmail({
      firstName,
      orderNumber: reference,
      amount,
      paymentMethod: "Open Banking (Wallid)",
      paidAt: new Date(),
    });
    const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
    await enqueueMailOnce(`payment-confirmed:${orderId}`, {
      to,
      message: { subject, html, text },
      source: `wallid:reconcile:${apiPaymentId}`,
    });
  } catch (mailErr) {
    console.warn("[reconcile] Mail enqueue failed:", mailErr instanceof Error ? mailErr.message : mailErr);
  }
}


export const Route = createFileRoute("/api/public/hooks/reconcile-payments")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method Not Allowed", { status: 405, headers: NO_STORE_HEADERS }),
      POST: async ({ request }) => {
        // ---- auth ---------------------------------------------------
        const expected = process.env.CRON_SECRET || "";
        const provided = request.headers.get("x-cron-secret") || "";
        if (!expected || provided.length !== expected.length) {
          return json({ error: "forbidden" }, 403);
        }
        // constant-time compare
        let diff = 0;
        for (let i = 0; i < expected.length; i++) {
          diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
        }
        if (diff !== 0) return json({ error: "forbidden" }, 403);

        const results = { processed: 0, failed: 0, skipped: 0, conflicts: 0, stuck: 0 };

        const [{ listDocsAdmin, updateDocAdmin, transitionDocStatusAdmin }, reliability] =
          await Promise.all([
            import("@/lib/server/firestore-admin"),
            import("@/lib/payment-reliability.server"),
          ]);

        // ---- 1) drain retryQueue -----------------------------------
        let queue: Array<Record<string, unknown> & { id: string }> = [];
        try {
          queue = await listDocsAdmin("retryQueue", {
            orderBy: "nextAttemptAt",
            direction: "ASCENDING",
            limit: 50,
            rangeFilter: { field: "nextAttemptAt", lte: new Date() },
          });
        } catch (e) {
          console.error("[reconcile] retryQueue query failed:", e);
        }

        for (const item of queue) {
          const apiPaymentId = String(item.apiPaymentId || item.id || "");
          const orderId = String(item.orderId || "");
          const payload = (item.payload as Record<string, unknown>) || {};
          const attemptCount = Number(item.attemptCount ?? 1);
          const source = String((item as { source?: string }).source || "");
          const isManualRetry = source === "manual_retry";

          // Exhausted attempts: dequeue so we don't scan it forever.
          if (attemptCount >= 5) {
            results.skipped += 1;
            try {
              await reliability.dequeueRetryAdmin(apiPaymentId);
            } catch (e) {
              console.warn("[reconcile] dequeue (max attempts) failed:", e);
            }
            continue;
          }

          let rawStatus = String(
            (payload as { status?: string; type?: string }).status ||
              (payload as { type?: string }).type ||
              "",
          );

          // Manual retries have no webhook payload — poll the provider
          // directly so we still have a chance to resolve the row.
          if (!rawStatus && (isManualRetry || Object.keys(payload).length === 0)) {
            const providerStatus = await queryWallidPaymentStatus(apiPaymentId);
            if (providerStatus) rawStatus = providerStatus.toLowerCase();
          }

          const newStatus = mapWallidStatusToInternal(rawStatus);
          const firestoreStatus =
            newStatus === "paid" ? "paid"
            : newStatus === "failed" ? "failed"
            : newStatus === "cancelled" ? "cancelled"
            : newStatus === "refunded" ? "refunded"
            : null;

          if (!firestoreStatus) {
            results.skipped += 1;
            // Manual retries with no actionable status must be dequeued —
            // otherwise nextAttemptAt <= now matches on every cron tick and
            // starves real webhook-failure retries.
            if (isManualRetry) {
              try {
                await reliability.dequeueRetryAdmin(apiPaymentId);
                await reliability.writePaymentTimelineAdmin(orderId, {
                  actor: "cron_job",
                  eventType: "reconciliation_run",
                  statusFrom: "",
                  statusTo: "",
                  apiPaymentId,
                  metadata: {
                    source: "cron",
                    result: "manual_retry_no_status",
                    reason: "Provider returned no terminal status",
                  },
                });
              } catch (e) {
                console.warn("[reconcile] manual-retry dequeue failed:", e);
              }
            } else {
              // Webhook-sourced row with unrecognised status — bump the
              // counter and back off so we don't rescan every 5 minutes.
              const nextAttempt = attemptCount + 1;
              const backoffMin =
                RETRY_BACKOFF_MINUTES[
                  Math.min(nextAttempt - 1, RETRY_BACKOFF_MINUTES.length - 1)
                ];
              try {
                await updateDocAdmin("retryQueue", apiPaymentId, {
                  attemptCount: nextAttempt,
                  nextAttemptAt: new Date(Date.now() + backoffMin * 60_000),
                  lastError: `unmapped status: ${rawStatus || "(empty)"}`,
                });
              } catch (e) {
                console.warn("[reconcile] unmapped-status backoff failed:", e);
              }
            }
            continue;
          }

          try {
            const { transitioned, prior } = await transitionDocStatusAdmin(
              "orders",
              orderId,
              {
                allowFrom: [
                  "pending",
                  "pending_payment",
                  "awaiting_payment",
                  "processing_payment",
                  "needs_review",
                  "",
                ],
                updates: {
                  status: firestoreStatus,
                  paymentProvider: "wallid",
                  paymentRef: apiPaymentId,
                  paymentUpdatedAt: new Date(),
                  lastReconciledAt: new Date(),
                  ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
                },
              },
            );

            const priorStatus = String(prior?.status ?? "").toLowerCase();

            if (!transitioned && prior && isStatusConflict(priorStatus, firestoreStatus)) {
              results.conflicts += 1;
              await reliability.recordWebhookEventAdmin(apiPaymentId, {
                orderId,
                source: "cron_reconciliation",
                status: "conflict",
                payload,
                errorMessage: `conflict: ${priorStatus} → ${firestoreStatus}`,
              });
              await reliability.writePaymentTimelineAdmin(orderId, {
                actor: "cron_job",
                eventType: "conflict_detected",
                statusFrom: priorStatus,
                statusTo: firestoreStatus,
                apiPaymentId,
                metadata: { source: "cron", retryAttempt: attemptCount },
              });
              await reliability.dequeueRetryAdmin(apiPaymentId);
              continue;
            }

            if (!transitioned) {
              // Terminal state already; nothing to do.
              results.skipped += 1;
              await reliability.dequeueRetryAdmin(apiPaymentId);
              continue;
            }

            await reliability.recordWebhookEventAdmin(apiPaymentId, {
              orderId,
              source: "cron_reconciliation",
              status: "processed",
              payload,
            });
            await reliability.writePaymentTimelineAdmin(orderId, {
              actor: "cron_job",
              eventType: "reconciliation_run",
              statusFrom: priorStatus,
              statusTo: firestoreStatus,
              apiPaymentId,
              metadata: { retryAttempt: attemptCount, source: "cron" },
            });
            await reliability.dequeueRetryAdmin(apiPaymentId);
            results.processed += 1;
          } catch (e) {
            results.failed += 1;
            const nextAttempt = attemptCount + 1;
            const backoffMin =
              RETRY_BACKOFF_MINUTES[Math.min(nextAttempt - 1, RETRY_BACKOFF_MINUTES.length - 1)];
            try {
              await updateDocAdmin("retryQueue", apiPaymentId, {
                attemptCount: nextAttempt,
                nextAttemptAt: new Date(Date.now() + backoffMin * 60_000),
                lastError: e instanceof Error ? e.message.slice(0, 2000) : String(e).slice(0, 2000),
              });
            } catch (updErr) {
              console.warn("[reconcile] retryQueue backoff write failed:", updErr);
            }
          }
        }

        // ---- 2) stuck-order sweep ----------------------------------
        try {
          const cutoff = new Date(Date.now() - 30 * 60_000);
          const stuck = await listDocsAdmin("orders", {
            orderBy: "createdAt",
            direction: "ASCENDING",
            limit: 20,
            where: { field: "status", op: "EQUAL", value: "pending_payment" },
            rangeFilter: { field: "createdAt", lte: cutoff },
          });

          for (const order of stuck) {
            const orderId = String(order.id);
            const apiPaymentId =
              String((order as { paymentRef?: string; apiPaymentId?: string }).paymentRef ||
                (order as { apiPaymentId?: string }).apiPaymentId || "");
            if (!apiPaymentId) continue;
            if ((order as { lastWebhookAt?: unknown }).lastWebhookAt) continue;

            const providerStatus = await queryWallidPaymentStatus(apiPaymentId);
            if (!providerStatus || providerStatus.toLowerCase() === "pending") continue;

            const newStatus = mapWallidStatusToInternal(providerStatus);
            const firestoreStatus =
              newStatus === "paid" ? "paid"
              : newStatus === "failed" ? "failed"
              : newStatus === "cancelled" ? "cancelled"
              : newStatus === "refunded" ? "refunded"
              : null;
            if (!firestoreStatus) continue;

            const priorStatus = String(order.status ?? "").toLowerCase();
            const { transitioned } = await transitionDocStatusAdmin("orders", orderId, {
              allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
              updates: {
                status: firestoreStatus,
                paymentProvider: "wallid",
                paymentRef: apiPaymentId,
                lastReconciledAt: new Date(),
                paymentUpdatedAt: new Date(),
                ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
              },
            });
            if (!transitioned) continue;

            await reliability.recordWebhookEventAdmin(apiPaymentId, {
              orderId,
              source: "cron_reconciliation",
              status: "processed",
              payload: { source: "stuck_sweep", providerStatus },
            });
            await reliability.writePaymentTimelineAdmin(orderId, {
              actor: "cron_job",
              eventType: "reconciliation_run",
              statusFrom: priorStatus,
              statusTo: firestoreStatus,
              apiPaymentId,
              metadata: { reason: "Stuck order detected via cron", providerStatus },
            });
            results.stuck += 1;
            results.processed += 1;
          }
        } catch (e) {
          console.warn("[reconcile] stuck-order sweep failed:", e);
        }

        return json({ ok: true, ...results });
      },
    },
  },
});
