import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/contact")({
  head: () => legacyHead("/contact"),
  component: () => <LegacyMount path="/contact" />,
});
