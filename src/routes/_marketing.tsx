import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pathless layout for premium marketing landings (currently /compound).
// The underscore prefix means the segment is NOT in the URL — /compound
// stays /compound.
//
// Purpose: keep this subtree free of the e-commerce app shell so the
// global Firebase auth listener, legacy router, mutation logger, and
// web-vitals scripts don't run here. Pathname-based gates in
// src/lib/is-marketing-route.ts make the corresponding side-effect
// modules no-op on this route, which is what brings mobile Lighthouse
// TBT down from ~900 ms to ~150 ms.
//
// Do not add navigation chrome, analytics scripts, or shared providers
// here — the whole point is that this layout is lean.

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  return <Outlet />;
}
