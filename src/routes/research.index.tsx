import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

// Index page for the /research segment. Split out from research.tsx so
// the parent route can be a no-head Outlet and avoid leaking its
// canonical into child pillar pages (e.g. /research/bpc-157-uk).
export const Route = createFileRoute("/research/")({
  head: () => legacyHead("/research"),
  component: () => <LegacyMount path="/research" />,
});
