import LegacyClientApp from "@/legacy/LegacyClientApp";
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
 * Render the legacy SPA at a known path. Uses LegacyClientApp (dynamic
 * import in useEffect) instead of importing LegacyApp directly — keeping
 * firebase/auth (EmailAuthProvider et al.) out of the SSR worker bundle
 * for these dedicated routes. SSR returns the head() metadata + an empty
 * shell, hydration mounts the real legacy app, matching splat behavior.
 *
 * `path` is accepted for API compatibility; LegacyClientApp reads the
 * URL from the browser on mount.
 */
export function LegacyMount(_props: { path: string }) {
  return <LegacyClientApp />;
}
