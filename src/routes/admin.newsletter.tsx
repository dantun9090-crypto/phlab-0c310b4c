import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

const TITLE = "Newsletter · Admin · PH Labs";
const DESCRIPTION = "Manage newsletter subscribers and popup settings.";

export const Route = createFileRoute("/admin/newsletter")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin/newsletter") }],
  }),
  component: NewsletterAdminMount,
});

function NewsletterAdminMount() {
  return <LegacyApp initialPath="/admin/newsletter" />;
}
