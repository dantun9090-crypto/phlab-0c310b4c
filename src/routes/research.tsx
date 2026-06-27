import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

// /research is served by the legacy article page (src/pages/Research/index.tsx)
// via LegacyApp's react-router. This dedicated TanStack route exists only
// because the splat catch-all ($.tsx) was observed to miss top-level segments
// in production builds, returning a 404 instead of mounting LegacyApp.
export const Route = createFileRoute("/research")({
  head: () => legacyHead("/research"),
  component: () => <LegacyMount path="/research" />,
});
