import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

export const Route = createFileRoute("/vip")({
  head: () => ({
    meta: [
      { title: "VIP Store · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("vip") }],
  }),
  component: VipMount,
});

function VipMount() {
  return <LegacyApp initialPath="/vip" />;
}