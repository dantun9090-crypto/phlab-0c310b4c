import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadingFallback } from "@/components/LoadingFallback";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const HOME_TITLE = "HPLC-Tested Research Peptides UK — Batch CoA | PH Labs";
const HOME_DESCRIPTION =
  "Shop HPLC-tested research peptides in the UK with batch CoAs and tracked next-day dispatch. Strictly for in-vitro laboratory research use.";
const HOME_URL = "https://phlabs.co.uk/";
const HOME_OG_IMAGE = "https://phlabs.co.uk/og-image.jpg";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESCRIPTION },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: HOME_URL },
      { property: "og:image", content: HOME_OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESCRIPTION },
      { name: "twitter:url", content: HOME_URL },
      { name: "twitter:image", content: HOME_OG_IMAGE },
    ],
    links: [
      { rel: "canonical", href: HOME_URL },
      // Warm DNS + TLS to the Firebase Storage + Firestore origins that the
      // Home page hits within the first ~200ms (banner image, products list).
      // preconnect saves ~100–300ms on first paint vs cold DNS+TLS.
      { rel: "preconnect", href: "https://firestore.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebasestorage.googleapis.com", crossOrigin: "" },
      { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },
      // Preload the OG image at high priority — it doubles as the share card
      // and the social-preview placeholder, and is the largest static asset
      // on the home route until the Firestore banner resolves.
      { rel: "preload", as: "image", href: HOME_OG_IMAGE, fetchpriority: "high" } as any,
    ],
  }),
  component: LegacyMount,
});

function LegacyMount() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LegacyApp />
    </Suspense>
  );
}
