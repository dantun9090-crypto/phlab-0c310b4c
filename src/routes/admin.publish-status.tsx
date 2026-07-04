import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

/**
 * Deep-link to the Publish Status admin tab. Mounts the same Admin SPA as
 * `/admin` — AdminPage reads the pathname and pre-selects the `publishstatus`
 * tab. Auth + isAdmin gating lives inside AdminPage.
 */
const TITLE = "Publish Status · Admin · PH Labs";
const DESCRIPTION = "PH Labs post-publish invalidation + build state monitor.";

export const Route = createFileRoute("/admin/publish-status")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/admin/publish-status" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin/publish-status") }],
  }),
  component: AdminPublishStatusMount,
});

function AdminPublishStatusMount() {
  return <LegacyApp initialPath="/admin/publish-status" />;
}
