import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount } from "@/lib/legacy-mount";
import { canonicalUrl } from "@/lib/seo-meta";

const TITLE = "Your account · PH Labs";
const DESCRIPTION = "Manage your PH Labs account, view research peptide orders and track shipments.";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://phlabs.co.uk/account" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("account") }],
  }),
  component: AccountMount,
});

function AccountMount() {
  // Client-only mount: keeps firebase/auth (EmailAuthProvider et al.) out
  // of the SSR worker bundle where those symbols are undefined.
  return <LegacyMount path="/account" />;
}
