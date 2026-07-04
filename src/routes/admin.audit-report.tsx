import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

/**
 * Deep-link to the Comprehensive Audit admin tab. Mounts the Admin SPA;
 * AdminPage reads the pathname and pre-selects the `auditreport` tab.
 * Auth + isAdmin gating lives inside AdminPage.
 */
const TITLE = "Audit Report · Admin · PH Labs";
const DESCRIPTION = "PH Labs full technical + SEO + compliance audit.";

export const Route = createFileRoute("/admin/audit-report")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/admin/audit-report" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("admin/audit-report") }],
  }),
  component: AdminAuditReportMount,
});

function AdminAuditReportMount() {
  return <LegacyApp initialPath="/admin/audit-report" />;
}
