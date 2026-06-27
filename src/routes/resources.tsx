import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/resources")({
  head: () => legacyHead("/resources"),
  component: () => <LegacyMount path="/resources" />,
});
