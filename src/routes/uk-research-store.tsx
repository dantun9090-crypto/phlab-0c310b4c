import { createFileRoute } from "@tanstack/react-router";
import { EditorialLanding } from "@/components/EditorialLanding";

const TITLE = "UK Research Store | PH Labs Laboratory Supply";
const DESCRIPTION =
  "UK research store supplying high-purity reference materials and lab reagents to qualified researchers. Batch documentation on every order. For research use only.";
const URL = "https://phlabs.co.uk/uk-research-store";
const OG_IMAGE = "https://phlabs.co.uk/og/compound.jpg";

export const Route = createFileRoute("/uk-research-store")({
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://phlabs.co.uk/" },
            { "@type": "ListItem", position: 2, name: "UK Research Store", item: URL },
          ],
        }),
      },
    ],
  }),
  component: () => <EditorialLanding eyebrow="UK Research Store · PH Labs" />,
});
