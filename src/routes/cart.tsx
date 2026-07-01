import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Cart · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("cart") }],
  }),
  component: CartMount,
});

function CartMount() {
  return <LegacyApp initialPath="/cart" />;
}