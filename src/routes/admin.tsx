import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

// Top-level `/admin` leaf. The root splat `$.tsx` only fires for multi-segment
// unknown paths; without this file a hard refresh on `/admin` returns the
// framework's bare 9-byte "Not Found" before the SPA can mount.
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin") }],
  }),
  component: AdminMount,
});

function AdminMount() {
  return <LegacyApp initialPath="/admin" />;
}
