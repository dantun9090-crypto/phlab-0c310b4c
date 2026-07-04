import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

const TITLE = "Emergency Purge · Admin · PH Labs";
const DESCRIPTION = "PH Labs admin-only emergency Cloudflare cache purge.";

export const Route = createFileRoute("/admin/purge")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/admin/purge" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin/purge") }],
  }),
  component: AdminPurgeMount,
});

function AdminPurgeMount() {
  return <LegacyApp initialPath="/admin/purge" />;
}