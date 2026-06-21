/**
 * Wallid Pay-by-Bank webhook receiver.
 *
 * URL to configure in Wallid: https://phlabs.co.uk/api/public/hooks/wallid
 *
 * Runs on the same Cloudflare Workers edge runtime as the rest of the site
 * (TanStack Start server route). Implements:
 *   - HMAC-SHA256 verification of `${timestamp}.${rawBody}` with constant-time compare
 *   - 300s replay protection on X-Webhook-Timestamp
 *   - 20 req/min/IP rate limit
 *   - Idempotency via `wallid_webhook_events.event_id` UNIQUE index
 *   - Order status fan-out: SUCCESS → paid, FAILED → failed, EXPIRED → expired
 *   - Updates the `wallid_payments` row, logs the raw payload, and triggers
 *     a confirmation email on the first transition to paid.
 *
 * Wallid signing spec:
 *   message = `${X-Webhook-Timestamp}.${raw_request_body}`
 *   header  = `sha256=${hex(HMAC_SHA256(WALLID_WEBHOOK_SECRET, message))}`
 */
import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyHmacSignature } from "@/lib/webhook-signature";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";

interface WallidEvent {
  event_id?: string;
  id?: string;
  api_payment_id?: string;
  apiPaymentId?: string;
  order_id?: string;
  orderId?: string;
  status?: string;
  type?: string;
  occurred_at?: string;
  occurredAt?: string;
  reason?: string;
  payment_ref?: string;
  paymentRef?: string;
  [k: string]: unknown;
}

interface WallidWebhookBody {
  events?: WallidEvent[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE_HEADERS },
  });
}

function textResp(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", ...NO_STORE_HEADERS },
  });
}

function normaliseStatus(s: string | undefined): "SUCCESS" | "FAILED" | "EXPIRED" | "PENDING" | "OTHER" {
  const u = String(s || "").toUpperCase();
  if (u === "SUCCESS" || u === "PAID" || u === "COMPLETED") return "SUCCESS";
  if (u === "FAILED" || u === "DECLINED" || u === "CANCELLED" || u === "CANCELED") return "FAILED";
  if (u === "EXPIRED") return "EXPIRED";
  if (u === "PENDING" || u === "PROCESSING") return "PENDING";
  return "OTHER";
}

