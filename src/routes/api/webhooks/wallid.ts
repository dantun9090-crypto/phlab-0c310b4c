/**
 * Wallid Pay-by-Bank webhook receiver — public URL alias.
 *
 * Registered on Wallid's side as: https://phlabs.co.uk/api/webhooks/wallid
 *
 * This file mirrors `/api/public/hooks/wallid` so that the exact URL
 * configured in the Wallid dashboard is served by the real handler
 * instead of falling through to the SPA HTML.
 *
 * Same security guarantees:
 *   - HMAC-SHA256 over `${X-Webhook-Timestamp}.${rawBody}` (constant-time)
 *   - 300s replay window on X-Webhook-Timestamp
 *   - 20 req/min/IP rate limit
 *   - Idempotency via `wallid_webhook_events.event_id` UNIQUE index
 *   - Order status fan-out: SUCCESS → paid, FAILED → failed, EXPIRED → expired
 */
import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyHmacSignature } from "@/lib/webhook-signature";

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
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function textResp(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
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

export const Route = createFileRoute("/api/webhooks/wallid")({
  server: {
    handlers: {
      GET: async () => textResp("Method Not Allowed", 405),
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, "/api/webhooks/wallid", {
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

        const ok = await verifyHmacSignature(`${ts}.${rawBody}`, sig, secret);
        if (!ok) {
          console.warn("[Wallid webhook /api/webhooks/wallid] Invalid signature", { ip, eventCount });
          return textResp("Invalid signature", 400);
        }

        let body: WallidWebhookBody = {};
        try {
          const parsed = JSON.parse(rawBody);
          body = Array.isArray(parsed) ? { events: parsed } : parsed;
        } catch {
          return textResp("Invalid JSON", 400);
        }
        const events = Array.isArray(body.events) ? body.events : [];

        console.log("[Wallid webhook /api/webhooks/wallid]", {
          ts,
          ip,
          eventCount,
          firstEventId: events[0]?.event_id || events[0]?.id || null,
        });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          await supabaseAdmin.from("wallid_webhook_events").insert({
            event_id: `__log_${ts}_${ip}_${Math.random().toString(36).slice(2, 8)}`,
            raw: { ts, ip, eventCount, body: rawBody, alias: "/api/webhooks/wallid" } as never,
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
            if ((insertErr as { code?: string }).code === "23505") continue;
            console.error("[Wallid webhook] Insert failed", insertErr.message);
            return json({ error: "Processing error" }, 500);
          }

          try {
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

            if (orderId) {
              try {
                const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
                const firestoreStatus =
                  status === "SUCCESS" ? "paid"
                  : status === "FAILED" ? "failed"
                  : status === "EXPIRED" ? "expired"
                  : null;
                if (firestoreStatus) {
                  // ATOMIC: snapshot-isolated transition. Concurrent retries /
                  // poller / reconcile cron all see transitioned:false and
                  // skip the duplicate write + email.
                  const { transitioned, prior } = await transitionDocStatusAdmin(
                    "orders",
                    orderId,
                    {
                      allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
                      updates: {
                        status: firestoreStatus,
                        paymentProvider: "wallid",
                        paymentRef: ev.payment_ref || ev.paymentRef || apiPaymentId || null,
                        paymentUpdatedAt: new Date(),
                        ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
                        ...(status === "FAILED" || status === "EXPIRED"
                          ? { paymentFailureReason: ev.reason || status }
                          : {}),
                      },
                    },
                  );

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
          }
        }

        return json({ received: true, processed });
      },
    },
  },
});
