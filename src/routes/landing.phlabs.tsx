import { createFileRoute } from "@tanstack/react-router";
import { EditorialLanding } from "@/components/EditorialLanding";

const TITLE = "PH Labs | Premium Research Compounds for Scientific Laboratories";
const DESCRIPTION =
  "PH Labs supplies high-purity research materials developed for professional laboratory and scientific applications. Premium laboratory research compounds with detailed documentation.";
const URL = "https://phlabs.co.uk/landing/phlabs";
const OG_IMAGE = "https://phlabs.co.uk/og/compound.jpg";

export const Route = createFileRoute("/landing/phlabs")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "640" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: TITLE,
          description: DESCRIPTION,
          url: URL,
          inLanguage: "en-GB",
        }),
      },
    ],
  }),
  component: () => <EditorialLanding eyebrow="PH Labs · United Kingdom" />,
});
