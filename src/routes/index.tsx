import { createFileRoute } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { fetchPromoBanner } from "@/lib/firestore-rest";

const HOME_TITLE = "HPLC-Tested Research Peptides UK — Batch CoA | PH Labs";
const HOME_DESCRIPTION =
  "Shop HPLC-tested research peptides in the UK with batch CoAs and tracked next-day dispatch. Strictly for in-vitro laboratory research use.";
const HOME_URL = "https://phlabs.co.uk/";
const HOME_OG_IMAGE = "https://phlabs.co.uk/og-image.jpg";

export const Route = createFileRoute("/")({
  // Fetch active promo banner on the server so we can preload the LCP image.
  // Returns null on any error — never blocks SSR.
  loader: async () => ({ banner: await fetchPromoBanner() }),
  // Public content routes must SSR a non-empty body. Do not disable SSR
  // here or wrap the route in deferred loading with an empty fallback; that combination
  // caused staging to stick on the boot loader after publishes.
  head: ({ loaderData }) => ({
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
      { rel: "preconnect", href: "https://firestore.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebasestorage.googleapis.com", crossOrigin: "" },
      { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },
      // LCP preload — server-loaded promo banner image (skipped if absent).
      ...(loaderData?.banner?.imageUrl
        ? [{
            rel: "preload",
            as: "image",
            href: loaderData.banner.imageUrl,
            fetchpriority: "high",
          } as const]
        : []),
    ],
    scripts: [
      // Sitewide identity (LocalBusiness + WebSite/SearchAction) lives here
      // on the home route only — keeps product pages lean and tells Google
      // the canonical entity surface is the homepage.
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "LocalBusiness",
              "@id": "https://phlabs.co.uk/#localbusiness",
              name: "PH Labs UK",
              url: "https://phlabs.co.uk",
              image: "https://phlabs.co.uk/og-image.jpg",
              telephone: "+44 20 8175 4060",
              email: "info@phlabs.co.uk",
              priceRange: "££",
              address: {
                "@type": "PostalAddress",
                addressCountry: "GB",
                addressRegion: "England",
              },
              areaServed: "GB",
              parentOrganization: { "@id": "https://phlabs.co.uk/#organization" },
            },
            {
              "@type": "WebSite",
              "@id": "https://phlabs.co.uk/#website",
              url: "https://phlabs.co.uk",
              name: "PH Labs UK",
              inLanguage: "en-GB",
              publisher: { "@id": "https://phlabs.co.uk/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://phlabs.co.uk/search?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: LegacyMount,
});

function LegacyMount() {
  return <LegacyApp initialPath="/" />;
}
