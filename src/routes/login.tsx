import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount } from "@/lib/legacy-mount";
import { canonicalUrl } from "@/lib/seo-meta";

const TITLE = "Sign in · PH Labs";
const DESCRIPTION =
  "Sign in to your PH Labs account to view research peptide orders, track shipments and manage your UK laboratory account.";
const URL_SELF = "https://phlabs.co.uk/login";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL_SELF },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("login") }],
  }),
  component: LoginMount,
});

function LoginMount() {
  // Client-only mount: keeps firebase/auth (EmailAuthProvider et al.) out of
  // the SSR worker bundle where those symbols are undefined. See /account.
  return <LegacyMount path="/login" />;
}
