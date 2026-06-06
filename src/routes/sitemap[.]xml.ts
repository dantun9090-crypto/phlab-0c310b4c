import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { articles } from "@/pages/Resources/data/articles";
import { fetchAllProducts } from "@/lib/firestore-rest";
import { isIndexable } from "@/lib/sitemap-policy";

const BASE_URL = "https://phlabs.co.uk";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Static-page lastmod. Bumped manually when site-wide content/layout changes.
const STATIC_LASTMOD = "2026-06-01";

const staticEntries: SitemapEntry[] = [
  { path: "/", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "1.0" },
  { path: "/products", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.9" },
  { path: "/research", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.8" },
  { path: "/quality-control", lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.8" },
  { path: "/lab-reports", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.8" },
  { path: "/resources", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.7" },
  { path: "/storage-guide", lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.6" },
  { path: "/about", lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.6" },
  { path: "/contact", lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.6" },
  { path: "/shipping-policy", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.4" },
  { path: "/refund-policy", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.4" },
  { path: "/terms-and-conditions", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3" },
  { path: "/privacy-policy", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3" },
];

// Fallback product entries: only used if Firestore fetch fails. BPC-157 was
// removed here on 2026-06-02 — it's now unhidden and served dynamically with
// the correct slug (/products/bpc-157).
const fallbackProductEntries: Array<SitemapEntry & { imageLoc?: string }> = [];

/**
 * Product slugs that resolve to a 301 in production (currently glow-blend
 * and klow-blend redirect to /products). Keep them out of the sitemap so
 * Googlebot and Prerender.io only ever fetch canonical 200 URLs from us.
 * If/when these slugs render a real 200 product page, remove them here.
 */
const NON_CANONICAL_PRODUCT_SLUGS: Set<string> = new Set([
  "glow-blend",
  "klow-blend",
]);

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Dynamic article entries served by the /$ splat route
        const articleEntries: SitemapEntry[] = articles.map((a) => ({
          path: `/resources/${a.slug}`,
          changefreq: "monthly",
          priority: "0.6",
        }));

        // Dynamic product entries — one URL per active product, with lastmod
        // from Firestore updatedAt and an image:image entry from imageUrl.
        // Filters out slugs that 301 in production (see NON_CANONICAL_PRODUCT_SLUGS).
        let productEntries: Array<SitemapEntry & { imageLoc?: string }> = [];
        try {
          const products = await fetchAllProducts();
          productEntries = products
            .filter((p) => !NON_CANONICAL_PRODUCT_SLUGS.has(p.slug))
            .map((p) => ({
              path: `/products/${p.slug}`,
              lastmod: p.updatedAt ? p.updatedAt.slice(0, 10) : undefined,
              changefreq: "weekly" as const,
              priority: "0.8",
              imageLoc: p.imageUrl && /^https?:\/\//.test(p.imageUrl) ? p.imageUrl : undefined,
            }));
        } catch {
          productEntries = [];
        }

        // Dedupe by path AND enforce the central sitemap policy
        // (transactional/admin/api/feeds/splat + robots.txt Disallow).
        // Firestore wins over fallback; static wins over both.
        const seen = new Set<string>();
        const entries: Array<SitemapEntry & { imageLoc?: string }> = [
          ...staticEntries,
          ...productEntries,
          ...fallbackProductEntries,
          ...articleEntries,
        ].filter((e) => {
          if (seen.has(e.path)) return false;
          if (!isIndexable(e.path)) return false;
          seen.add(e.path);
          return true;
        });

        const escapeXml = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        const urls = entries.map((e) => {
          const loc = `${BASE_URL}${e.path}`;
          return [
            `  <url>`,
            `    <loc>${loc}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `    <xhtml:link rel="alternate" hreflang="en-GB" href="${loc}" />`,
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />`,
            e.imageLoc
              ? `    <image:image>\n      <image:loc>${escapeXml(e.imageLoc)}</image:loc>\n    </image:image>`
              : null,
            `  </url>`,
          ].filter(Boolean).join("\n");
        });

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
