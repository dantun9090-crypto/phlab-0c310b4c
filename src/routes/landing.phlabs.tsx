import { createFileRoute } from "@tanstack/react-router";
import { EditorialLanding } from "@/components/EditorialLanding";

const TITLE = "PH Labs | Premium Research Compounds for UK Laboratories";
const DESCRIPTION =
  "PH Labs supplies high-purity research compounds to UK laboratories, with detailed batch documentation for every order. For research use only.";
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://phlabs.co.uk/" },
            { "@type": "ListItem", position: 2, name: "PH Labs — UK Laboratory Supply", item: URL },
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Who are PH Labs research compounds for?",
              acceptedAnswer: { "@type": "Answer", text: "Supplied exclusively to qualified researchers, scientific professionals, academic institutions and commercial laboratories in the United Kingdom. For research use only — not for human consumption." },
            },
            {
              "@type": "Question",
              name: "Do you provide batch documentation?",
              acceptedAnswer: { "@type": "Answer", text: "Yes. Every batch ships with detailed analytical documentation. Full Certificates of Analysis are available on request." },
            },
            {
              "@type": "Question",
              name: "Where do you ship from?",
              acceptedAnswer: { "@type": "Answer", text: "All orders are prepared, stored and dispatched from the United Kingdom under controlled laboratory conditions." },
            },
          ],
        }),
      },
    ],
  }),
  component: () => <EditorialLanding eyebrow="PH Labs · United Kingdom" />,
});
