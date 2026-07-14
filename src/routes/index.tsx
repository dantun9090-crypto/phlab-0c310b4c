import { createFileRoute } from "@tanstack/react-router";
import LegacyClientApp from "@/legacy/LegacyClientApp";
import logoSrc from "@/assets/logo.webp";
import type { fetchPromoBanner } from "@/lib/firestore-rest";



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
      fallback={<HomeSsrShell banner={banner ?? null} />}
    />
  );
}

function HomeSsrShell({ banner: _banner }: { banner: Awaited<ReturnType<typeof fetchPromoBanner>> | null }) {
  // Critical SSR shell: PageSpeed/Chrome field data was waiting for the legacy
  // client chunk before it could paint meaningful home content. Keep this
  // visually aligned with Layout + Home above-the-fold so FCP/LCP can happen
  // from HTML while the interactive app hydrates.
  return (
    <div
      className="phl-home-ssr"
      data-phl-app-ready="ssr-home"
      aria-busy="true"
      style={{ minHeight: "100vh", background: "#030a14", color: "#e4f0ff" }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: "0 0 auto 0",
          zIndex: 51,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030a14",
          borderBottom: "1px solid rgba(16,185,129,0.12)",
          color: "#9cb8d9",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        Free UK Shipping on orders over £50 · ≥99% HPLC Purity
      </div>
      <header
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: "32px 0 auto 0",
          zIndex: 50,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "#030a14",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <img
            src={logoSrc}
            alt="PH Labs"
            width={40}
            height={40}
            style={{
              width: 40,
              height: 40,
              objectFit: "contain",
              display: "block",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
            <span style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>PH Labs</span>
            <span style={{ color: "rgba(74,222,128,0.9)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Research Grade
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["⌕", "🛒", "☰"].map((label) => (
            <span
              key={label}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7a9ec8",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </header>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          top: 96,
          zIndex: 49,
          minHeight: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px 16px",
          background: "rgba(180,83,9,0.95)",
          color: "#fff7ed",
          fontSize: 12,
          fontWeight: 700,
          textAlign: "center",
        }}
      >
        For Laboratory Research Only — Not for Human Consumption
      </div>
      <main
        style={{
          minHeight: "100svh",
          padding: "172px 16px 64px",
          background: "radial-gradient(ellipse 120% 80% at 60% 40%, #061428 0%, #030a14 60%)",
        }}
      >
        <section style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ maxWidth: 680 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.25)",
                color: "#4ade80",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              UK Laboratory Reagent Supplier · Research Use Only
            </div>
            <h1
              style={{
                margin: "28px 0 0",
                maxWidth: 680,
                color: "#f0f8ff",
                fontSize: "2.75rem",
                fontWeight: 900,
                lineHeight: 1.04,
                letterSpacing: 0,
                overflowWrap: "break-word",
              }}
            >
              <span style={{ display: "block" }}>Pro Peptide Research Lab</span>
              <span style={{ display: "block", color: "#10b981" }}>For In-Vitro Research</span>
              <span style={{ display: "block", color: "#c9d8f0", fontWeight: 500, fontSize: "0.72em" }}>
                HPLC-Verified ≥99% Purity · CoA Per Batch
              </span>
            </h1>
            <p
              style={{
                maxWidth: 520,
                margin: "28px 0 0",
                color: "#9cb8d9",
                fontSize: 17,
                lineHeight: 1.75,
              }}
            >
              As a pro peptide research lab, PH Labs supplies high-purity amino acids and analytical-grade laboratory reagents for qualified UK researchers. HPLC and mass-spectrometry verified, Certificate of Analysis with every batch.{" "}
              <strong style={{ color: "#f0a0a0" }}>For Research Use Only. Not for Human Consumption.</strong>
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
              {["≥99% HPLC Verified", "CoA Every Batch", "Free UK Shipping £50+", "1–3 Day Dispatch"].map((badge) => (
                <span
                  key={badge}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "7px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#8db4d8",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

