import { createFileRoute } from "@tanstack/react-router";
import { PremiumLanding } from "@/components/PremiumLanding";

const TITLE = "Premium Research Compounds for UK Laboratories | PH Labs";
const DESCRIPTION =
  "High-purity research compounds for professional UK laboratories. Detailed batch documentation supplied with every order. For research use only.";
const URL = "https://phlabs.co.uk/compound";
const OG_IMAGE = "https://phlabs.co.uk/og/compound.jpg";

const FAQS = [
  {
    q: "Who are these research compounds intended for?",
    a: "Our premium research compounds are supplied exclusively to qualified researchers, scientific professionals, academic institutions and commercial laboratories for laboratory research and analytical studies.",
  },
  {
    q: "Are these products intended for human use?",
    a: "No. All materials are intended exclusively for laboratory and scientific research purposes. They are not intended for human use or for any non-research application.",
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
      { name: "robots", content: "index,follow,max-image-preview:large" },
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
      // Preload the AVIF hero variant that matches the mobile viewport we
      // actually render (<=768px). Full 1920 variant is served via <picture>
      // srcset only for wider screens; preloading the small mobile file gets
      // LCP text painting far sooner on 4G devices.
      {
        rel: "preload",
        as: "image",
        href: "/og/luxury/hero-768.avif",
        type: "image/avif",
        imagesrcset:
          "/og/luxury/hero-768.avif 768w, /og/luxury/hero-1280.avif 1280w, /og/luxury/hero-1920.avif 1920w",
        imagesizes: "100vw",
        fetchpriority: "high",
      },
      // Preload the Cormorant Garamond 400 woff2 used by the hero <h1> so
      // the LCP text can paint without waiting for the Google Fonts CSS
      // round-trip. Weight 400 is the file the hero uses.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "https://fonts.gstatic.com/s/cormorantgaramond/v16/co3bmX5slCNuHLi8bLeY9MK7whWMhyjornFLsS6V7w.woff2",
        crossOrigin: "anonymous",
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://phlabs.co.uk/" },
            { "@type": "ListItem", position: 2, name: "Research Compounds", item: URL },
          ],
        }),
      },
    ],
  }),
  component: CompoundPage,
});

function CompoundPage() {
  return <PremiumLanding eyebrow="UK Laboratory Supply" />;
}
