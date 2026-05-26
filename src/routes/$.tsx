import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { SEO_LIMITS, SITE_URL, canonicalUrl, clamp, metaForPath } from "@/lib/seo-meta";
import { articles } from "@/pages/Resources/data/articles";
import { LoadingFallback } from "@/components/LoadingFallback";

const LegacyApp = lazy(() => import("@/legacy/LegacyApp"));

const OG_IMAGE = `${SITE_URL}/og-image.jpg`;


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
            datePublished: article.publishDate,
            dateModified: article.publishDate,
            inLanguage: "en-GB",
            articleSection: article.category,
            keywords: article.keywords?.join(", "),
            author: {
              "@type": "Organization",
              name: "Pro Health Peptides UK",
              url: SITE_URL,
            },
            publisher: {
              "@type": "Organization",
              name: "Pro Health Peptides UK",
              url: SITE_URL,
              logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.jpg` },
            },
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
          }),
        });
      }
    }

    return {
      meta: [
        { key: "title", title },
        { key: "description", name: "description", content: description },
        { key: "og:title", property: "og:title", content: title },
        { key: "og:description", property: "og:description", content: description },
        { key: "og:type", property: "og:type", content: pageMeta.ogType },
        { key: "og:url", property: "og:url", content: url },
        { key: "og:image", property: "og:image", content: OG_IMAGE },
        { key: "twitter:title", name: "twitter:title", content: title },
        { key: "twitter:description", name: "twitter:description", content: description },
        { key: "twitter:image", name: "twitter:image", content: OG_IMAGE },
      ],
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
