import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

// Top-level `/admin` leaf. The root splat `$.tsx` only fires for multi-segment
// unknown paths; without this file a hard refresh on `/admin` returns the
// framework's bare 9-byte "Not Found" before the SPA can mount.
const TITLE = "Admin · PH Labs";
const DESCRIPTION = "PH Labs admin dashboard.";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/admin" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin") }],
  }),
  component: AdminMount,
});

function AdminMount() {
  return <LegacyApp initialPath="/admin" />;
}
