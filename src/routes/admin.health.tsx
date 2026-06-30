import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

/**
 * Deep-link to the Infrastructure Health admin tab. Mounts the same Admin
 * SPA as `/admin` — AdminPage reads the pathname and pre-selects the
 * `infrahealth` tab. Auth + isAdmin gating lives inside AdminPage.
 */
export const Route = createFileRoute("/admin/health")({
  head: () => ({
    meta: [
      { title: "Infrastructure Health · Admin · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin/health") }],
  }),
  component: AdminHealthMount,
});

function AdminHealthMount() {
  return <LegacyApp initialPath="/admin/health" />;
}
