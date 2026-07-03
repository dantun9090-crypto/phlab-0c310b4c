import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

/**
 * Deep-link to the Infrastructure Health admin tab. Mounts the same Admin
 * SPA as `/admin` — AdminPage reads the pathname and pre-selects the
 * `infrahealth` tab. Auth + isAdmin gating lives inside AdminPage.
 */
const TITLE = "Infrastructure Health · Admin · PH Labs";
const DESCRIPTION = "PH Labs infrastructure health monitoring.";

export const Route = createFileRoute("/admin/health")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/admin/health" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin/health") }],
  }),
  component: AdminHealthMount,
});

function AdminHealthMount() {
  return <LegacyApp initialPath="/admin/health" />;
}
