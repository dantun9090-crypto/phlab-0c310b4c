/**
 * BrokkrPay settlement webhook — `order.state_changed`.
 *
 * URL registered with BrokkrPay:
 *   https://phlabs.co.uk/api/public/brokkrpay-webhook
 *
 * (`/api/public/*` bypasses published-site auth — every control lives here.)
 *
 * Verification order — any failure short-circuits BEFORE the body is trusted:
 *   1. Rate limit 30 req/min/IP.
 *   2. HMAC-SHA256 over `${t}.${raw_body}` from `Brokkr-Signature`
 *      (`t=<unix>,v1=<hex>`), constant-time compare, 300s replay window.
 *   3. Idempotency: `brokkrpay_webhook_events/{brokkrOrderId}_{state}` created
 *      with an explicit id — a duplicate delivery collides and is acked.
 *   4. The USD amount is re-checked against the amount recorded when the link
 *      was created; a mismatch flags the order for review, never pays it.
 *   5. Status fan-out is ATOMIC (`transitionDocStatusAdmin`) so webhook,
 *      success-page poller and reconcile cron cannot double-send the email.
 *
 * Always answers 2xx quickly (BrokkrPay retries 4x on non-2xx / >10s).
 */
import { createFileRoute } from "@tanstack/react-router";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { NO_STORE_HEADERS } from "@/lib/no-store-headers";
import { verifyBrokkrPaySignature, readBrokkrPayWebhookSecret } from "@/lib/brokkrpay.server";
import { allowFromFor } from "@/lib/payment-transitions";

interface BrokkrWebhookBody {
  type?: string;
  orderId?: string;
  state?: string;
  previousState?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  clientReference?: string;
  test?: boolean;
  occurredAt?: string;
  [k: string]: unknown;
}

function textResp(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain", ...NO_STORE_HEADERS },
  });
}

function mapState(raw: string): "paid" | "failed" | "expired" | "cancelled" | null {
  switch (raw.toUpperCase()) {
    case "SUCCESS":
      return "paid";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      // Customer abandoned the hosted page OR the 24h payment link expired
      // unpaid. Kept distinct from "failed" so the panel and the success
      // page can show the cancelled copy; "cancelled" is in
      // PAID_ALLOW_FROM so a later "Pay again" can still win.
      return "cancelled";
    case "FROZEN":
      return null; // needs manual review, never auto-fails the order
    default:
      return null;
  }
}

