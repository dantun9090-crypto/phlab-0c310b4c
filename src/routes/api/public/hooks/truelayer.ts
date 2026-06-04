/**
 * TrueLayer Payments v3 webhook receiver.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/truelayer
 *
 * Security model mirrors the Fena hook: we treat the inbound JSON as an
 * untrusted notification, then re-fetch the authoritative payment record
 * from TrueLayer's API using our client credentials. Only the holder of
 * those credentials can read the payment, so a successful re-fetch is
 * equivalent to a signature check.
 *
 * Idempotency: TrueLayer events carry an `event_id`; we store the last 20
 * seen ids on the order doc and skip replays.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  addDocAdmin,
  findDocByFieldAdmin,
  getDocAdmin,
  updateDocAdmin,
} from "@/lib/server/firestore-admin";
import {
  mapTrueLayerStatus,
  truelayerGetPayment,
} from "@/lib/payments/truelayer.server";
import { getGatewayConfig } from "@/lib/payments/gateway-config.server";

interface TLWebhookBody {
  event_id?: string;
  type?: string;
  event_version?: number;
  payment_id?: string;
  payment_method?: { type?: string };
  status?: string;
}

async function logEvent(level: "info" | "warn" | "error", message: string, ctx: Record<string, unknown>) {
  try {
    await addDocAdmin("payment_webhook_events", {
      gateway: "truelayer",
      level,
      message,
      ctx,
      createdAt: new Date(),
    });
  } catch {
    /* never fail the webhook for logging */
  }
}

export const Route = createFileRoute("/api/public/hooks/truelayer")({
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

        let payload: TLWebhookBody;
        try {
          payload = JSON.parse(bodyText) as TLWebhookBody;
        } catch {
          await logEvent("warn", "invalid json", { raw: bodyText.slice(0, 400) });
          return new Response("Bad JSON", { status: 400 });
        }

        // Ping / test event
        if (!payload.payment_id) {
          await logEvent("info", "ping", { payload });
          return Response.json({ ok: true, pong: true });
        }

        const paymentId = String(payload.payment_id);
        const eventId = String(payload.event_id ?? `${paymentId}:${payload.status ?? ""}`);

        // Resolve sandbox/live from the configured gateway row so we hit
        // the same API the original create-payment used.
        const cfg = await getGatewayConfig("truelayer");
        let authoritative;
        try {
          authoritative = await truelayerGetPayment(paymentId, cfg.sandbox);
        } catch (err) {
          await logEvent("error", "truelayer get-payment failed", {
            paymentId,
            error: err instanceof Error ? err.message : String(err),
          });
          return new Response("Upstream verify failed", { status: 502 });
        }

        const orderRow = await findDocByFieldAdmin("orders", "truelayerPaymentId", paymentId);
        if (!orderRow) {
          await logEvent("error", "ORPHAN: TrueLayer payment has no matching order", {
            paymentId,
            status: authoritative.status,
            reference: authoritative.reference,
          });
          await updateDocAdmin("payment_orphans", paymentId, {
            gateway: "truelayer",
            paymentId,
            status: authoritative.status,
            reference: authoritative.reference,
            amountMinor: authoritative.amount_in_minor ?? null,
            lastSeenAt: new Date(),
          }).catch(async () => {
            await addDocAdmin("payment_orphans", {
              gateway: "truelayer",
              paymentId,
              status: authoritative.status,
              reference: authoritative.reference,
              amountMinor: authoritative.amount_in_minor ?? null,
              lastSeenAt: new Date(),
            }).catch(() => undefined);
          });
          return new Response("No matching order (logged)", { status: 200 });
        }

        const orderId = typeof orderRow.__id === "string" ? orderRow.__id : "";
        if (!orderId) {
          await logEvent("warn", "could not resolve order doc id", { paymentId });
          return new Response("No order id", { status: 200 });
        }

        const seen = Array.isArray(orderRow.truelayerEventIds)
          ? (orderRow.truelayerEventIds as string[])
          : [];
        if (seen.includes(eventId)) {
          await logEvent("info", "duplicate event ignored", { paymentId, eventId });
          return new Response("Already processed", { status: 200 });
        }

        const liveStatus = String(authoritative.status ?? "").toLowerCase();
        const mapped = mapTrueLayerStatus(liveStatus);
        const currentStatus = String(orderRow.status ?? "pending").toLowerCase();
        const wasPaid = currentStatus === "paid";

        const updates: Record<string, unknown> = {
          truelayerStatus: liveStatus,
          truelayerEventIds: [...seen, eventId].slice(-20),
        };
        if (mapped === "paid" && !wasPaid) {
          updates.status = "paid";
          updates.paidAt = new Date();
          updates.paymentProvider = "truelayer";
        } else if (mapped === "cancelled" && currentStatus === "pending") {
          updates.status = "cancelled";
        }

        await updateDocAdmin("orders", orderId, updates);

        if (mapped === "paid" && !wasPaid) {
          const to = String(orderRow.customerEmail ?? orderRow.email ?? "");
          const ref = String(orderRow.orderNumber ?? orderId);
          if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            try {
              await addDocAdmin("mail", {
                to,
                message: {
                  subject: `PH Labs — payment received for ${ref}`,
                  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a">
                    <h2 style="color:#10b981">Payment received</h2>
                    <p>Thank you — we've received your payment for order
                    <strong>${ref}</strong> via TrueLayer Open Banking.</p>
                  </body></html>`,
                  text: `Payment received for order ${ref}. Thank you.`,
                },
                createdAt: new Date(),
                source: "truelayer:webhook",
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
          paymentId,
          truelayerStatus: liveStatus,
          newStatus: updates.status ?? currentStatus,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
