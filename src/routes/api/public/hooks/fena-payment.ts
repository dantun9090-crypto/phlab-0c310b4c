/**
 * Fena Open Banking — payment.completed / payment.failed webhook receiver.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/fena-payment
 *
 * This is a SECOND webhook endpoint (alongside `/api/public/hooks/fena`)
 * for Fena tenants that emit signed payment events. Signature is verified
 * with HMAC-SHA256 using FENA_TERMINAL_SECRET. The existing `hooks/fena.ts`
 * remains the primary endpoint and uses authoritative re-fetch instead of
 * a signature — both are safe to run in parallel.
 *
 * On payment.completed → orders/{reference}.status = 'paid'
 * On payment.failed    → orders/{reference}.status = 'payment_failed'
 */
import { createFileRoute } from "@tanstack/react-router";
import { updateDocAdmin, addDocAdmin } from "@/lib/server/firestore-admin";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
      source: "fena-payment",
      createdAt: new Date(),
    });
  } catch {
    /* never fail the webhook for logging */
  }
}

export const Route = createFileRoute("/api/public/hooks/fena-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.FENA_TERMINAL_SECRET;
        if (!secret) {
          await logEvent("error", "missing FENA_TERMINAL_SECRET", {});
          return new Response("Server misconfigured", { status: 500 });
        }

        const signature = request.headers.get("X-Fena-Signature");
        let body = "";
        try {
          body = await request.text();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }
        if (body.length > 32_000) {
          return new Response("Payload too large", { status: 413 });
        }
        if (!signature) {
          await logEvent("warn", "missing X-Fena-Signature", {
            bodyPreview: body.slice(0, 200),
          });
          return new Response("Missing signature", { status: 400 });
        }

        // HMAC-SHA256 verify
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          enc.encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const signed = await crypto.subtle.sign("HMAC", key, enc.encode(body));
        const expected = "sha256=" + toHex(signed);

        if (!timingSafeEqual(signature, expected)) {
          await logEvent("warn", "signature mismatch", {
            got: signature.slice(0, 16) + "…",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const str = (v: unknown) =>
          typeof v === "string" && v.trim() ? v : undefined;
        const eventName = String(event.event ?? "").toLowerCase();
        const status = String(event.status ?? "").toLowerCase();
        const orderId =
          str(event.reference) ||
          str((event as { order_id?: unknown }).order_id) ||
          str((event as { merchant_reference?: unknown }).merchant_reference);

        if (!orderId) {
          await logEvent("warn", "no order reference in payload", { event });
          return new Response("Missing reference", { status: 400 });
        }

        const isCompleted =
          eventName === "payment.completed" || status === "completed";
        const isFailed =
          eventName === "payment.failed" || status === "failed";

        try {
          if (isCompleted) {
            await updateDocAdmin("orders", orderId, {
              status: "paid",
              payment_status: "completed",
              payment_method: "fena_open_banking",
              payment_id:
                str((event as { payment_id?: unknown }).payment_id) ||
                str(event.id) ||
                str((event as { transaction_id?: unknown }).transaction_id) ||
                null,
              paid_at: new Date(),
              fena_webhook_received: true,
              fena_webhook_timestamp: new Date().toISOString(),
              fena_event_type: eventName || status,
            });
            await logEvent("info", "order marked paid", { orderId });
          } else if (isFailed) {
            await updateDocAdmin("orders", orderId, {
              status: "payment_failed",
              payment_failure_reason:
                str((event as { reason?: unknown }).reason) ||
                str((event as { failure_reason?: unknown }).failure_reason) ||
                "Unknown",
              fena_webhook_timestamp: new Date().toISOString(),
              fena_event_type: eventName || status,
            });
            await logEvent("info", "order marked failed", { orderId });
          } else {
            await logEvent("info", "ignored event", {
              orderId,
              eventName,
              status,
            });
          }
        } catch (err) {
          await logEvent("error", "firestore update failed", {
            orderId,
            error: err instanceof Error ? err.message : String(err),
          });
          return new Response("Firestore update failed", { status: 500 });
        }

        return Response.json({ received: true, processed: eventName || status });
      },
    },
  },
});
