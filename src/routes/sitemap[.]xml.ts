import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { articles } from "@/pages/Resources/data/articles";
import { fetchAllProducts } from "@/lib/firestore-rest";
import { isIndexable } from "@/lib/sitemap-policy";
// DOMAIN GUARD: jedynym źródłem kanonicznej domeny jest src/lib/seo-meta.ts
// (SITE_URL + assertCanonicalUrl). Nie hardkoduj "https://phlabs.co.uk" tutaj —
// zmiana w jednym miejscu musi pociągać sitemap, robots, JSON-LD i canonical.
// CI: scripts/check-url-consistency.ts + scripts/check-domains.ts.
import { SITE_URL, assertCanonicalUrl } from "@/lib/seo-meta";

const BASE_URL = SITE_URL;


interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Static-page lastmod. Bumped manually when site-wide content/layout changes.
const STATIC_LASTMOD = "2026-06-11";

const staticEntries: SitemapEntry[] = [
  { path: "/", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "1.0" },
  { path: "/products", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.9" },
  { path: "/quality-control", lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.8" },
  { path: "/resources", lastmod: STATIC_LASTMOD, changefreq: "weekly", priority: "0.7" },
  { path: "/about", lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.6" },
  { path: "/contact", lastmod: STATIC_LASTMOD, changefreq: "monthly", priority: "0.6" },
  { path: "/shipping-policy", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.4" },
  { path: "/refund-policy", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.4" },
  { path: "/terms-and-conditions", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3" },
  { path: "/privacy-policy", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3" },
  { path: "/cookies", lastmod: STATIC_LASTMOD, changefreq: "yearly", priority: "0.3" },
  // /research, /lab-reports, /storage-guide removed 2026-06-10 — pages were
  // returning empty content / 404 to crawlers and dragging down crawl budget.
  // /google-merchant-feed.xml is discovered separately by Merchant Center.
];

// Fallback product entries: only used if Firestore fetch fails. BPC-157 was
// removed here on 2026-06-02 — it's now unhidden and served dynamically with
// the correct slug (/products/bpc-157).
const fallbackProductEntries: Array<SitemapEntry & { imageLoc?: string }> = [];

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
        let productEntries: Array<SitemapEntry & { imageLoc?: string }> = [];
        try {
          const products = await fetchAllProducts();
          productEntries = products
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
          // Guard runtime — wyłapie regresję, gdyby ktoś wstrzyknął obcy host przez SITE_URL.
          assertCanonicalUrl(loc, `sitemap loc for ${e.path}`);
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
