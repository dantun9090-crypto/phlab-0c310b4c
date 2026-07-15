import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias for /checkout/success — some Wallid dashboard configs use
// /order/success. Preserve query params so order_id flows through.
export const Route = createFileRoute("/order/success")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/checkout/success", search: location.search as Record<string, unknown> });
  },
  component: () => null,
});
