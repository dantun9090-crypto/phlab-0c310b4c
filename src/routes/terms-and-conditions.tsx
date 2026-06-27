import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/terms-and-conditions")({
  head: () => legacyHead("/terms-and-conditions"),
  component: () => <LegacyMount path="/terms-and-conditions" />,
});
