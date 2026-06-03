/**
 * Fena Open Banking webhook receiver.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/fena
 *
 * Configure this URL in the Fena dashboard. Fena's spec does NOT define a
 * signature header, so we treat the incoming body as *untrusted notification
 * only*: we extract the payment id, re-fetch the authoritative payment
 * record from Fena's API using our terminal-secret, and only then mutate
 * the order. This is functionally equivalent to HMAC verification and
 * blocks spoofed POSTs from anyone who doesn't hold the terminal secret.
 *
 * Idempotency: each Fena event id is appended to `orders/{id}.fenaEventIds`
 * (capped) and skipped on replay. A queued mail is only enqueued on the
 * first paid transition.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  addDocAdmin,
  findDocByFieldAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import { fenaGetPayment } from "@/lib/fena.server";

interface FenaWebhookBody {
  eventScope?: string;
  eventName?: string;
  id?: string;
  status?: string;
  reference?: string;
  amount?: string;
  // Fena may also send `data` or top-level payment fields — defensive read.
  data?: { id?: string };
}

async function logEvent(
  level: "info" | "warn" | "error",
  message: string,
  ctx: Record<string, unknown>,
) {
  try {
    await addDocAdmin("fena_webhook_events", {
      level,
      message,
      ctx,
      createdAt: new Date(),
    });
  } catch {
    // never fail the webhook for a logging error
  }
}

export const Route = createFileRoute("/api/public/hooks/fena")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let bodyText = "";
        try {
          bodyText = await request.text();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (bodyText.length > 32_000) {
          return new Response("Payload too large", { status: 413 });
        }

        let payload: FenaWebhookBody;
        try {
          payload = JSON.parse(bodyText) as FenaWebhookBody;
        } catch {
          await logEvent("warn", "invalid json", { raw: bodyText.slice(0, 500) });
          return new Response("Bad JSON", { status: 400 });
        }

        const fenaPaymentId = payload.id || payload.data?.id;
        if (!fenaPaymentId || typeof fenaPaymentId !== "string") {
          await logEvent("warn", "missing payment id", { payload });
          return new Response("Missing id", { status: 400 });
        }

        // Authoritative re-fetch — proves the sender knows nothing the
        // attacker couldn't fake; only we can call this with the secret.
        let authoritative;
        try {
          authoritative = await fenaGetPayment(fenaPaymentId);
        } catch (err) {
          await logEvent("error", "fena api re-fetch failed", {
            fenaPaymentId,
            error: err instanceof Error ? err.message : String(err),
          });
          // Tell Fena to retry later (5xx).
          return new Response("Upstream verify failed", { status: 502 });
        }

        // Find the matching order. We stored `fenaPaymentId` on creation.
        const orderRow = await findDocByFieldAdmin(
          "orders",
          "fenaPaymentId",
          fenaPaymentId,
        );
        if (!orderRow) {
          // Persist a durable orphan record so admins can reconcile (e.g. refund
          // the customer, or re-link to an order created out-of-band). Using
          // the Fena payment id as the doc id makes repeated webhook deliveries
          // idempotent — each orphan shows up once with the latest known state.
          const orphanCtx = {
            fenaPaymentId,
            reference: String(authoritative.reference ?? ""),
            amount: String(authoritative.amount ?? ""),
            fenaStatus: String(authoritative.status ?? ""),
            completedAt: authoritative.completedAt ?? null,
            receivedAt: new Date().toISOString(),
            reason: "no_order_with_matching_fenaPaymentId",
          };
          try {
            await updateDocAdmin("fena_orphan_payments", fenaPaymentId, {
              ...orphanCtx,
              lastSeenAt: new Date(),
            });
          } catch {
            // Fallback to addDoc if the doc doesn't exist yet — updateDoc on
            // missing doc throws in some SDKs. Use addDoc with explicit id-less
            // path so we still have a trail.
            try {
              await addDocAdmin("fena_orphan_payments", {
                ...orphanCtx,
                lastSeenAt: new Date(),
              });
            } catch {/* swallow — webhook must not 5xx for logging */}
          }
          await logEvent("error", "ORPHAN: Fena payment has no matching order", orphanCtx);
          // Ack so Fena stops retrying; flagged as error level in the admin tab.
          return new Response("No matching order (logged as orphan)", { status: 200 });
        }
        // Find the document id by looking it up — findDocByFieldAdmin
        // returns fields only, so refetch by orderNumber/reference.
        // Cheaper: store fenaPaymentId already mapped; locate orderId via
        // the order doc we got back (it includes `orderNumber`/etc but not
        // its own id). Use the reference field which equals orderNumber.
        const reference = String(authoritative.reference ?? "");
        const orderId = typeof orderRow.__id === "string" ? orderRow.__id : null;
        if (!orderId) {
          await logEvent("warn", "could not resolve order doc id", {
            fenaPaymentId,
            reference,
          });
          return new Response("No order id", { status: 200 });
        }

        const seenEvents = Array.isArray(orderRow.fenaEventIds)
          ? (orderRow.fenaEventIds as string[])
          : [];
        const eventKey = `${authoritative.status}:${authoritative.completedAt ?? ""}`;
        if (seenEvents.includes(eventKey)) {
          await logEvent("info", "duplicate event ignored", { fenaPaymentId, eventKey });
          return new Response("Already processed", { status: 200 });
        }

        const currentStatus = String(orderRow.status ?? "pending").toLowerCase();
        const fenaStatus = String(authoritative.status ?? "").toLowerCase();

        const isPaid = fenaStatus === "paid";
        const isCancelled = fenaStatus === "cancelled" || fenaStatus === "expired";

        const updates: Record<string, unknown> = {
          fenaStatus,
          fenaEventIds: [...seenEvents.slice(-19), eventKey],
          fenaLastEventAt: new Date(),
        };

        if (isPaid && currentStatus !== "paid") {
          updates.status = "paid";
          updates.paidAt = new Date();
          updates.paymentProvider = "fena";
        } else if (isCancelled && currentStatus === "pending") {
          updates.status = "cancelled";
        }

        await updateDocAdmin("orders", orderId, updates);

        // Enqueue confirmation mail on first paid transition.
        if (isPaid && currentStatus !== "paid") {
          const to = String(orderRow.customerEmail ?? orderRow.email ?? "");
          if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            try {
              await addDocAdmin("mail", {
                to,
                message: {
                  subject: `PH Labs — payment received for ${reference}`,
                  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">
                    <h2 style="color:#10b981">Payment received</h2>
                    <p>Thank you — we've received your payment for order
                    <strong>${reference}</strong>.</p>
                    <p>We'll send dispatch details shortly. Reply to this email
                    if you need help.</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
                    <p style="color:#64748b;font-size:12px">All products sold for laboratory research purposes only.</p>
                  </body></html>`,
                  text: `Payment received for order ${reference}. Thank you.`,
                },
                createdAt: new Date(),
                source: "fena:webhook",
              });
            } catch (err) {
              await logEvent("error", "mail enqueue failed", {
                orderId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        await logEvent("info", "processed", {
          orderId,
          fenaPaymentId,
          fenaStatus,
          newStatus: updates.status ?? currentStatus,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
