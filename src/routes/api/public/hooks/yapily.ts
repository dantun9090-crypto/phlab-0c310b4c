/**
 * Yapily webhook receiver — placeholder, but locked.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/yapily
 *
 * Yapily integration is pending application approval, but the endpoint is
 * still public on the internet. To prevent it being used as an
 * unauthenticated log-write / DoS vector while the adapter is wired up,
 * we require a valid HMAC signature on every request:
 *   - YAPILY_WEBHOOK_SECRET must be configured (otherwise 503).
 *   - Each POST must carry `x-yapily-signature` / `x-webhook-signature`
 *     verified with the shared secret (otherwise 401, dropped).
 *
 * The body is only logged for diagnostics after the signature check passes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { addDocAdmin } from "@/lib/server/firestore-admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyHmacSignature } from "@/lib/webhook-signature";

export const Route = createFileRoute("/api/public/hooks/yapily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, "/api/public/hooks/yapily", {
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

        // Mandatory signature verification.
        const secret = process.env.YAPILY_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Webhook secret not configured", { status: 503 });
        }
        const sigHeader =
          request.headers.get("x-yapily-signature") ||
          request.headers.get("x-webhook-signature") ||
          request.headers.get("x-hub-signature-256");
        const ok = await verifyHmacSignature(bodyText, sigHeader, secret);
        if (!ok) {
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          await addDocAdmin("payment_webhook_events", {
            gateway: "yapily",
            level: "info",
            message: "pending — payload received before adapter is implemented",
            ctx: { raw: bodyText.slice(0, 2000) },
            createdAt: new Date(),
          });
        } catch {
          /* never fail the webhook for logging */
        }
        return Response.json({ ok: true, pending: true });
      },
    },
  },
});
