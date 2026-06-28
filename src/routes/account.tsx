import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your account · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("account") }],
  }),
  component: AccountMount,
});

function AccountMount() {
  return <LegacyApp initialPath="/account" />;
}