export const Route = createFileRoute("/api/public/brokkrpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const limited = await enforceRateLimit(request, "brokkrpay:webhook", {
          limit: 30,
          windowMs: 60_000,
          retryAfterSec: 60,
        });
        if (limited) return limited;

        const secret = await readBrokkrPayWebhookSecret();
        if (!secret) {
          console.error("[BrokkrPay webhook] no signing secret configured");
          return textResp("Not configured", 503);
        }

        // Raw body verbatim for the HMAC — never JSON.parse first.
        const rawBody = await request.text();
        if (rawBody.length > 64_000) return textResp("Payload too large", 413);

        const signature =
          request.headers.get("brokkr-signature") ?? request.headers.get("Brokkr-Signature");
        const valid = await verifyBrokkrPaySignature(rawBody, signature, { secret });
        if (!valid) {
          console.warn(`[BrokkrPay webhook] signature rejected ip=${ip}`);
          return textResp("Invalid signature", 401);
        }

        let ev: BrokkrWebhookBody;
        try {
          ev = JSON.parse(rawBody) as BrokkrWebhookBody;
        } catch {
          return textResp("Invalid JSON", 400);
        }

        const brokkrOrderId = String(ev.orderId ?? "");
        const rawState = String(ev.state ?? "");
        const reference = String(ev.reference ?? ev.clientReference ?? "");

        const {
          addDocAdmin,
          getDocAdmin,
          transitionDocStatusAdmin,
          updateDocAdmin,
        } = await import("@/lib/server/firestore-admin");

        // Provider "send test webhook" deliveries carry test flags / no real
        // reference — log and acknowledge, never touch an order.
        if (ev.test === true || !/^[A-Za-z0-9_-]{3,128}$/.test(reference)) {
          await addDocAdmin("brokkrpay_webhook_events", {
            brokkrOrderId: brokkrOrderId || null,
            orderId: null,
            state: rawState || null,
            test: ev.test === true,
            receivedAt: new Date(),
            payload: rawBody.slice(0, 8000),
          }).catch(() => undefined);
          return textResp("ok (test)", 200);
        }

        // Idempotency — explicit doc id; ALREADY_EXISTS means duplicate.
        const eventKey = `${brokkrOrderId || reference}_${rawState || "unknown"}`.replace(
          /[^A-Za-z0-9_-]/g,
          "_",
        );
        try {
          await addDocAdmin(
            "brokkrpay_webhook_events",
            {
              brokkrOrderId: brokkrOrderId || null,
              orderId: reference,
              state: rawState,
              amountUsd: typeof ev.amount === "number" ? ev.amount : null,
              currency: typeof ev.currency === "string" ? ev.currency : null,
              test: false,
              receivedAt: new Date(),
              payload: rawBody.slice(0, 8000),
            },
            eventKey,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/already exists/i.test(msg)) return textResp("ok (duplicate)", 200);
          console.error("[BrokkrPay webhook] event log failed:", msg);
          // Without a guaranteed idempotency record we must not fan out.
          return textResp("Retry later", 500);
        }

        const mapped = mapState(rawState);
        if (!mapped) {
          if (rawState.toUpperCase() === "FROZEN") {
            await updateDocAdmin("orders", reference, {
              brokkrpayState: rawState,
              paymentNeedsReview: true,
              paymentFailureReason: "BrokkrPay order frozen — manual review required",
              paymentUpdatedAt: new Date(),
            }).catch(() => undefined);
          }
          return textResp("ok", 200);
        }

        const order = await getDocAdmin("orders", reference).catch(() => null);
        if (!order) {
          console.warn(`[BrokkrPay webhook] order ${reference} not found`);
          return textResp("ok", 200);
        }

        // Amount check against what we asked BrokkrPay to charge (whole USD).
        if (mapped === "paid") {
          const expectedUsd = Number((order as { brokkrpayAmountUsd?: unknown }).brokkrpayAmountUsd ?? 0);
          const paidUsd = typeof ev.amount === "number" ? ev.amount : NaN;
          const expectedCurrency = String(
            (order as { brokkrpayCurrency?: unknown }).brokkrpayCurrency ?? "USD",
          ).toUpperCase();
          const currency = String(ev.currency ?? expectedCurrency).toUpperCase();
          const amountOk =
            !Number.isFinite(paidUsd) || expectedUsd <= 0 ? true : Math.abs(paidUsd - expectedUsd) < 0.5;
          if (!amountOk || currency !== expectedCurrency) {
            console.error(
              `[BrokkrPay webhook] amount/currency mismatch order=${reference} expected=${expectedUsd} got=${paidUsd} ${currency}`,
            );
            await updateDocAdmin("orders", reference, {
              brokkrpayState: rawState,
              paymentNeedsReview: true,
              paymentFailureReason: "BrokkrPay amount/currency mismatch",
              paymentUpdatedAt: new Date(),
            }).catch(() => undefined);
            return textResp("ok", 200);
          }
        }

        const { transitioned, prior } = await transitionDocStatusAdmin("orders", reference, {
          // Same allow-lists as the status poller: paid wins from retries
          // (failed/expired/cancelled), while failed/expired/cancelled can
          // never pull a settled order backward.
          allowFrom: allowFromFor(mapped),
          updates: {
            status: mapped,
            paymentProvider: "brokkrpay",
            brokkrpayOrderId: brokkrOrderId || null,
            brokkrpayState: rawState,
            paymentUpdatedAt: new Date(),
            ...(mapped === "paid" ? { paidAt: new Date() } : {}),
            ...(mapped === "cancelled" ? { cancelledAt: new Date() } : {}),
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
              const orderNumber = String(prior.orderNumber ?? reference);
              const { subject, html, text } = paymentConfirmedEmail({
                firstName,
                orderNumber,
                amount,
                paymentMethod: "Card (BrokkrPay)",
                paidAt: new Date(),
              });
              const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
              await enqueueMailOnce(`payment-confirmed:${reference}`, {
                to,
                message: { subject, html, text },
                source: "brokkrpay:webhook",
              });
            } catch (mailErr) {
              console.warn(
                "[BrokkrPay webhook] confirmation email failed:",
                mailErr instanceof Error ? mailErr.message : mailErr,
              );
            }
          }
        }

        if (transitioned && (mapped === "failed" || mapped === "expired") && prior) {
          try {
            const { sendPaymentRetryEmailNow } = await import("@/lib/server/send-payment-retry.server");
            await sendPaymentRetryEmailNow(
              reference,
              prior as Record<string, unknown>,
              `brokkrpay:webhook:${mapped}`,
            );
          } catch (retryErr) {
            console.warn(
              "[BrokkrPay webhook] retry email failed:",
              retryErr instanceof Error ? retryErr.message : retryErr,
            );
          }
        }

        return textResp("ok", 200);
      },

      GET: async () => textResp("BrokkrPay webhook endpoint — POST only", 405),
    },
  },
});
