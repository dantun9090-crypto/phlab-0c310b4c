import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/install")({
  head: () => legacyHead("/install"),
  component: () => <LegacyMount path="/install" />,
});
