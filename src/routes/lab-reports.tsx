import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/lab-reports")({
  head: () => legacyHead("/lab-reports"),
  component: () => <LegacyMount path="/lab-reports" />,
});
