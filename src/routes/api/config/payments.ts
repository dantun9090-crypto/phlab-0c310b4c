/**
 * Public read-only payment-method availability endpoint.
 *
 * Used by the checkout to decide which payment tiles to render. Cached for
 * 60 seconds (via `wallid-config.server` in-memory cache and `Cache-Control`
 * header) so a normal checkout load does not touch the DB.
 */
import { createFileRoute } from "@tanstack/react-router";
import { readWallidEnabled } from "@/lib/wallid-config.server";

export const Route = createFileRoute("/api/config/payments")({
  server: {
    handlers: {
      GET: async () => {
        const wallid_enabled = await readWallidEnabled();
        const body = {
          wallid_enabled,
          // Other gateways are managed by `/lib/payments/gateway-config.server`
          // and exposed via `getCheckoutPaymentOptions`. Surfaced here as
          // booleans for parity / future use.
          fena_enabled: true,
          truelayer_enabled: true,
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=60, s-maxage=60",
          },
        });
      },
    },
  },
});
