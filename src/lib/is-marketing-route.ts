// Lightweight, dependency-free check used by global side-effect modules
// (chunk-reload, web-vitals, error-monitor, sw-register, …) to skip heavy
// installation work on standalone marketing landings.
//
// Marketing landings render under the `_marketing` pathless layout
// (e.g. /compound). They do NOT need the e-commerce app shell, the
// Firebase auth listener, the legacy router, web-vitals reporting, or
// the service-worker cleanup — keeping those off these routes is what
// gives us the mobile-Lighthouse TBT win.
//
// SSR safety: returns false on the server. All callers already guard
// `typeof window` separately, this is purely a client-side decision.

const MARKETING_PATH_PREFIXES = [
  "/compound",
] as const;

export function isMarketingRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const p = window.location.pathname;
    for (const prefix of MARKETING_PATH_PREFIXES) {
      if (p === prefix || p.startsWith(prefix + "/")) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
