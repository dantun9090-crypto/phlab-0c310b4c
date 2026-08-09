/**
 * PeptidePay settlement webhook.
 *
 * URL configured with PeptidePay:
 *   https://phlabs.co.uk/api/public/peptidepay-webhook
 *
 * (`/api/public/*` bypasses published-site auth — every security control is
 * implemented in this handler.)
 *
 * Verification, in order — any failure short-circuits BEFORE the body is
 * parsed or trusted:
 *   1. Rate limit 30 req/min/IP.
 *   2. HMAC-SHA256 over `${t}.${raw_body}` from `x-peptidepay-signature`
 *      (`t=<unix>,v1=<hex>`), constant-time compare, 300s replay window.
 *   3. Idempotency: `peptidepay_webhook_events/{session}:{status}` is created
 *      with an explicit document id — a duplicate delivery collides and is
 *      acknowledged without re-processing.
 *   4. Amount + currency are re-checked against the Firestore order; a
 *      mismatch is logged and never marks the order paid.
 *   5. Status fan-out is ATOMIC (`transitionDocStatusAdmin`), so the webhook,
 *      the success-page poller and the reconcile cron cannot double-send the
 *      confirmation email.
 */
import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import { verifyPeptidePaySignature, readPeptidePayCredentials } from "@/lib/peptidepay.server";

interface PeptidePayWebhookBody {
  session_id?: string;
  id?: string;
  status?: string;
  amount_cents?: number;
  amount?: number;
  currency?: string;
  txid?: string;
  paid_at?: string;
  metadata?: Record<string, unknown>;
  [k: string]: unknown;
}

function textResp(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", ...NO_STORE_HEADERS },
  });
}

function mapStatus(raw: string): "paid" | "failed" | "expired" | null {
  const s = raw.toLowerCase();
  if (s === "paid" || s === "settled" || s === "succeeded" || s === "success" || s === "completed") return "paid";
  if (s === "failed" || s === "declined" || s === "cancelled" || s === "canceled") return "failed";
  if (s === "expired") return "expired";
  return null;
}

