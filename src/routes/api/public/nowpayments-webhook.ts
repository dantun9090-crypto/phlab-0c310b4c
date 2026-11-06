/**
 * NOWPayments IPN (settlement) webhook.
 *
 * URL configured in the NOWPayments dashboard (Settings → Payments → IPN):
 *   https://phlabs.co.uk/api/public/nowpayments-webhook
 *
 * (`/api/public/*` bypasses published-site auth — every security control is
 * implemented inside this handler.)
 *
 * Verification, in order — any failure short-circuits BEFORE the body is
 * trusted:
 *   1. Rate limit 60 req/min/IP.
 *   2. HMAC-SHA512 over the sorted-key JSON body from `x-nowpayments-sig`,
 *      constant-time compare.
 *   3. Idempotency: `nowpayments_webhook_events/{payment}:{status}` is created
 *      with an explicit doc id — a duplicate delivery collides and is acked
 *      without re-processing.
 *   4. Amount + currency re-checked against the Firestore order; a mismatch is
 *      flagged for review and never marks the order paid.
 *   5. Status fan-out is ATOMIC (`transitionDocStatusAdmin`), so the IPN, the
 *      success-page poller and the reconcile cron cannot double-send emails.
 */
import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import {
  mapNowPaymentsStatus,
  readNowPaymentsCredentials,
  verifyNowPaymentsSignature,
} from "@/lib/nowpayments.server";

interface NowPaymentsIpnBody {
  payment_id?: number | string;
  invoice_id?: number | string;
  payment_status?: string;
  order_id?: string;
  order_description?: string;
  price_amount?: number;
  price_currency?: string;
  pay_amount?: number;
  actually_paid?: number;
  pay_currency?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  [k: string]: unknown;
}

function textResp(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", ...NO_STORE_HEADERS },
  });
}

