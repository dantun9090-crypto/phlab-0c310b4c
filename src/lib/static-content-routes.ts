/**
 * Fully-static content routes — self-contained SSR HTML with no client
 * interactivity (plain <a> links only). On these routes the client entry
 * (vendor-react, vendor-tanstack, the whole hydration graph) is dead
 * weight: ~670ms desktop / ~1.3s mobile scripting in Lighthouse that the
 * TBT gate has to absorb for zero user benefit.
 *
 * RootShell omits <Scripts /> for these paths, and client.tsx never boots
 * CSR on them either (SKIP_CSR list there covers a wider set — checkout
 * return pages keep their client entry because they run client code).
 *
 * Keep in sync with the /research pillar articles registered in
 * client.tsx's SKIP_CSR_ROUTES.
 */
export const STATIC_CONTENT_ROUTES: readonly string[] = [
  "/research/bpc-157-tb-500-synergy",
  "/research/bpc-157-uk",
  "/research/bpc-157-vs-tb-500",
  "/research/cjc-1295-ipamorelin-synergy",
  "/research/ghk-cu-guide",
  "/research/retatrutide-comprehensive-guide",
  "/research/retatrutide-uk",
  "/research/tirzepatide-vs-retatrutide",
];

export const STATIC_CONTENT_PREFIXES: readonly string[] = ["/compare/"];

export function isStaticContentPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (STATIC_CONTENT_ROUTES.includes(path)) return true;
  return STATIC_CONTENT_PREFIXES.some(
    (p) => path.startsWith(p) && path.length > p.length,
  );
}
