import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias for /checkout/cancel — some Wallid dashboard configs use the
// British spelling "cancelled". Preserve the query string so the target
// page can still mark the order cancelled in the DB.
export const Route = createFileRoute("/checkout/cancelled")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/checkout/cancel", search: location.search as Record<string, unknown> });
  },
  component: () => null,
});
