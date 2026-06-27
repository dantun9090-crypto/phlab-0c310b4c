import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/about")({
  head: () => legacyHead("/about"),
  component: () => <LegacyMount path="/about" />,
});
