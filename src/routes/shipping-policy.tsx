import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/shipping-policy")({
  head: () => legacyHead("/shipping-policy"),
  component: () => <LegacyMount path="/shipping-policy" />,
});
