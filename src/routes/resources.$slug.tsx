import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

/**
 * Splat delegate for legacy article slugs under /resources/:slug.
 *
 * The legacy SPA router (src/legacy/AppRouter.tsx) already serves these
 * pages via <ArticlePage />, and the catch-all $.tsx would too. This
 * dedicated route exists so the SEO scanner (which only reads TanStack
 * file-based routes) stops flagging existing article slugs as missing.
 *
 * Per-slug meta comes from metaForPath() inside legacyHead().
 */
export const Route = createFileRoute("/resources/$slug")({
  head: ({ params }) => legacyHead(`/resources/${params.slug}`),
  component: () => <LegacyMount path="/resources" />,
});
