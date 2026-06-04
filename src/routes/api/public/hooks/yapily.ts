/**
 * Yapily webhook receiver — placeholder.
 *
 * URL: https://phlabs.co.uk/api/public/hooks/yapily
 *
 * Yapily is not yet enabled (awaiting application approval). For now we
 * accept the request, log it as `info`, and return 200 so Yapily can
 * validate the URL during onboarding. The real handler will be wired when
 * YAPILY_APPLICATION_ID / YAPILY_APPLICATION_SECRET are provided.
 */
import { createFileRoute } from "@tanstack/react-router";
import { addDocAdmin } from "@/lib/server/firestore-admin";

export const Route = createFileRoute("/api/public/hooks/yapily")({
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
