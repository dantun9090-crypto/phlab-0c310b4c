import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/cookies")({
  head: () => legacyHead("/cookies"),
  component: () => <LegacyMount path="/cookies" />,
});
