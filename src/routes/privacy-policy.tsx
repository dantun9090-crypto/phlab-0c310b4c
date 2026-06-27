import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/privacy-policy")({
  head: () => legacyHead("/privacy-policy"),
  component: () => <LegacyMount path="/privacy-policy" />,
});
