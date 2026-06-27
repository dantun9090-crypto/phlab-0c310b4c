import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/search")({
  head: () => legacyHead("/search"),
  component: () => <LegacyMount path="/search" />,
});
