import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/privacy-requests")({
  head: () => legacyHead("/privacy-requests"),
  component: () => <LegacyMount path="/privacy-requests" />,
});
