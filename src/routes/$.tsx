import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { SEO_LIMITS, SITE_URL, canonicalUrl, clamp, metaForPath } from "@/lib/seo-meta";
import { articles } from "@/pages/Resources/data/articles";
import { LoadingFallback } from "@/components/LoadingFallback";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

// Whitelist of first-segment paths the SPA actually owns. Anything outside
// this list is treated as a 404 so Prerender.io (and search engines) see a
// proper not-found signal instead of HTTP 200 on /no-such-page-xyz.
const KNOWN_ROOTS = new Set<string>([
  "", "products", "product", "resources", "research", "search",
  "about", "contact",
  "shipping-policy", "refund-policy", "terms-and-conditions",
  "privacy-policy", "cookies", "cookie-policy",
  "lab-reports", "quality-control", "storage-guide",
  "cart", "checkout", "order", "orders", "account", "login", "signup",
  "register", "auth", "reset-password", "forgot-password", "verify",
  "admin", "thank-you", "success", "cancel",
  "faq", "faqs", "blog",
]);


export const Route = createFileRoute("/$")({

  ssr: false,
  head: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? "";
    const pageMeta = metaForPath(splat);
    const title = clamp(pageMeta.title, SEO_LIMITS.titleMax);
    const description = clamp(pageMeta.description, SEO_LIMITS.descriptionMax);

    const url = canonicalUrl(splat);

    const scripts: Array<{ type: string; children: string }> = [];
    const resourcesMatch = splat.match(/^resources\/([^/?#]+)/);
    if (resourcesMatch) {
      const article = articles.find((a) => a.slug === resourcesMatch[1]);
      if (article) {
        scripts.push({
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: clamp(article.title, 110),
            description: clamp(article.excerpt, SEO_LIMITS.descriptionMax),
            image: [OG_IMAGE],
            datePublished: article.publishDate,
            dateModified: article.publishDate,
            inLanguage: "en-GB",
            articleSection: article.category,
            keywords: article.keywords?.join(", "),
            author: {
              "@type": "Organization",
              name: "PH Labs UK",
              url: SITE_URL,
            },
            publisher: {
              "@type": "Organization",
              name: "PH Labs UK",
              url: SITE_URL,
              logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.jpg` },
            },
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
          }),
        });
        scripts.push({
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Resources", item: `${SITE_URL}/resources` },
              { "@type": "ListItem", position: 3, name: article.title, item: url },
            ],
          }),
        });
      }
    }

    // Pages that should never be indexed (search results, filtered catalogue,
    // utility pages). Google was wasting crawl budget on /search and
    // /products?category=… variants and flagging them as "Crawled - currently
    // not indexed" / "Discovered - currently not indexed".
    const firstSeg = splat.split("/")[0] ?? "";
    const shouldNoindex =
      firstSeg === "search" ||
      splat.startsWith("products?") ||
      splat.includes("?category=");

    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: pageMeta.ogType },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:url", content: url },
    ];
    if (shouldNoindex) {
      meta.push({ name: "robots", content: "noindex, follow" });
    }

    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts,
    };
  },

  component: LegacyMount,
});

function LegacyMount() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LegacyApp />
    </Suspense>
  );
}
