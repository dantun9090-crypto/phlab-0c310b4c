import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias for /checkout/cancel — some Wallid dashboard configs use
// /order/cancelled. Preserve query params so order_id flows through.
export const Route = createFileRoute("/order/cancelled")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/checkout/cancel", search: location.search as Record<string, unknown> });
  },
  component: () => null,
});
