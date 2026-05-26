import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadingFallback } from "@/components/LoadingFallback";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const HOME_TITLE = "Research Peptides UK — HPLC-Tested with Batch CoA | PHP";
const HOME_DESCRIPTION =
  "Shop HPLC-tested research peptides in the UK with batch CoAs and tracked next-day dispatch. Strictly for in-vitro laboratory research use.";
const HOME_URL = "https://www.phlabs.co.uk/";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { key: "title", title: HOME_TITLE },
      { key: "description", name: "description", content: HOME_DESCRIPTION },
      { key: "og:title", property: "og:title", content: HOME_TITLE },
      { key: "og:description", property: "og:description", content: HOME_DESCRIPTION },
      { key: "og:type", property: "og:type", content: "website" },
      { key: "og:url", property: "og:url", content: HOME_URL },
      { key: "twitter:title", name: "twitter:title", content: HOME_TITLE },
      { key: "twitter:description", name: "twitter:description", content: HOME_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: HOME_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "PH Labs",
          legalName: "PH Labs UK",
          url: HOME_URL,
          logo: "https://www.phlabs.co.uk/logo.png",
          description:
            "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals.",
          areaServed: "GB",
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "info@phlabs.co.uk",
            areaServed: "GB",
            availableLanguage: ["English"],
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "PH Labs",
          url: HOME_URL,
          potentialAction: {
            "@type": "SearchAction",
            target: `${HOME_URL}products?search={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }),
      },
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
