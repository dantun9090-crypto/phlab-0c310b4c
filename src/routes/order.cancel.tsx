import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/order/cancel")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/checkout/cancel", search: location.search as Record<string, unknown> });
  },
  component: () => null,
});
