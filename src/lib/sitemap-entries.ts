import { articles } from "@/pages/Resources/data/articles";
import { fetchAllProducts } from "@/lib/firestore-rest";
import { isIndexable } from "@/lib/sitemap-policy";
import { PROGRAMMATIC_PAGES } from "@/lib/programmatic-seo";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  imageLoc?: string;
}

function buildStaticEntries(today: string): SitemapEntry[] {
  return [
    { path: "/", lastmod: today, changefreq: "weekly", priority: "1.0" },
    { path: "/products", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/quality-control", lastmod: today, changefreq: "monthly", priority: "0.8" },
    { path: "/resources", lastmod: today, changefreq: "weekly", priority: "0.7" },
    { path: "/about", lastmod: today, changefreq: "monthly", priority: "0.6" },
    { path: "/contact", lastmod: today, changefreq: "monthly", priority: "0.6" },
    { path: "/shipping-policy", lastmod: today, changefreq: "yearly", priority: "0.4" },
    { path: "/refund-policy", lastmod: today, changefreq: "yearly", priority: "0.4" },
    { path: "/terms-and-conditions", lastmod: today, changefreq: "yearly", priority: "0.3" },
    { path: "/privacy-policy", lastmod: today, changefreq: "yearly", priority: "0.3" },
    { path: "/cookies", lastmod: today, changefreq: "yearly", priority: "0.3" },
    { path: "/research", lastmod: today, changefreq: "weekly", priority: "0.7" },
    { path: "/research/retatrutide-uk", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/research/retatrutide-comprehensive-guide", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/research/bpc-157-uk", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/research/pt-141-uk", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/research/bpc-157-vs-tb-500", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/research/bpc-157-tb-500-synergy", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/research/tirzepatide-vs-retatrutide", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/research/cjc-1295-ipamorelin-synergy", lastmod: today, changefreq: "weekly", priority: "0.9" },
    { path: "/resources/peptide-categories-uk-research", lastmod: today, changefreq: "monthly", priority: "0.6" },
    { path: "/compound", lastmod: today, changefreq: "weekly", priority: "0.7" },
    { path: "/peptide-calculator", lastmod: today, changefreq: "monthly", priority: "0.7" },
    { path: "/landing/phlabs", lastmod: today, changefreq: "weekly", priority: "0.7" },
    { path: "/uk-research-store", lastmod: today, changefreq: "weekly", priority: "0.8" },
    { path: "/lab-reports", lastmod: today, changefreq: "monthly", priority: "0.6" },
    { path: "/storage-guide", lastmod: today, changefreq: "monthly", priority: "0.6" },
    { path: "/downloads", lastmod: today, changefreq: "monthly", priority: "0.5" },
  ];
}

/**
 * Single source of truth for indexable URLs shipped in /sitemap.xml AND
 * /bing-feed.xml. Both feeds MUST stay in sync — do not build URL lists
 * anywhere else. Filtered through isIndexable() to drop admin/api/feeds/splats.
 */
export async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const today = new Date().toISOString().slice(0, 10);
  const staticEntries = buildStaticEntries(today);

  const articleEntries: SitemapEntry[] = articles.map((a) => ({
    path: `/resources/${a.slug}`,
    lastmod: today,
    changefreq: "monthly",
    priority: "0.6",
  }));

  const programmaticEntries: SitemapEntry[] = PROGRAMMATIC_PAGES.map((p) => ({
    path: `/compare/${p.slug}`,
    lastmod: p.updated,
    changefreq: "monthly",
    priority: "0.6",
  }));

  let productEntries: SitemapEntry[] = [];
  try {
    const products = await fetchAllProducts();
    productEntries = products.map((p) => {
      const raw = p.updatedAt ? p.updatedAt.slice(0, 10) : undefined;
      const lastmod = raw && raw >= "2000-01-01" ? raw : today;
      return {
        path: `/products/${p.slug}`,
        lastmod,
        changefreq: "weekly" as const,
        priority: "0.8",
        imageLoc: p.imageUrl && /^https?:\/\//.test(p.imageUrl) ? p.imageUrl : undefined,
      };
    });
  } catch {
    productEntries = [];
  }

  const seen = new Set<string>();
  return [
    ...staticEntries,
    ...productEntries,
    ...articleEntries,
    ...programmaticEntries,
  ].filter((e) => {
    if (seen.has(e.path)) return false;
    if (!isIndexable(e.path)) return false;
    seen.add(e.path);
    return true;
  });
}