export const Route = createFileRoute("/api/public/hooks/wallid")({
  server: {
    handlers: {
      GET: async () => textResp("Method Not Allowed", 405),
      POST: async ({ request }) => {
        // 4. Rate limit (20/min/IP).
        const limited = await enforceRateLimit(request, "/api/public/hooks/wallid", {
          limit: 20,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const secret = process.env.WALLID_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[Wallid webhook] WALLID_WEBHOOK_SECRET missing");
          return textResp("Server misconfigured", 500);
        }

        // 1. Read RAW body before any JSON parse.
        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {
          return textResp("Invalid body", 400);
        }

        const ts = request.headers.get("x-webhook-timestamp") || "";
        const sig = request.headers.get("x-webhook-signature") || "";
        const eventCount = Number(request.headers.get("x-webhook-event-count") || 0);
        const ip = getClientIp(request);

        const tsNum = Number(ts);
        if (!ts || !Number.isFinite(tsNum)) {
          return textResp("Missing or invalid X-Webhook-Timestamp", 400);
        }
        if (Math.abs(Date.now() / 1000 - tsNum) > 300) {
          return textResp("Stale timestamp", 400);
        }

        // Verify HMAC over `${timestamp}.${rawBody}`.
        const ok = await verifyHmacSignature(`${ts}.${rawBody}`, sig, secret);
        if (!ok) {
          console.warn("[Wallid webhook] Invalid signature", { ip, eventCount });
          return textResp("Invalid signature", 400);
        }

        // Parse body now that signature is verified.
        let body: WallidWebhookBody = {};
        try {
          const parsed = JSON.parse(rawBody);
          // Wallid documents both `{events: [...]}` and a bare array.
          body = Array.isArray(parsed) ? { events: parsed } : parsed;
        } catch {
          return textResp("Invalid JSON", 400);
        }
        const events = Array.isArray(body.events) ? body.events : [];

        // 3. Per-request log.
        console.log("[Wallid webhook]", {
          ts,
          ip,
          eventCount,
          firstEventId: events[0]?.event_id || events[0]?.id || null,
        });

        // Lazy-load admin client (server-only — must stay inside the handler).
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Log the raw payload for 7-day retention (cleanup job can prune).
        try {
          await supabaseAdmin.from("wallid_webhook_events").insert({
            event_id: `__log_${ts}_${ip}_${Math.random().toString(36).slice(2, 8)}`,
            raw: { ts, ip, eventCount, body: rawBody } as never,
            status: "LOG",
          });
        } catch {
          /* non-blocking */
        }

        let processed = 0;
        for (const ev of events) {
          const eventId = String(ev.event_id || ev.id || "").trim();
          if (!eventId) continue;

          const apiPaymentId = String(ev.api_payment_id || ev.apiPaymentId || "").trim() || null;
          const orderId = String(ev.order_id || ev.orderId || "").trim() || null;
          const status = normaliseStatus(ev.status || ev.type);
          const occurredAt = ev.occurred_at || ev.occurredAt
            ? new Date(ev.occurred_at || ev.occurredAt!).toISOString()
            : null;

          // 2a. Idempotency — UNIQUE(event_id) on insert; duplicate = skip.
          const { error: insertErr } = await supabaseAdmin
            .from("wallid_webhook_events")
            .insert({
              event_id: eventId,
              api_payment_id: apiPaymentId,
              order_id: orderId,
              status,
              occurred_at: occurredAt,
              raw: ev as never,
            });

          if (insertErr) {
            // 23505 = unique_violation → already processed, treat as success.
            if ((insertErr as { code?: string }).code === "23505") continue;
            console.error("[Wallid webhook] Insert failed", insertErr.message);
            // Surface a 500 so Wallid retries the batch.
            return json({ error: "Processing error" }, 500);
          }

          // 2c. Apply to our wallid_payments row + downstream order updates.
          try {
            // Locate the payment row by api_payment_id (preferred) or order_id.
            // CRITICAL: must have at least one identifier or we'd UPDATE the
            // entire wallid_payments table.
            if (apiPaymentId) {
              await supabaseAdmin
                .from("wallid_payments")
                .update({ status, metadata: { lastEvent: ev } as never })
                .eq("api_payment_id", apiPaymentId);
            } else if (orderId) {
              await supabaseAdmin
                .from("wallid_payments")
                .update({ status, metadata: { lastEvent: ev } as never })
                .eq("order_id", orderId);
            } else {
              console.error("[Wallid webhook] Refusing UPDATE — no api_payment_id or order_id", eventId);
            }

            // Fan-out to Firestore order doc — best-effort, never block ack.
            if (orderId) {
              try {
                const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
                const firestoreStatus =
                  status === "SUCCESS" ? "paid"
                  : status === "FAILED" ? "failed"
                  : status === "EXPIRED" ? "expired"
                  : status === "OTHER" ? "needs_review"
                  : null;

                if (status === "OTHER") {
                  // Item 2: log the unknown raw status loudly so we can
                  // extend the mapper later. We still flag the order for
                  // human review rather than leaving it silently pending.
                  console.error("[Wallid webhook] UNKNOWN status received — flagging for review:", {
                    eventId,
                    orderId,
                    apiPaymentId,
                    rawStatus: ev.status || ev.type,
                  });
                }

                if (firestoreStatus) {
                  // ATOMIC: only transition out of non-terminal states. If a
                  // concurrent webhook delivery / status poll / reconcile cron
                  // already moved the order, this returns transitioned:false
                  // and we skip both the duplicate paidAt write and the email.
                  //
                  // `needs_review` is included in allowFrom so a later SUCCESS
                  // webhook still flips the order to paid.
                  const { transitioned, prior } = await transitionDocStatusAdmin(
                    "orders",
                    orderId,
                    {
                      allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", "needs_review", ""],
                      updates: {
                        status: firestoreStatus,
                        paymentProvider: "wallid",
                        paymentRef: ev.payment_ref || ev.paymentRef || apiPaymentId || null,
                        paymentUpdatedAt: new Date(),
                        ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
                        ...(status === "FAILED" || status === "EXPIRED"
                          ? { paymentFailureReason: ev.reason || status }
                          : {}),
                        ...(firestoreStatus === "needs_review"
                          ? { paymentFailureReason: `Unknown Wallid status: ${ev.status || ev.type || "n/a"}` }
                          : {}),
                      },
                    },
                  );

                  // Send branded payment-received email ONLY when this delivery
                  // is the one that flipped the order to paid.
                  if (transitioned && firestoreStatus === "paid" && prior) {
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
                          (prior.totalAmount as number) ??
                            (prior.total as number) ??
                            0,
                        );
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
                          source: "wallid:webhook",
                        });
                      } catch (mailErr) {
                        console.warn("[Wallid webhook] Mail enqueue failed:", mailErr instanceof Error ? mailErr.message : mailErr);
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn("[Wallid webhook] Firestore order update skipped:", e instanceof Error ? e.message : e);
              }
            }

            processed += 1;
          } catch (e) {
            console.error("[Wallid webhook] Event apply failed:", e);
            // Don't 500 here — we already persisted the event row; let Wallid
            // think we've got it. Reconciliation happens via status polling.
          }
        }

        return json({ received: true, processed });
      },
    },
  },
});
