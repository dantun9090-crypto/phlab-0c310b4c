import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/quality-control")({
  head: () => legacyHead("/quality-control"),
  component: () => <LegacyMount path="/quality-control" />,
});