export const Route = createFileRoute("/api/public/nowpayments-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limited = await enforceRateLimit(request, "nowpayments:webhook", {
          limit: 60,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const { ipnSecret } = readNowPaymentsCredentials();
        if (!ipnSecret) {
          console.error("[NOWPayments IPN] NOWPAYMENTS_IPN_SECRET is not configured");
          return textResp("Not configured", 503);
        }

        const rawBody = await request.text();
        if (rawBody.length > 64_000) return textResp("Payload too large", 413);

        const signature = request.headers.get("x-nowpayments-sig");
        const valid = await verifyNowPaymentsSignature(rawBody, signature, { secret: ipnSecret });
        if (!valid) {
          console.warn(`[NOWPayments IPN] signature rejected ip=${ip}`);
          return textResp("Invalid signature", 401);
        }

        let ev: NowPaymentsIpnBody;
        try {
          ev = JSON.parse(rawBody) as NowPaymentsIpnBody;
        } catch {
          return textResp("Invalid JSON", 400);
        }

        const paymentId = String(ev.payment_id ?? "");
        if (!/^[A-Za-z0-9_-]{3,64}$/.test(paymentId)) {
          return textResp("Missing payment_id", 400);
        }
        const rawStatus = String(ev.payment_status ?? "");
        const mapped = mapNowPaymentsStatus(rawStatus);

        const orderId = String(ev.order_id ?? "");
        if (!/^[A-Za-z0-9_-]{3,128}$/.test(orderId)) {
          console.warn(`[NOWPayments IPN] no usable order_id for payment=${paymentId}`);
          return textResp("ok", 200);
        }

        const { addDocAdmin, getDocAdmin, transitionDocStatusAdmin, updateDocAdmin } = await import(
          "@/lib/server/firestore-admin"
        );

        const eventKey = `${paymentId}_${rawStatus || "unknown"}`.replace(/[^A-Za-z0-9_-]/g, "_");
        try {
          await addDocAdmin(
            "nowpayments_webhook_events",
            {
              paymentId,
              invoiceId: ev.invoice_id != null ? String(ev.invoice_id) : null,
              orderId,
              status: rawStatus,
              receivedAt: new Date(),
              payload: JSON.stringify(ev).slice(0, 8000),
            },
            eventKey,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/already exists/i.test(msg)) return textResp("ok (duplicate)", 200);
          console.error("[NOWPayments IPN] event log failed:", msg);
          // Never fan out without idempotency — NOWPayments retries.
          return textResp("Retry later", 500);
        }

        const order = await getDocAdmin("orders", orderId).catch(() => null);
        if (!order) {
          console.warn(`[NOWPayments IPN] order ${orderId} not found`);
          return textResp("ok", 200);
        }

        // Informational statuses (waiting / confirming / sending) — just record.
        if (!mapped) {
          await updateDocAdmin("orders", orderId, {
            paymentProvider: "nowpayments",
            nowpaymentsPaymentId: paymentId,
            nowpaymentsStatus: rawStatus,
            paymentUpdatedAt: new Date(),
          }).catch(() => undefined);
          return textResp("ok", 200);
        }

        // Partial payments must never auto-complete an order.
        if (mapped === "partial") {
          await updateDocAdmin("orders", orderId, {
            paymentProvider: "nowpayments",
            nowpaymentsPaymentId: paymentId,
            nowpaymentsStatus: rawStatus,
            paymentNeedsReview: true,
            paymentFailureReason: "NOWPayments partially paid — underpayment",
            paymentUpdatedAt: new Date(),
          }).catch(() => undefined);
          return textResp("ok", 200);
        }

        if (mapped === "paid") {
          const expectedMinor = Math.round(
            Number(
              (order as { total?: unknown }).total ??
                (order as { totalAmount?: unknown }).totalAmount ??
                (order as { totalPrice?: unknown }).totalPrice ??
                0,
            ) * 100,
          );
          const quotedMinor = Math.round(Number(ev.price_amount ?? NaN) * 100);
          const currency = String(ev.price_currency ?? "GBP").toUpperCase();
          const amountOk =
            !Number.isFinite(quotedMinor) || expectedMinor === 0
              ? true // provider omitted the fiat quote — rely on order_id binding
              : Math.abs(quotedMinor - expectedMinor) <= 1;
          if (!amountOk || currency !== "GBP") {
            console.error(
              `[NOWPayments IPN] amount/currency mismatch order=${orderId} expected=${expectedMinor} got=${quotedMinor} ${currency}`,
            );
            await updateDocAdmin("orders", orderId, {
              nowpaymentsPaymentId: paymentId,
              nowpaymentsStatus: rawStatus,
              paymentNeedsReview: true,
              paymentFailureReason: "NOWPayments amount/currency mismatch",
              paymentUpdatedAt: new Date(),
            }).catch(() => undefined);
            return textResp("ok", 200);
          }
        }

        const { transitioned, prior } = await transitionDocStatusAdmin("orders", orderId, {
          allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
          updates: {
            status: mapped === "paid" ? "paid" : mapped,
            paymentProvider: "nowpayments",
            nowpaymentsPaymentId: paymentId,
            nowpaymentsStatus: rawStatus,
            ...(ev.actually_paid != null ? { nowpaymentsActuallyPaid: Number(ev.actually_paid) } : {}),
            ...(ev.pay_currency ? { nowpaymentsPayCurrency: String(ev.pay_currency) } : {}),
            ...(ev.outcome_amount != null ? { nowpaymentsOutcomeAmount: Number(ev.outcome_amount) } : {}),
            ...(ev.outcome_currency ? { nowpaymentsOutcomeCurrency: String(ev.outcome_currency) } : {}),
            paymentUpdatedAt: new Date(),
            ...(mapped === "paid" ? { paidAt: new Date() } : {}),
            paymentTokenHash: null,
          },
        });

        if (transitioned && mapped === "paid" && prior) {
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
              const amount = Number((prior.totalAmount as number) ?? (prior.total as number) ?? 0);
              const reference = String(prior.orderNumber ?? orderId);
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
            } catch (mailErr) {
              console.warn(
                "[NOWPayments IPN] confirmation email failed:",
                mailErr instanceof Error ? mailErr.message : mailErr,
              );
            }
          }
        }

        if (transitioned && (mapped === "failed" || mapped === "expired") && prior) {
          try {
            const { sendPaymentRetryEmailNow } = await import("@/lib/server/send-payment-retry.server");
            await sendPaymentRetryEmailNow(
              orderId,
              prior as Record<string, unknown>,
              `nowpayments:webhook:${mapped}`,
            );
          } catch (retryErr) {
            console.warn(
              "[NOWPayments IPN] retry email failed:",
              retryErr instanceof Error ? retryErr.message : retryErr,
            );
          }
        }

        return textResp("ok", 200);
      },

      GET: async () => textResp("NOWPayments IPN endpoint — POST only", 405),
    },
  },
});
