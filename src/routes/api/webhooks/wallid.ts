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
import { verifyWallidSignature, computeHmacHex } from "@/lib/webhook-signature";
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

function textResp(body: string, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", ...NO_STORE_HEADERS, ...(extraHeaders || {}) },
  });
}

/**
 * Retryable error response. Uses HTTP 503 + `Retry-After` so Wallid retries
 * the delivery on their normal schedule instead of applying the
 * exponential-backoff / circuit-breaker most vendors trigger on 5xx.
 * NEVER return a bare 500 from this route: it can silence webhook
 * delivery entirely, which is exactly the failure mode we hit on 23 Jun.
 */
function retryableResp(reason: string): Response {
  console.error("[Wallid webhook] retryable failure ->", reason);
  return textResp("Try again later", 503, { "retry-after": "30" });
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
        const startedAt = Date.now();
        const receivedAt = new Date().toISOString();

        // Common context captured up-front so every early return can
        // still write a full attempt log + alert.
        const ip = getClientIp(request);
        const ts = request.headers.get("x-webhook-timestamp") || request.headers.get("x-wallid-timestamp") || "";
        const sig =
          request.headers.get("x-webhook-signature") ||
          request.headers.get("x-wallid-signature") ||
          request.headers.get("x-signature") ||
          "";
        const sigHeaderName =
          (request.headers.get("x-webhook-signature") && "x-webhook-signature") ||
          (request.headers.get("x-wallid-signature") && "x-wallid-signature") ||
          (request.headers.get("x-signature") && "x-signature") ||
          "none";
        const eventIdHeader = request.headers.get("x-wallid-event-id") || request.headers.get("x-webhook-event-id") || "";
        const eventCount = Number(request.headers.get("x-webhook-event-count") || 0);
        const userAgent = request.headers.get("user-agent") || "";
        const contentLength = Number(request.headers.get("content-length") || 0);

        // Helper to close out every code path with a logged attempt row.
        const finish = async (
          resp: Response,
          outcome: import("@/lib/server/webhook-alerts").WebhookOutcome,
          extras?: { errorMessage?: string | null; alertHeadline?: string; alertMeta?: Record<string, unknown> },
        ): Promise<Response> => {
          const durationMs = Date.now() - startedAt;
          try {
            const { logWebhookAttempt, alertWebhookIssue, clearWebhookAlert } = await import(
              "@/lib/server/webhook-alerts"
            );
            await logWebhookAttempt({
              ip,
              userAgent,
              sigHeaderName,
              timestampHeader: ts || null,
              eventIdHeader: eventIdHeader || null,
              eventCount: eventCount || null,
              contentLength: contentLength || null,
              outcome,
              httpStatus: resp.status,
              durationMs,
              errorMessage: extras?.errorMessage ?? null,
            });

            const isFailure =
              outcome === "invalid_signature" ||
              outcome === "event_insert_failed" ||
              outcome === "retryable_error" ||
              outcome === "no_secret" ||
              outcome === "handler_exception";

            if (isFailure) {
              await alertWebhookIssue(
                `webhook_${outcome}`,
                extras?.alertHeadline ?? `Wallid webhook returned ${resp.status} (${outcome})`,
                {
                  ip,
                  durationMs,
                  eventCount,
                  sigHeaderName,
                  contentLength,
                  ...(extras?.alertMeta ?? {}),
                },
              );
            } else if (outcome === "accepted") {
              // Any successful delivery clears the "webhook is broken"
              // banner so we don't alert-storm the next transient blip.
              await Promise.all([
                clearWebhookAlert("webhook_invalid_signature"),
                clearWebhookAlert("webhook_event_insert_failed"),
                clearWebhookAlert("webhook_retryable_error"),
                clearWebhookAlert("webhook_no_secret"),
                clearWebhookAlert("webhook_handler_exception"),
              ]);
            }
          } catch (e) {
            console.warn("[Wallid webhook] finish logging failed:", e instanceof Error ? e.message : e);
          }
          return resp;
        };

        const limited = await enforceRateLimit(request, "/api/webhooks/wallid", {
          limit: 20,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return finish(limited, "rate_limited");

        console.log("[Wallid webhook] rcv", {
          route: "/api/webhooks/wallid",
          receivedAt,
          ip,
          userAgent: userAgent.slice(0, 120),
          ts,
          sigHeaderName,
          sigPrefix: sig.slice(0, 12),
          eventId: eventIdHeader,
          eventCount,
          contentLength,
        });

        const secret = process.env.WALLID_WEBHOOK_SECRET;
        if (!secret) {
          return finish(
            retryableResp("WALLID_WEBHOOK_SECRET missing"),
            "no_secret",
            { errorMessage: "WALLID_WEBHOOK_SECRET missing", alertHeadline: "Webhook secret is not configured" },
          );
        }

        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {
          return finish(textResp("Invalid body", 400), "invalid_body", { errorMessage: "request.text() failed" });
        }

        const tsNum = Number(ts);
        if (!ts || !Number.isFinite(tsNum)) {
          return finish(
            textResp("Missing or invalid X-Webhook-Timestamp", 400),
            "missing_timestamp",
            { errorMessage: `ts=${ts}` },
          );
        }
        if (Math.abs(Date.now() / 1000 - tsNum) > 300) {
          return finish(textResp("Stale timestamp", 400), "stale_timestamp", { errorMessage: `ts=${ts}` });
        }

        const match = await verifyWallidSignature(ts, rawBody, sig, secret);
        if (!match) {
          const provided = sig.startsWith("sha256=") ? sig.slice(7) : sig;
          const receivedPrefix = provided.slice(0, 12);
          let expectedPrefix = "";
          try {
            expectedPrefix = (await computeHmacHex(`${ts}.${rawBody}`, secret)).slice(0, 12);
          } catch { /* ignore */ }
          console.warn("[Wallid webhook] INVALID_SIGNATURE", {
            route: "/api/webhooks/wallid",
            ip,
            ts,
            eventId: eventIdHeader,
            eventCount,
            sigHeaderName,
            receivedPrefix,
            expectedPrefix,
            bodyLen: rawBody.length,
          });
          return finish(
            textResp("Invalid signature", 400),
            "invalid_signature",
            {
              errorMessage: `sig mismatch (received=${receivedPrefix} expected=${expectedPrefix})`,
              alertHeadline: "Invalid webhook signature — Wallid secret may be rotated or misconfigured.",
              alertMeta: { receivedPrefix, expectedPrefix, sigHeaderName },
            },
          );
        }

        let body: WallidWebhookBody = {};
        try {
          const parsed = JSON.parse(rawBody);
          body = Array.isArray(parsed) ? { events: parsed } : parsed;
        } catch {
          return finish(textResp("Invalid JSON", 400), "invalid_json", { errorMessage: "JSON.parse failed" });
        }
        const events = Array.isArray(body.events) ? body.events : [];

        console.log("[Wallid webhook] verified", {
          ts,
          ip,
          eventCount,
          firstEventId: events[0]?.event_id || events[0]?.id || null,
          firstStatus: events[0]?.status || events[0]?.type || null,
          firstPaymentId: events[0]?.api_payment_id || events[0]?.apiPaymentId || null,
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

        try {
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
              if ((insertErr as { code?: string }).code === "23505") {
                try {
                  const { data: orig } = await supabaseAdmin
                    .from("wallid_webhook_events")
                    .select("processed_at")
                    .eq("event_id", eventId)
                    .maybeSingle();
                  await supabaseAdmin.from("wallid_webhook_duplicates").insert({
                    event_id: eventId,
                    api_payment_id: apiPaymentId,
                    order_id: orderId,
                    original_processed_at: (orig?.processed_at as string | undefined) ?? null,
                    ip,
                    payload_summary: { status, occurredAt } as never,
                  });
                } catch { /* non-blocking */ }
                continue;
              }
              console.error("[Wallid webhook] Insert failed", insertErr.message);
              return finish(
                retryableResp(`event insert failed: ${insertErr.message}`),
                "event_insert_failed",
                {
                  errorMessage: insertErr.message,
                  alertHeadline: "Webhook event insert into Supabase failed — Wallid will retry.",
                  alertMeta: { eventId, apiPaymentId, orderId },
                },
              );
            }

            try {
              // Guarded against downgrades + out-of-order deliveries so
              // repeat callbacks can't flip SUCCESS back to PENDING.
              const { applyWallidPaymentUpdate } = await import("@/lib/server/wallid-idempotency");
              const guardRes = await applyWallidPaymentUpdate({
                supabaseAdmin,
                apiPaymentId,
                orderId,
                status,
                occurredAt,
                event: ev as Record<string, unknown>,
              });
              if (!guardRes.applied && guardRes.reason === "no_identifier") {
                console.error("[Wallid webhook] Refusing UPDATE — no api_payment_id or order_id", eventId);
              }

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
                    console.error("[Wallid webhook /api/webhooks/wallid] UNKNOWN status — flagging for review:", {
                      eventId, orderId, apiPaymentId, rawStatus: ev.status || ev.type,
                    });
                  }
                  if (firestoreStatus) {
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

                    try {
                      const reliability = await import("@/lib/payment-reliability.server");
                      if (apiPaymentId) {
                        await reliability.recordWebhookEventAdmin(apiPaymentId, {
                          orderId,
                          source: "wallid_webhook",
                          status: "processed",
                          payload: ev as Record<string, unknown>,
                        });
                        await reliability.dequeueRetryAdmin(apiPaymentId);
                      }
                      if (transitioned) {
                        await reliability.writePaymentTimelineAdmin(orderId, {
                          actor: "wallid_webhook",
                          eventType:
                            firestoreStatus === "paid" ? "payment_received"
                            : firestoreStatus === "failed" || firestoreStatus === "expired" ? "payment_failed"
                            : "reconciliation_run",
                          statusFrom: String(prior?.status ?? ""),
                          statusTo: firestoreStatus,
                          apiPaymentId: apiPaymentId || undefined,
                          metadata: { wallidStatus: ev.status || ev.type || null },
                        });
                      }
                    } catch (audErr) {
                      console.warn(
                        "[Wallid webhook] audit-trail write skipped:",
                        audErr instanceof Error ? audErr.message : audErr,
                      );
                    }
                  }
                } catch (e) {
                  console.warn("[Wallid webhook] Firestore order update skipped:", e instanceof Error ? e.message : e);
                  if (apiPaymentId) {
                    try {
                      const { enqueueRetryAdmin } = await import("@/lib/payment-reliability.server");
                      await enqueueRetryAdmin({
                        orderId,
                        apiPaymentId,
                        payload: ev as Record<string, unknown>,
                        error: e instanceof Error ? e.message : String(e),
                        source: "wallid_webhook",
                      });
                    } catch { /* non-blocking */ }
                  }
                }
              }

              processed += 1;
            } catch (e) {
              console.error("[Wallid webhook] Event apply failed:", e);
            }
          }

          return finish(json({ received: true, processed }), "accepted");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[Wallid webhook] Handler exception:", msg);
          return finish(
            retryableResp(`handler exception: ${msg}`),
            "handler_exception",
            {
              errorMessage: msg,
              alertHeadline: "Wallid webhook handler threw an exception — check logs.",
            },
          );
        }
      },
    },
  },
});

