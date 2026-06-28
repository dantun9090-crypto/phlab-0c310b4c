import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("login") }],
  }),
  component: LoginMount,
});

function LoginMount() {
  return <LegacyApp initialPath="/login" />;
}
