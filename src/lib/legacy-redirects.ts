/**
 * 301 redirects from legacy (Wegic) URLs to the current PH Labs structure.
 *
 * Evaluated in src/server.ts BEFORE the TanStack handler runs so search
 * engines see proper 301s and no rendering happens for old paths.
 */

type RedirectRule =
  | { type: "exact"; from: string; to: string }
  | { type: "prefix"; from: string; to: string };

const RULES: RedirectRule[] = [
  // Old homepage variants
  { type: "exact", from: "/home", to: "/" },
  { type: "exact", from: "/index", to: "/" },
  { type: "exact", from: "/index.html", to: "/" },

  // Old shop / product URLs
  { type: "exact", from: "/shop", to: "/products" },
  { type: "prefix", from: "/shop/", to: "/products/" },
  { type: "prefix", from: "/product/", to: "/products/" },
  { type: "prefix", from: "/store/", to: "/products/" },
  { type: "exact", from: "/store", to: "/products" },
  { type: "exact", from: "/catalog", to: "/products" },
  { type: "exact", from: "/catalogue", to: "/products" },

  // Old blog / resources
  { type: "exact", from: "/blog", to: "/resources" },
  { type: "prefix", from: "/blog/", to: "/resources/" },
  { type: "prefix", from: "/post/", to: "/resources/" },
  { type: "prefix", from: "/posts/", to: "/resources/" },
  { type: "prefix", from: "/articles/", to: "/resources/" },

  // Old static pages
  { type: "exact", from: "/faq", to: "/resources" },
  { type: "exact", from: "/faqs", to: "/resources" },
  { type: "exact", from: "/contact-us", to: "/contact" },
  { type: "exact", from: "/about-us", to: "/about" },
  { type: "exact", from: "/terms", to: "/terms-and-conditions" },
  { type: "exact", from: "/tos", to: "/terms-and-conditions" },
  { type: "exact", from: "/privacy", to: "/privacy-policy" },
  { type: "exact", from: "/cookie-policy", to: "/cookies" },
  { type: "exact", from: "/shipping", to: "/shipping-policy" },
  { type: "exact", from: "/returns", to: "/refund-policy" },
  { type: "exact", from: "/refunds", to: "/refund-policy" },
  { type: "exact", from: "/lab-results", to: "/lab-reports" },
  { type: "exact", from: "/coa", to: "/lab-reports" },
  { type: "exact", from: "/quality", to: "/quality-control" },
  { type: "exact", from: "/storage", to: "/storage-guide" },

  // Wegic generic page prefix
  { type: "prefix", from: "/pages/", to: "/" },
  { type: "prefix", from: "/page/", to: "/" },

  // Legacy long product slugs from prohealthpeptides.co.uk → current slugs.
  // Googlebot still has these indexed; 301 here so we don't waste crawl budget
  // on a 404 page rendered through Prerender.io.
  { type: "exact", from: "/products/tirzepatide-research-reference-compound-for-lab-use", to: "/products/tirzepatide" },
  { type: "exact", from: "/products/retatrutide-laboratory-research-reference-compound", to: "/products/retatrutide" },
  { type: "exact", from: "/products/ghk-cu-copper-tripeptide-lab-reference-compound", to: "/products/ghk-cu-copper-peptide" },
  { type: "exact", from: "/products/mots-c-mitochondrial-peptide-lab-reference-compound", to: "/products/mots-c" },
  { type: "exact", from: "/products/melanotan-ii-laboratory-research-compound-research", to: "/products/mt-2-melanotan-ii" },
  { type: "exact", from: "/products/nad-nicotinamide-adenine-dinucleotide", to: "/products/nad-plus" },
  { type: "exact", from: "/products/klow-blend-laboratory-reference-blend-research-use", to: "/products/klow-blend" },

  // Discontinued products → redirect to catalogue (better than 404 for SEO).
  { type: "exact", from: "/products/hexarelin", to: "/products" },
  { type: "exact", from: "/products/mod-grf-1-29", to: "/products" },
  { type: "exact", from: "/products/follistatin-344", to: "/products" },
];

/**
 * Returns a destination path (with leading slash) for a legacy URL,
 * or null if the path is not a known legacy URL.
 */
export function resolveLegacyRedirect(pathname: string): string | null {
  // Normalise trailing slash (except root)
  const clean =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  for (const rule of RULES) {
    if (rule.type === "exact" && clean === rule.from) return rule.to;
    if (rule.type === "prefix" && clean.startsWith(rule.from)) {
      const tail = clean.slice(rule.from.length);
      return rule.to + tail;
    }
  }
  return null;
}
