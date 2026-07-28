import { ARTICLE_INDEX as articles } from "@/pages/Resources/data/articles-index";
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

function buildStaticEntries(): SitemapEntry[] {
  return [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/products", changefreq: "weekly", priority: "0.9" },
    { path: "/quality-control", changefreq: "monthly", priority: "0.8" },
    { path: "/resources", changefreq: "weekly", priority: "0.7" },
    { path: "/about", changefreq: "monthly", priority: "0.6" },
    { path: "/contact", changefreq: "monthly", priority: "0.6" },
    { path: "/shipping-policy", changefreq: "yearly", priority: "0.4" },
    { path: "/refund-policy", changefreq: "yearly", priority: "0.4" },
    { path: "/terms-and-conditions", changefreq: "yearly", priority: "0.3" },
    { path: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
    { path: "/cookies", changefreq: "yearly", priority: "0.3" },
    { path: "/research", changefreq: "weekly", priority: "0.7" },
    { path: "/research/retatrutide-uk", changefreq: "weekly", priority: "0.9" },
    { path: "/research/retatrutide-comprehensive-guide", changefreq: "weekly", priority: "0.9" },
    { path: "/research/bpc-157-uk", changefreq: "weekly", priority: "0.9" },
    { path: "/research/bpc-157-vs-tb-500", changefreq: "weekly", priority: "0.9" },
    { path: "/research/bpc-157-tb-500-synergy", changefreq: "weekly", priority: "0.9" },
    { path: "/research/tirzepatide-vs-retatrutide", changefreq: "weekly", priority: "0.9" },
    { path: "/research/cjc-1295-ipamorelin-synergy", changefreq: "weekly", priority: "0.9" },
    { path: "/research/ghk-cu-guide", changefreq: "weekly", priority: "0.9" },
    { path: "/resources/peptide-categories-uk-research", changefreq: "monthly", priority: "0.6" },
    { path: "/compound", changefreq: "weekly", priority: "0.7" },
    { path: "/landing/phlabs", changefreq: "weekly", priority: "0.7" },
    { path: "/uk-research-store", changefreq: "weekly", priority: "0.8" },
    { path: "/lab-reports", changefreq: "monthly", priority: "0.6" },
    { path: "/storage-guide", changefreq: "monthly", priority: "0.6" },
    { path: "/downloads", changefreq: "monthly", priority: "0.5" },
  ];
}

/**
 * Single source of truth for indexable URLs shipped in /sitemap.xml AND
 * /bing-feed.xml. Both feeds MUST stay in sync — do not build URL lists
 * anywhere else. Filtered through isIndexable() to drop admin/api/feeds/splats.
 */
export async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const staticEntries = buildStaticEntries();

  const articleEntries: SitemapEntry[] = articles.map((a) => ({
    path: `/resources/${a.slug}`,
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
      const lastmod = raw && raw >= "2000-01-01" ? raw : undefined;
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

  // Hard exclusion — these paths were decommissioned (410 Gone) and must
  // never appear in any sitemap, even if a future code change accidentally
  // reintroduces them via a static/product/article list.
  const SITEMAP_EXCLUDE = new Set<string>(["/peptide-calculator", "/calculator"]);

  const seen = new Set<string>();
  return [
    ...staticEntries,
    ...productEntries,
    ...articleEntries,
    ...programmaticEntries,
  ].filter((e) => {
    if (seen.has(e.path)) return false;
    if (SITEMAP_EXCLUDE.has(e.path)) return false;
    if (/\/(peptide-)?calculator(\/|$)/i.test(e.path)) return false;
    if (!isIndexable(e.path)) return false;
    seen.add(e.path);
    return true;
  });
}
