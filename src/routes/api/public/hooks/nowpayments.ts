/**
 * NOWPayments IPN (Instant Payment Notification) receiver.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/nowpayments
 * Set it in the NOWPayments dashboard (Settings → IPN callbacks); each
 * created invoice/payment also carries it as `ipn_callback_url`.
 *
 * Signature: `x-nowpayments-sig` = hex HMAC-SHA512 of the payload with all
 * object keys sorted alphabetically (recursive), keyed with
 * NOWPAYMENTS_IPN_SECRET. Unlike Fena/Wallid this is verified over the
 * canonical sorted re-serialisation, not the raw body bytes.
 *
 * Defence in depth: after signature verification we re-fetch the payment
 * from the NOWPayments API and mutate the order ONLY from the authoritative
 * response — a spoofed payload can never move an order on its own.
 *
 * Idempotency: the last processed NOWPayments status is stored on the order
 * (`nowpaymentsStatus`); repeat deliveries are acknowledged without writes.
 * The order status is never downgraded once paid.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  addDocAdmin,
  findDocByFieldAdmin,
  getDocAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  mapNowpaymentsStatus,
  nowpaymentsGetPayment,
  verifyNowpaymentsIpn,
} from "@/lib/payments/nowpayments.server";

import { paymentConfirmedEmail } from "@/templates/paymentConfirmedEmail";

interface NowpaymentsIpnBody {
  payment_id?: number | string;
  payment_status?: string;
  order_id?: string;
  pay_address?: string;
  price_amount?: number;
  price_currency?: string;
  pay_amount?: number;
  pay_currency?: string;
  actually_paid?: number;
}

async function logEvent(
  level: "info" | "warn" | "error",
  message: string,
  ctx: Record<string, unknown>,
) {
  try {
    await addDocAdmin("nowpayments_webhook_events", {
      level,
      message,
      ctx,
      createdAt: new Date(),
    });
  } catch {
    // never fail the webhook for a logging error
  }
}

export const Route = createFileRoute("/api/public/hooks/nowpayments")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        }),
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, "/api/public/hooks/nowpayments", {
          limit: 60,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        let bodyText = "";
        try {
          bodyText = await request.text();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (bodyText.length > 32_000) {
          return new Response("Payload too large", { status: 413 });
        }

        const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
        if (!ipnSecret) {
          await logEvent("error", "NOWPAYMENTS_IPN_SECRET not configured — rejecting", {});
          return new Response("Webhook secret not configured", { status: 503 });
        }

        let payload: NowpaymentsIpnBody;
        try {
          payload = JSON.parse(bodyText) as NowpaymentsIpnBody;
        } catch {
          await logEvent("warn", "invalid json", { raw: bodyText.slice(0, 500) });
          return new Response("Bad JSON", { status: 400 });
        }

        // HMAC-SHA512 over the canonical sorted payload is MANDATORY.
        const sigHeader = request.headers.get("x-nowpayments-sig");
        const sigOk = await verifyNowpaymentsIpn(payload, sigHeader, ipnSecret);
        if (!sigOk) {
          await logEvent("warn", "invalid signature", {
            hasHeader: Boolean(sigHeader),
            ip: request.headers.get("cf-connecting-ip") ?? null,
          });
          return new Response("Invalid signature", { status: 401 });
        }

        const paymentId = payload.payment_id != null ? String(payload.payment_id) : "";
        if (!paymentId) {
          await logEvent("warn", "missing payment_id", { payload });
          return new Response("Missing payment_id", { status: 400 });
        }

        // Find the matching order: our Firestore doc id is sent as `order_id`
        // at creation time, so it comes back in the IPN.
        let orderRow: Record<string, unknown> | null = null;
        let orderId: string | null = null;
        const ipnOrderId = typeof payload.order_id === "string" ? payload.order_id.trim() : "";
        if (ipnOrderId) {
          const direct = await getDocAdmin("orders", ipnOrderId);
          if (direct) {
            orderRow = direct as Record<string, unknown>;
            orderId = ipnOrderId;
          }
        }
        if (!orderRow) {
          orderRow = await findDocByFieldAdmin("orders", "nowpaymentsPaymentId", paymentId);
        }

        // Authoritative re-fetch — only we hold the API key, so this proves
        // the payment state regardless of what the (already verified) body says.
        const sandbox = orderRow?.nowpaymentsSandbox === true;
        let authoritativeStatus = String(payload.payment_status ?? "").toLowerCase();
        try {
          const authoritative = await nowpaymentsGetPayment(paymentId, sandbox);
          if (authoritative.payment_status) {
            authoritativeStatus = authoritative.payment_status.toLowerCase();
          }
        } catch (err) {
          await logEvent("error", "nowpayments api re-fetch failed", {
            paymentId,
            error: err instanceof Error ? err.message : String(err),
          });
          // 5xx → NOWPayments retries the IPN later.
          return new Response("Upstream verify failed", { status: 502 });
        }

        if (!orderRow || !orderId) {
          const orphanCtx = {
            paymentId,
            orderIdFromIpn: ipnOrderId || null,
            paymentStatus: authoritativeStatus,
            receivedAt: new Date().toISOString(),
            reason: "no_order_with_matching_nowpayments_reference",
          };
          try {
            await updateDocAdmin("nowpayments_orphan_payments", paymentId, {
              ...orphanCtx,
              lastSeenAt: new Date(),
            });
          } catch {
            try {
              await addDocAdmin("nowpayments_orphan_payments", {
                ...orphanCtx,
                lastSeenAt: new Date(),
              });
            } catch {/* swallow — webhook must not 5xx for logging */}
          }
          await logEvent("error", "ORPHAN: NOWPayments payment has no matching order", orphanCtx);
          // Ack so NOWPayments stops retrying; flagged for manual reconcile.
          return new Response("No matching order (logged as orphan)", { status: 200 });
        }

        const mapped = mapNowpaymentsStatus(authoritativeStatus);
        const currentStatus = String(orderRow.status ?? "pending").toLowerCase();
        const prevNpStatus = String(orderRow.nowpaymentsStatus ?? "").toLowerCase();

        // Idempotent replay: same status already recorded, and for "paid" the
        // confirmation email has already been dispatched.
        if (
          prevNpStatus === mapped.nowpaymentsStatus &&
          (!mapped.isPaid || orderRow.paidEmailDispatched === true)
        ) {
          await logEvent("info", "duplicate event ignored", {
            orderId,
            paymentId,
            nowpaymentsStatus: mapped.nowpaymentsStatus,
          });
          return new Response("Already processed", { status: 200 });
        }

        const updates: Record<string, unknown> = {
          nowpaymentsStatus: mapped.nowpaymentsStatus,
          nowpaymentsPaymentId: paymentId,
          nowpaymentsUpdatedAt: new Date(),
        };
        if (typeof payload.actually_paid === "number") {
          updates.nowpaymentsActuallyPaid = payload.actually_paid;
        }

        // Never downgrade a settled order (e.g. late "waiting"/"expired"
        // arriving after "finished").
        const settledStates = ["paid", "completed", "shipped", "fulfilled", "cancelled", "refunded"];
        if (mapped.isPaid) {
          updates.status = "paid";
          updates.paidAt = new Date();
          updates.paymentMethod = "Crypto (NOWPayments)";
        } else if (mapped.orderStatus && !settledStates.includes(currentStatus)) {
          updates.status = mapped.orderStatus;
        }

        let updateOk = false;
        let lastErr: unknown;
        for (let attempt = 0; attempt < 2 && !updateOk; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 750));
          try {
            await updateDocAdmin("orders", orderId, updates);
            updateOk = true;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!updateOk) {
          await logEvent("error", "order update failed", {
            orderId,
            paymentId,
            error: lastErr instanceof Error ? lastErr.message : String(lastErr),
          });
          return new Response("Order update failed", { status: 500 });
        }

        // Enqueue branded payment-received confirmation on the first paid
        // transition (same claim + dedupe pattern as the Fena handler).
        if (mapped.isPaid && currentStatus !== "paid") {
          let claimed = false;
          try {
            const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
            const res = await transitionDocStatusAdmin("orders", orderId, {
              allowFrom: ["paid"], // status was just set to paid above
              updates: { paidEmailDispatched: true },
            });
            const alreadyDispatched =
              res.prior && (res.prior as { paidEmailDispatched?: unknown }).paidEmailDispatched === true;
            claimed = res.transitioned && !alreadyDispatched;
          } catch (claimErr) {
            console.warn(
              "[NOWPayments] paid-email claim failed:",
              claimErr instanceof Error ? claimErr.message : claimErr,
            );
            claimed = true;
          }

          if (claimed) {
            const customerObj = (orderRow.customer as Record<string, unknown> | undefined) || {};
            const to = String(orderRow.customerEmail ?? orderRow.email ?? customerObj.email ?? "");
            if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
              try {
                const firstName =
                  String(
                    (orderRow.firstName as string) ||
                      (customerObj.firstName as string) ||
                      (orderRow.customerName as string) ||
                      "",
                  ).split(" ")[0] || "there";
                const amount = Number(
                  (orderRow.totalAmount as number) ??
                    (orderRow.total as number) ??
                    Number(payload.price_amount ?? 0),
                );
                const reference = String(orderRow.orderNumber ?? orderId);
                const { subject, html, text } = paymentConfirmedEmail({
                  firstName,
                  orderNumber: reference,
                  amount,
                  paymentMethod: "Crypto (NOWPayments)",
                  paidAt: new Date(),
                });
                const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
                await enqueueMailOnce(`payment-confirmed:${orderId}`, {
                  to,
                  message: { subject, html, text },
                  source: "nowpayments:webhook",
                });
              } catch (err) {
                await logEvent("error", "mail enqueue failed", {
                  orderId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }
        }

        await logEvent("info", "processed", {
          orderId,
          paymentId,
          nowpaymentsStatus: mapped.nowpaymentsStatus,
          newStatus: updates.status ?? currentStatus,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
