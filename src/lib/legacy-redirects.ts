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

  // check-domains-allow-next-line: nazwa starej domeny tylko w komentarzu
  // Legacy long product slugs from prohealthpeptides.co.uk → current slugs.
  // Googlebot still has these indexed; 301 here so we don't waste crawl budget
  // on a 404 page rendered through Prerender.io.
  { type: "exact", from: "/products/tirzepatide-research-reference-compound-for-lab-use", to: "/products/tirzepatide-synthetic-peptide-analytical-standard-99-hplc-cas-2023788-19-2-for-research-use-only-ruo" },
  { type: "exact", from: "/products/tirzepatide", to: "/products/tirzepatide-synthetic-peptide-analytical-standard-99-hplc-cas-2023788-19-2-for-research-use-only-ruo" },
  { type: "exact", from: "/products/retatrutide-laboratory-research-reference-compound", to: "/products/retatrutide-synthetic-peptide-analytical-standard-99-hplc-cas-2381089-83-2-for-research-use-only-ruo" },
  { type: "exact", from: "/products/retatrutide", to: "/products/retatrutide-synthetic-peptide-analytical-standard-99-hplc-cas-2381089-83-2-for-research-use-only-ruo" },
  { type: "exact", from: "/products/ghk-cu-copper-tripeptide-lab-reference-compound", to: "/products/ghk-cu-synthetic-tripeptide-copper-complex-analytical-standard-99-hplc-cas-89030-95-5-for-research-use-only-ruo" },
  { type: "exact", from: "/products/ghk-cu-copper-peptide", to: "/products/ghk-cu-synthetic-tripeptide-copper-complex-analytical-standard-99-hplc-cas-89030-95-5-for-research-use-only-ruo" },
  { type: "exact", from: "/products/mots-c-mitochondrial-peptide-lab-reference-compound", to: "/products/mots-c-synthetic-16-residue-peptide-analytical-standard-99-hplc-cas-1627580-64-6-for-research-use-only-ruo" },
  { type: "exact", from: "/products/mots-c", to: "/products/mots-c-synthetic-16-residue-peptide-analytical-standard-99-hplc-cas-1627580-64-6-for-research-use-only-ruo" },
  { type: "exact", from: "/products/melanotan-ii-laboratory-research-compound-research", to: "/products/melanotan-ii-synthetic-cyclic-heptapeptide-analytical-standard-99-hplc-cas-121062-08-6-for-research-use-only-ruo" },
  { type: "exact", from: "/products/mt-2-melanotan-ii", to: "/products/melanotan-ii-synthetic-cyclic-heptapeptide-analytical-standard-99-hplc-cas-121062-08-6-for-research-use-only-ruo" },
  { type: "exact", from: "/products/nad-nicotinamide-adenine-dinucleotide", to: "/products/nicotinamide-adenine-dinucleotide-nad-analytical-standard-99-hplc-cas-53-84-9-laboratory-reagent-for-research-use-only-ruo" },
  { type: "exact", from: "/products/nad-plus", to: "/products/nicotinamide-adenine-dinucleotide-nad-analytical-standard-99-hplc-cas-53-84-9-laboratory-reagent-for-research-use-only-ruo" },
  { type: "exact", from: "/products/klow-blend-laboratory-reference-blend-research-use", to: "/products" },
  { type: "exact", from: "/products/klow-blend", to: "/products" },
  { type: "exact", from: "/products/glow-blend", to: "/products" },
  { type: "exact", from: "/products/bpc-157", to: "/products/synthetic-pentadecapeptide-reference-material-10-mg-analytical-standard-99-hplc-cas-137525-51-0-for-in-vitro-research-use-only-ruo" },
  { type: "exact", from: "/products/kpv-tripeptide", to: "/products/kpv-synthetic-tripeptide-lys-pro-val-analytical-standard-99-hplc-cas-67727-97-3-for-research-use-only-ruo" },
  { type: "exact", from: "/products/pt-141-bremelanotide", to: "/products/pt-141-synthetic-cyclic-heptapeptide-analytical-standard-99-hplc-cas-189691-06-3-for-research-use-only-ruo" },
  { type: "exact", from: "/products/bacteriostatic-water", to: "/products/bacteriostatic-water-0-9-benzyl-alcohol-laboratory-diluent-reagent-for-research-use-only-ruo" },
  { type: "exact", from: "/products/bacteriostatic-water-0-9-benzyl-alcohol-lab-diluent", to: "/products/bacteriostatic-water-0-9-benzyl-alcohol-laboratory-diluent-reagent-for-research-use-only-ruo" },
  { type: "exact", from: "/products/mt-2", to: "/products/melanotan-ii-synthetic-cyclic-heptapeptide-analytical-standard-99-hplc-cas-121062-08-6-for-research-use-only-ruo" },
  { type: "exact", from: "/products/nad-nicotinamide-adenine-dinucleotide-lab-use-only", to: "/products/nicotinamide-adenine-dinucleotide-nad-analytical-standard-99-hplc-cas-53-84-9-laboratory-reagent-for-research-use-only-ruo" },

  // Discontinued products → redirect to catalogue (better than 404 for SEO).
  { type: "exact", from: "/products/hexarelin", to: "/products" },
  { type: "exact", from: "/products/mod-grf-1-29", to: "/products" },
  { type: "exact", from: "/products/follistatin-344", to: "/products" },
  { type: "exact", from: "/products/cerebrolysin", to: "/products" },
  { type: "exact", from: "/products/cjc-1295", to: "/products" },
  { type: "exact", from: "/products/igf-1-lr3", to: "/products" },
  { type: "exact", from: "/products/ipamorelin", to: "/products" },
  { type: "exact", from: "/products/kisspeptin-10", to: "/products" },
  { type: "exact", from: "/products/oxytocin", to: "/products" },
  { type: "exact", from: "/products/selank", to: "/products" },
  { type: "exact", from: "/products/semax", to: "/products" },
  { type: "exact", from: "/products/semaglutide", to: "/products" },
  { type: "exact", from: "/products/tb-500", to: "/products" },
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

/**
 * Legacy Wegic template URLs that no longer exist and have no equivalent.
 * These should return HTTP 410 Gone so Google removes them from its crawl
 * queue (vs the current SPA render that confuses crawlers into "Discovered –
 * currently not indexed").
 */
const GONE_PREFIXES = [
  "/blog-single-page-layout/",
  "/jobs-1-item/",
  "/jobs-1/",
  "/jobs-list/",
  "/job-detail/",
  "/team-1-item/",
  "/team-1/",
  "/project-1-item/",
  "/project-1/",
  "/portfolio-1-item/",
  "/portfolio-1/",
  "/service-1-item/",
  "/service-1/",
  "/feature-1-item/",
  "/feature-1/",
  "/news-1-item/",
  "/news-1/",
  "/event-1-item/",
  "/event-1/",
  "/testimonial-1-item/",
  "/case-study-1-item/",
];

const GONE_EXACT = new Set<string>([
  "/blog-single-page-layout",
  "/jobs-1-item",
  "/jobs-1",
  "/team-1",
  "/project-1",
  "/portfolio-1",
  "/service-1",
  "/feature-1",
  "/news-1",
  "/event-1",
]);

/**
 * Returns true when the path is a known dead Wegic template URL that should
 * be answered with HTTP 410 Gone.
 */
export function isGoneLegacyPath(pathname: string): boolean {
  const clean =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (GONE_EXACT.has(clean)) return true;
  return GONE_PREFIXES.some((p) => clean.startsWith(p));
}

