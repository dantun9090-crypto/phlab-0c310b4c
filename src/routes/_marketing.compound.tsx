import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const PremiumLanding = lazy(() =>
  import("@/components/PremiumLanding").then((m) => ({ default: m.PremiumLanding })),
);

const TITLE = "Premium Research Compounds for Scientific Laboratories | PH Labs";
const DESCRIPTION =
  "High-purity research materials developed for professional laboratory and scientific applications. Premium laboratory research compounds, supplied with detailed documentation. For research use only.";
const URL = "https://phlabs.co.uk/compound";
const OG_IMAGE = "https://phlabs.co.uk/og/compound.jpg";

const FAQS = [
  {
    q: "Who are these research compounds intended for?",
    a: "Our premium research compounds are supplied exclusively to qualified researchers, scientific professionals, academic institutions and commercial laboratories for laboratory research and analytical studies.",
  },
  {
    q: "Are these products intended for human use?",
    a: "No. All materials are intended exclusively for laboratory and scientific research purposes. They are not intended for human consumption, medical use, or any therapeutic applications.",
  },
  {
    q: "What documentation is supplied?",
    a: "Each batch is accompanied by detailed analytical documentation. Qualified researchers and institutions may request the full research documentation via our contact channel.",
  },
  {
    q: "Where are the materials prepared and dispatched from?",
    a: "Materials are prepared, stored and dispatched from the United Kingdom under controlled laboratory conditions, with batch records maintained for every shipment.",
  },
];

export const Route = createFileRoute("/_marketing/compound")({
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
    links: [
      { rel: "canonical", href: URL },
      {
        rel: "preload",
        as: "image",
        href: "/og/luxury/hero.jpg",
        fetchpriority: "high",
      },
    ],
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
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: CompoundPage,
});

function CompoundPage() {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="min-h-screen w-full bg-[#060b18]"
          style={{ contain: "strict" }}
        />
      }
    >
      <PremiumLanding eyebrow="UK Laboratory Supply" />
    </Suspense>
  );
}
