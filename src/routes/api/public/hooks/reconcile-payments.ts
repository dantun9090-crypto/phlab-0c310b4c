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
 * Stub — replace with a real Wallid status GET when we wire the
 * outbound API client in. Returns the provider-level status string
 * (lowercased) or null when unknown.
 *
 * TODO: implement using WALLID_KEY_ID + WALLID_KEY_SECRET (see
 * scripts/wallid-status.mjs for the exact request shape).
 */
async function queryWallidPaymentStatus(_apiPaymentId: string): Promise<string | null> {
  return null;
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
          if (attemptCount >= 5) {
            results.skipped += 1;
            continue;
          }

          const rawStatus = String(
            (payload as { status?: string; type?: string }).status ||
              (payload as { type?: string }).type ||
              "",
          );
          const newStatus = mapWallidStatusToInternal(rawStatus);
          const firestoreStatus =
            newStatus === "paid" ? "paid"
            : newStatus === "failed" ? "failed"
            : newStatus === "cancelled" ? "cancelled"
            : newStatus === "refunded" ? "refunded"
            : null;

          if (!firestoreStatus) {
            results.skipped += 1;
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