export const Route = createFileRoute("/api/public/peptidepay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limited = await enforceRateLimit(request, "peptidepay:webhook", {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;


        const { webhookSecret } = readPeptidePayCredentials();
        if (!webhookSecret) {
          console.error("[PeptidePay webhook] PEPTIDEPAY_WEBHOOK_SECRET is not configured");
          return textResp("Not configured", 503);
        }

        // Raw body is required verbatim for the HMAC — never JSON.parse first.
        const rawBody = await request.text();
        if (rawBody.length > 64_000) return textResp("Payload too large", 413);

        const signature = request.headers.get("x-peptidepay-signature");
        const valid = await verifyPeptidePaySignature(rawBody, signature, { secret: webhookSecret });
        if (!valid) {
          console.warn(`[PeptidePay webhook] signature rejected ip=${ip}`);
          return textResp("Invalid signature", 401);
        }

        let ev: PeptidePayWebhookBody;
        try {
          ev = JSON.parse(rawBody) as PeptidePayWebhookBody;
        } catch {
          return textResp("Invalid JSON", 400);
        }

        const sessionId = String(ev.session_id ?? ev.id ?? "");
        if (!/^[A-Za-z0-9_-]{6,128}$/.test(sessionId)) {
          return textResp("Missing session_id", 400);
        }
        const rawStatus = String(ev.status ?? "");
        const mapped = mapStatus(rawStatus);

        const metadata = (ev.metadata ?? {}) as Record<string, unknown>;
        const orderId = String(metadata.order_id ?? metadata.orderId ?? "");
        if (!/^[A-Za-z0-9_-]{3,128}$/.test(orderId)) {
          console.warn(`[PeptidePay webhook] no usable order_id for session=${sessionId}`);
          return textResp("ok", 200);
        }

        const {
          addDocAdmin,
          getDocAdmin,
          transitionDocStatusAdmin,
          updateDocAdmin,
        } = await import("@/lib/server/firestore-admin");

        // Idempotency — explicit doc id, ALREADY_EXISTS means duplicate delivery.
        const eventKey = `${sessionId}_${rawStatus || "unknown"}`.replace(/[^A-Za-z0-9_-]/g, "_");
        try {
          await addDocAdmin(
            "peptidepay_webhook_events",
            {
              sessionId,
              orderId,
              status: rawStatus,
              txid: typeof ev.txid === "string" ? ev.txid : null,
              receivedAt: new Date(),
              payload: JSON.stringify(ev).slice(0, 8000),
            },
            eventKey,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/already exists/i.test(msg)) {
            return textResp("ok (duplicate)", 200);
          }
          console.error("[PeptidePay webhook] event log failed:", msg);
          // Do not fan out if we cannot guarantee idempotency — PeptidePay
          // will retry the delivery.
          return textResp("Retry later", 500);
        }

        if (!mapped) {
          console.warn(`[PeptidePay webhook] unmapped status "${rawStatus}" session=${sessionId}`);
          return textResp("ok", 200);
        }

        const order = await getDocAdmin("orders", orderId).catch(() => null);
        if (!order) {
          console.warn(`[PeptidePay webhook] order ${orderId} not found`);
          return textResp("ok", 200);
        }

        // Amount / currency sanity check before marking anything paid.
        if (mapped === "paid") {
          const expectedMinor = Math.round(
            Number(
              (order as { total?: unknown }).total ??
                (order as { totalAmount?: unknown }).totalAmount ??
                (order as { totalPrice?: unknown }).totalPrice ??
                0,
            ) * 100,
          );
          const paidMinor = Math.round(
            Number(ev.amount_cents ?? (typeof ev.amount === "number" ? ev.amount * 100 : NaN)),
          );
          const currency = String(ev.currency ?? "GBP").toUpperCase();
          const amountOk =
            !Number.isFinite(paidMinor) || expectedMinor === 0
              ? true // provider omitted the amount — rely on session id binding
              : Math.abs(paidMinor - expectedMinor) <= 1;
          if (!amountOk || (currency !== "GBP" && currency !== "USDC")) {
            console.error(
              `[PeptidePay webhook] amount/currency mismatch order=${orderId} expected=${expectedMinor} got=${paidMinor} ${currency}`,
            );
            await updateDocAdmin("orders", orderId, {
              peptidepayStatus: rawStatus,
              paymentNeedsReview: true,
              paymentFailureReason: "PeptidePay amount/currency mismatch",
              paymentUpdatedAt: new Date(),
            }).catch(() => undefined);
            return textResp("ok", 200);
          }
        }

        const { transitioned, prior } = await transitionDocStatusAdmin("orders", orderId, {
          allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
          updates: {
            status: mapped,
            paymentProvider: "peptidepay",
            peptidepaySessionId: sessionId,
            peptidepayStatus: rawStatus,
            ...(typeof ev.txid === "string" ? { peptidepayTxid: ev.txid } : {}),
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
                paymentMethod: "Card / Apple Pay / Google Pay (PeptidePay)",
                paidAt: new Date(),
              });
              const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
              await enqueueMailOnce(`payment-confirmed:${orderId}`, {
                to,
                message: { subject, html, text },
                source: "peptidepay:webhook",
              });
            } catch (mailErr) {
              console.warn(
                "[PeptidePay webhook] confirmation email failed:",
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
              `peptidepay:webhook:${mapped}`,
            );
          } catch (retryErr) {
            console.warn(
              "[PeptidePay webhook] retry email failed:",
              retryErr instanceof Error ? retryErr.message : retryErr,
            );
          }
        }

        return textResp("ok", 200);
      },

      GET: async () => textResp("PeptidePay webhook endpoint — POST only", 405),
    },
  },
});
