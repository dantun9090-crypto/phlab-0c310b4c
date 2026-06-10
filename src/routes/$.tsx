import { createFileRoute } from "@tanstack/react-router";
import LegacyClientApp from "@/legacy/LegacyClientApp";
import { SEO_LIMITS, SITE_URL, canonicalUrl, clamp, metaForPath } from "@/lib/seo-meta";
import { ARTICLE_INDEX as articles } from "@/pages/Resources/data/articles-index";
import { KNOWN_ROOTS } from "@/lib/known-roots";

const OG_IMAGE = `${SITE_URL}/og-image.jpg`;


export const Route = createFileRoute("/$")({

  // Public fallback routes are intentionally SSR-enabled. Re-introducing
  // disabled SSR with deferred routed content or an empty fallback can leave
  // staging visitors stuck on the PH Labs loading screen after a publish.
  head: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? "";
    const pageMeta = metaForPath(splat);
    const title = clamp(pageMeta.title, SEO_LIMITS.titleMax);
    const description = clamp(pageMeta.description, SEO_LIMITS.descriptionMax);

    const url = canonicalUrl(splat);

    const scripts: Array<{ type: string; children: string }> = [];
    const resourcesMatch = splat.match(/^(?:resources|research)\/([^/?#]+)/);
    const sectionLabel = splat.startsWith("research/") ? "Research" : "Resources";
    const sectionPath = splat.startsWith("research/") ? "/research" : "/resources";
    if (resourcesMatch) {
      const article = articles.find((a) => a.slug === resourcesMatch[1]);
      if (article) {
        scripts.push({
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "@id": `${url}#article`,
            headline: clamp(article.title, 110),
            description: description,
            image: [OG_IMAGE],
            inLanguage: "en-GB",
            url,
            isAccessibleForFree: true,
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
              { "@type": "ListItem", position: 2, name: sectionLabel, item: `${SITE_URL}${sectionPath}` },
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
    // Private/transactional/admin routes — must not be indexed. robots.txt
    // already blocks crawl, but URL-only entries can still surface in SERPs
    // if linked externally, so emit an explicit noindex meta tag too.
    const PRIVATE_ROOTS = new Set([
      "admin", "checkout", "cart", "payment",
      "account", "login", "register", "signup",
      "auth", "reset-password", "forgot-password", "verify",
      "order", "orders", "thank-you", "success", "cancel",
    ]);
    const shouldNoindex =
      firstSeg === "search" ||
      splat.startsWith("products?") ||
      splat.includes("?category=") ||
      PRIVATE_ROOTS.has(firstSeg);

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
      // noarchive prevents cached snapshots from leaking checkout/admin UI.
      meta.push({ name: "robots", content: "noindex,nofollow,noarchive" });
    }

    // Signal 404 for unknown top-level paths so Prerender.io serves a real
    // 404 to crawlers (fixes Prerender 404 Checker red-flagging the domain).
    const isUnknown = !KNOWN_ROOTS.has(firstSeg);
    if (isUnknown) {
      meta.push({ name: "prerender-status-code", content: "404" });
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
  return <LegacyClientApp />;
}
