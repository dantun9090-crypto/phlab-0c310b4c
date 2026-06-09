import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/index/alias")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});