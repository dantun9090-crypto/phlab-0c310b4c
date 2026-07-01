import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("register") }],
  }),
  component: RegisterMount,
});

function RegisterMount() {
  return <LegacyApp initialPath="/register" />;
}