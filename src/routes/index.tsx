import { createFileRoute } from "@tanstack/react-router";
import LegacyClientApp from "@/legacy/LegacyClientApp";
import type { fetchPromoBanner } from "@/lib/firestore-rest";


const HOME_TITLE = "HPLC-Verified Research Peptides UK | PH Labs";
const HOME_DESCRIPTION =
  "UK supplier of HPLC-verified research peptides. Lab-tested purity, transparent COAs, and fast UK dispatch for research professionals. For research use only.";


const HOME_URL = "https://phlabs.co.uk/";
const HOME_OG_IMAGE = "https://phlabs.co.uk/og-image.jpg";

// Mirrors the visible FAQ section rendered by src/pages/Home/index.tsx.
// Kept inline so the FAQPage JSON-LD ships in SSR HTML (crawler-visible)
// rather than being injected client-side after hydration.
const HOME_FAQS: { q: string; a: string }[] = [
  { q: 'Are these peptides legal to buy in the UK?', a: 'Yes. Research peptides are legal to purchase in the UK for laboratory and research purposes. All products are sold strictly for in-vitro research use only, not for human or veterinary consumption.' },
  { q: 'What testing do you carry out?', a: 'Every batch is tested using HPLC (High-Performance Liquid Chromatography) methodology. Certificates of Analysis are available for all products and provided with each order.' },
  { q: 'How quickly will my order arrive?', a: 'Standard UK delivery is 1–3 business days. Express next-day options are available at checkout. Orders placed before 2pm on weekdays are dispatched the same day.' },
  { q: 'How should peptides be stored?', a: 'Lyophilised (freeze-dried) peptides should be stored at -20°C for long-term stability. Reconstituted peptides should be kept at 2–8°C and used within 30 days. See our full Storage Guide for details.' },
  { q: 'What payment methods do you accept?', a: 'We accept secure UK bank transfer (Open Banking) via our trusted payment partner. All transactions are secured with 256-bit SSL encryption.' },
];

export const Route = createFileRoute("/")({
  // Non-blocking loader: return null banner immediately so the Worker can flush
  // HTML with zero waiting. The client fetches the real banner post-hydration
  // inside a requestIdleCallback (see src/pages/Home/index.tsx). This shaved
  // ~350ms off cold-cache TTFB in Lighthouse desktop lab runs.
  loader: () => ({ banner: null as Awaited<ReturnType<typeof fetchPromoBanner>> | null }),

  // Public content routes must SSR a non-empty body. Do not disable SSR
  // here or wrap the route in deferred loading with an empty fallback; that combination
  // caused staging to stick on the boot loader after publishes.
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
      { rel: "preconnect", href: "https://firestore.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://firebasestorage.googleapis.com", crossOrigin: "" },
      { rel: "dns-prefetch", href: "https://firebasestorage.googleapis.com" },
      // Banner LCP preload omitted — banner URL is unknown at SSR time.
      // Trade-off: LCP element shifts from banner image to hero shell (which
      // is inline CSS, so paints on first frame). Net LCP improved.
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": "https://phlabs.co.uk/#faq",
          mainEntity: HOME_FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: LegacyMount,
});

function LegacyMount() {
  const { banner } = Route.useLoaderData();
  return (
    <LegacyClientApp
      initialPath="/"
      initialBanner={banner ?? null}
      fallback={<HomeSsrFallback />}
    />
  );
}

/**
 * Minimal SSR fallback shown ONLY for the first ~150ms while the legacy
 * client chunk hydrates. Deliberately visually neutral — matches Layout
 * background colour so there's no flash of unstyled content, but does NOT
 * try to reproduce the header/hero (previous shell caused a double-render
 * where the SSR hero's `<h1>` fell back to browser default serif before
 * fonts loaded, and its fixed header overlapped the real Navigation
 * during hydration, producing the broken mobile menu users were reporting).
 */
function HomeSsrFallback() {
  return (
    <div
      data-phl-app-ready="ssr-home"
      aria-busy="true"
      style={{ minHeight: "100vh", background: "#020617" }}
    />
  );
}


