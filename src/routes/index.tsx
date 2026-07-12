import { createFileRoute } from "@tanstack/react-router";
import LegacyClientApp from "@/legacy/LegacyClientApp";
import { fetchPromoBanner } from "@/lib/firestore-rest";
import { cfImgProps } from "@/lib/cf-image";

const HOME_TITLE = "PHLabs — Pro Peptide Research Lab | Lab-Grade Compounds";
const HOME_DESCRIPTION =
  "PHLabs is a pro peptide research lab supplying laboratory-grade amino acid compounds for scientific research purposes only. Trusted purity, verified standards.";

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
      // Goes through /_img (Cloudflare Image Resizing → AVIF/WebP) and
      // includes `imagesrcset`/`imagesizes` so the preload picks the right
      // variant for the viewport instead of pulling the largest source file.
      ...(loaderData?.banner?.imageUrl
        ? (() => {
            const src = loaderData.banner.imageUrl as string;
            const isFirebase = /^https:\/\/(firebasestorage|storage)\.googleapis\.com\//.test(src);
            // Include narrow-mobile widths (360, 480) so 360-420 CSS-px
            // viewports at DPR=1/2 don't over-fetch the 1280 variant.
            // Modern DPR=3 phones still pick 1280 via srcset. Fallback
            // href points at 640 (mid-mobile) so legacy clients that
            // ignore imagesrcset don't pay for the widest source.
            const widths = [360, 480, 640, 960, 1280, 1600];
            const enc = (w: number) =>
              `/_img?u=${encodeURIComponent(src)}&w=${w}&f=auto&q=85`;
            return [{
              rel: "preload",
              as: "image",
              href: isFirebase ? enc(640) : src,
              imageSrcSet: isFirebase ? widths.map(w => `${enc(w)} ${w}w`).join(", ") : undefined,
              imageSizes: isFirebase ? "100vw" : undefined,
              fetchPriority: "high",
            } as const];
          })()
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
      fallback={<HomeSsrShell banner={banner ?? null} />}
    />
  );
}

function HomeSsrShell({ banner }: { banner: Awaited<ReturnType<typeof fetchPromoBanner>> | null }) {
  const bannerVisible = banner?.active !== false && banner?.isActive !== false && !!banner?.imageUrl;
  const bannerImage = bannerVisible
    ? cfImgProps(banner.imageUrl, {
        widths: [480, 640, 960, 1280, 1600],
        sizes: "100vw",
        quality: 82,
        fallbackWidth: 960,
      })
    : null;

  return (
    <main
      className="phl-home-ssr"
      data-phl-app-ready="ssr-home"
      style={{ minHeight: "100vh", background: "#020617", color: "#f0f8ff" }}
    >
      <section
        id="hero"
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "88px 16px 40px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ width: "min(1280px, 100%)", margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 999,
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.25)",
              color: "#4ade80",
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            UK Laboratory Reagent Supplier · Research Use Only
          </div>

          <h1
            style={{
              maxWidth: 820,
              fontSize: "clamp(34px, 9vw, 72px)",
              fontWeight: 900,
              lineHeight: 1.04,
              margin: 0,
              color: "#f0f8ff",
            }}
          >
            <span style={{ display: "block" }}>Pro Peptide Research Lab</span>
            <span style={{ display: "block", color: "#10b981" }}>For In-Vitro Research</span>
            <span style={{ display: "block", color: "#c9d8f0", fontWeight: 500, fontSize: "0.56em" }}>
              HPLC-Verified ≥99% Purity · CoA Per Batch
            </span>
          </h1>

          <p style={{ maxWidth: 620, margin: "18px 0 0", color: "#9cb8d9", fontSize: 17, lineHeight: 1.7 }}>
            PH Labs supplies high-purity amino acid compounds and analytical-grade laboratory reagents for qualified UK researchers. For Research Use Only. Not for Human Consumption.
          </p>

          {bannerImage ? (
            <div style={{ marginTop: 28, width: "100%" }}>
              <img
                {...bannerImage}
                alt={banner?.altText || "PH Labs research peptides homepage banner"}
                width={1600}
                height={banner?.heightPx || 360}
                fetchPriority="high"
                decoding="async"
                style={{
                  width: "100%",
                  height: "auto",
                  aspectRatio: "16 / 9",
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "#0f172a",
                }}
              />
            </div>
          ) : (
            <div
              aria-hidden="true"
              style={{
                marginTop: 28,
                width: "100%",
                aspectRatio: "16 / 9",
                maxHeight: 360,
                borderRadius: 8,
                background: "linear-gradient(90deg, rgba(15,23,42,0.72), rgba(30,41,59,0.72), rgba(15,23,42,0.72))",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            />
          )}
        </div>
      </section>
    </main>
  );
}

