import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/refund-policy")({
  head: () => legacyHead("/refund-policy"),
  component: () => <LegacyMount path="/refund-policy" />,
});
