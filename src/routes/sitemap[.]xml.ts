import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { articles } from "@/pages/Resources/data/articles";
import { fetchAllProducts } from "@/lib/firestore-rest";

const BASE_URL = "https://www.phlabs.co.uk";

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

// Fallback product entries: ensure these always appear in sitemap even if
// the Firestore fetch fails or the product is temporarily hidden in the catalog.
const fallbackProductEntries: Array<SitemapEntry & { imageLoc?: string }> = [
  {
    path: "/products/bpc-157-research-peptide",
    lastmod: "2026-05-27",
    changefreq: "weekly",
    priority: "0.8",
  },
];

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

        // Dynamic product entries — one URL per active product, with lastmod from Firestore updatedAt
        let productEntries: SitemapEntry[] = [];
        try {
          const products = await fetchAllProducts();
          productEntries = products.map((p) => ({
            path: `/products/${p.slug}`,
            lastmod: p.updatedAt ? p.updatedAt.slice(0, 10) : undefined,
            changefreq: "weekly",
            priority: "0.8",
          }));
        } catch {
          productEntries = [];
        }

        // Dedupe by path to guarantee each URL appears exactly once
        const seen = new Set<string>();
        const entries = [...staticEntries, ...productEntries, ...articleEntries].filter((e) => {
          if (seen.has(e.path)) return false;
          seen.add(e.path);
          return true;
        });

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
            `  </url>`,
          ].filter(Boolean).join("\n");
        });

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
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
