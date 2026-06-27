import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/storage-guide")({
  head: () => legacyHead("/storage-guide"),
  component: () => <LegacyMount path="/storage-guide" />,
});
