import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const HOME_TITLE = "Research Peptides UK – BPC-157, GHK-Cu, TB-500 | Pro Health";
const HOME_DESCRIPTION =
  "Premium UK research peptides: BPC-157, GHK-Cu, TB-500, NAD+. HPLC-verified ≥99% purity with COA. Fast UK dispatch. For laboratory research use only.";
const HOME_URL = "https://www.prohealthpeptides.co.uk/";

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
          name: "Pro Health Peptides",
          legalName: "Pro Health Peptides UK",
          url: HOME_URL,
          logo: "https://www.prohealthpeptides.co.uk/logo.png",
          description:
            "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals.",
          areaServed: "GB",
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "info@prohealthpeptides.co.uk",
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
          name: "Pro Health Peptides",
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LegacyApp />
    </Suspense>
  );
}
