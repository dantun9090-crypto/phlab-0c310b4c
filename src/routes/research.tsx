import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout-only parent for /research/*. We intentionally do NOT emit
// head() metadata here, because TanStack merges parent + child head()
// outputs and would otherwise inject a second `<link rel="canonical"
// href="/research">` into child pillar pages like /research/bpc-157-uk
// and /research/retatrutide-uk — causing Google to drop the child
// canonical (Semrush flagged "canonical conflict" before this fix).
// The /research index page owns its own head() in research.index.tsx.
export const Route = createFileRoute("/research")({
  component: () => <Outlet />,
});
