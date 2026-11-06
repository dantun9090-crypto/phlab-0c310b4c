import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PremiumLanding } from "@/components/PremiumLanding";

const TITLE = "Premium Research Compounds — UK Laboratory Supply | PH Labs";
const DESCRIPTION =
  "High-purity research compounds prepared and dispatched from the UK. Detailed batch documentation with every order. Strictly for laboratory research use.";
const URL = "https://phlabs.co.uk/landingad";
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

export const Route = createFileRoute("/_marketing/landingad")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      // Google Ads landing copy of /compound. noindex,follow on purpose:
      // AdsBot crawling and Quality Score are unaffected, and we avoid
      // duplicate-content competition with the organic /compound page.
      { name: "robots", content: "noindex,follow,max-image-preview:large" },
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
      // NOTE: no hard-pinned Cormorant Garamond woff2 preload here.
      // Google rotates the versioned gstatic filenames, and the previously
      // pinned v16 URL started returning 404 — a wasted preload plus a
      // console error on every visit. The font arrives via the Google Fonts
      // stylesheet in __root; fonts.gstatic.com is already preconnected.

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
  component: LandingAdPage,
});

function LandingAdPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen w-full bg-[#060b18] flex flex-col items-center justify-center px-6 text-center"
          style={{ contain: "strict" }}
        >
          <h1
            className="font-light text-white"
            style={{
              fontFamily: "'Cormorant Garamond','Times New Roman',serif",
              fontSize: "clamp(2rem,5vw,5rem)",
              lineHeight: 1.05,
            }}
          >
            Premium Research Compounds
            <br />
            for{" "}
            <span style={{ color: "#c9a44c", fontStyle: "italic" }}>
              UK Laboratories
            </span>
          </h1>
        </div>
      }
    >
      <PremiumLanding eyebrow="UK Laboratory Supply" />
    </Suspense>
  );
}
