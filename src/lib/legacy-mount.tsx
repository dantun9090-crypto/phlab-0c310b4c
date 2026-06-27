import LegacyApp from "@/legacy/LegacyApp";
import { SEO_LIMITS, SITE_URL, canonicalUrl, clamp, metaForPath } from "@/lib/seo-meta";

const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

/**
 * Build TanStack `head()` output for a legacy SPA path. Mirrors the
 * meta logic from src/routes/$.tsx for routes that bypass the splat.
 */
export function legacyHead(path: string) {
  const splat = path.replace(/^\/+/, "");
  const pageMeta = metaForPath(splat);
  const title = clamp(pageMeta.title, SEO_LIMITS.titleMax);
  const description = clamp(pageMeta.description, SEO_LIMITS.descriptionMax);
  const url = canonicalUrl(splat);
  return {
    meta: [
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
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/**
 * Render LegacyApp at a known legacy path. Used by dedicated route files
 * that exist purely to ensure TanStack matches the URL (the splat catch-all
 * has been observed to miss top-level segments in some builds).
 */
export function LegacyMount({ path }: { path: string }) {
  return <LegacyApp initialPath={path} />;
}
