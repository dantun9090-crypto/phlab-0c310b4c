import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LegacyMount as LegacyClientMount } from "@/lib/legacy-mount";
import { SEO_LIMITS, SITE_URL, canonicalUrl, clamp, metaForPath } from "@/lib/seo-meta";
import { ARTICLE_INDEX as articles } from "@/pages/Resources/data/articles-index";
import { KNOWN_ROOTS } from "@/lib/known-roots";
import { DynamicImportFallback } from "@/components/DynamicImportFallback";

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
    // Also signal 404 for deep sub-paths under content roots that have
    // dedicated leaf routes (e.g. /products/:slug). Anything that reaches
    // this splat under those roots did NOT match a real route and is a
    // soft-404 in disguise (e.g. /products/foo/bar rendered a fake product
    // shell with 200). See src/server.ts — the sentinel is trusted
    // unconditionally and downgraded to a real HTTP 404.
    const HAS_LEAF_ROUTES = new Set([
      "products", "product", "compare", "landing",
      "resources", "research", "blog",
    ]);
    const segments = splat.split("/").filter(Boolean);
    const deepMissingLeaf =
      HAS_LEAF_ROUTES.has(firstSeg) && segments.length > 1;
    const isUnknown = !KNOWN_ROOTS.has(firstSeg) || deepMissingLeaf;
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
  errorComponent: SplatErrorBoundary,
  notFoundComponent: SplatNotFound,
});

function LegacyMount() {
  // Client-only mount: keeps firebase/auth (EmailAuthProvider et al.) out
  // of the SSR worker bundle where those symbols are undefined. See
  // src/routes/account.tsx for the same pattern.
  const splat = Route.useParams()._splat ?? "";
  return <LegacyClientMount path={`/${splat}`} />;
}

/**
 * Errors thrown while resolving/rendering the splat route (lazy chunk load
 * failures, legacy SPA bootstrap throws, unexpected loader errors) land
 * here instead of bubbling to the router default. Renders a branded,
 * dependency-light fallback so SSR always returns a usable HTML shell —
 * never a blank page or the raw framework error screen — and gives the
 * user a retry action. Also logs to console so the SSR error-capture
 * pipeline (src/lib/error-capture.ts → src/lib/ssr-alert.ts) can pick it
 * up and alert on catastrophic failures.
 */
function SplatErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const splat = Route.useParams()._splat ?? "";
  console.error("[splat.errorComponent]", { path: `/${splat}`, error });
  return (
    <DynamicImportFallback
      label={`splat:/${splat}`}
      onRetry={() => {
        void router.invalidate();
        reset();
      }}
    />
  );
}

/**
 * Splat-level not-found — reached when a loader inside the legacy SPA
 * throws notFound(). Keeps the branded shell instead of falling through
 * to the root notFoundComponent, so the metadata emitted by head()
 * (including prerender-status-code: 404 for unknown roots) stays intact.
 */
function SplatNotFound() {
  const splat = Route.useParams()._splat ?? "";
  return (
    <div
      role="alert"
      aria-live="polite"
      className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-slate-950 text-white"
    >
      <div className="max-w-md w-full text-center rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
          We couldn't find <span className="font-mono text-slate-300">/{splat}</span>.
          It may have moved or been retired.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors min-h-[48px]"
        >
          Return home
        </a>
      </div>
    </div>
  );
}
