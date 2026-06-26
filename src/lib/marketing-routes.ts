/**
 * Single source of truth for the marketing-/SEO-critical routes that the
 * GSC coverage report, Googlebot regression test, and daily SEO health cron
 * all monitor. Keep in sync with src/routes/sitemap[.]xml.ts.
 */

export interface MarketingRoute {
  path: string;
  label: string;
  /** Lower bound on Googlebot-rendered HTML byte length. */
  minBytes: number;
  /** Upper bound on Googlebot-rendered HTML byte length. */
  maxBytes: number;
  /** Substring required in <title>. */
  titleContains?: string;
  /** Tier — used by the daily cron to decide alert priority. */
  tier: 'critical' | 'high' | 'normal';
}

export const MARKETING_ROUTES: MarketingRoute[] = [
  { path: '/', label: 'Home', minBytes: 50_000, maxBytes: 800_000, titleContains: 'PH Labs', tier: 'critical' },
  { path: '/products', label: 'Products', minBytes: 20_000, maxBytes: 800_000, titleContains: 'PH Labs', tier: 'critical' },
  { path: '/compound', label: 'Compound (premium landing)', minBytes: 15_000, maxBytes: 500_000, titleContains: 'PH Labs', tier: 'high' },
  { path: '/landing/phlabs', label: 'Editorial landing', minBytes: 10_000, maxBytes: 500_000, titleContains: 'PH Labs', tier: 'high' },
  { path: '/research', label: 'Research hub', minBytes: 8_000, maxBytes: 500_000, tier: 'high' },
  { path: '/resources', label: 'Resources index', minBytes: 8_000, maxBytes: 500_000, tier: 'high' },
  { path: '/resources/bpc-157-tissue-repair', label: 'Article: BPC-157', minBytes: 8_000, maxBytes: 500_000, tier: 'high' },
  { path: '/resources/ipamorelin-ghrp-research', label: 'Article: Ipamorelin', minBytes: 8_000, maxBytes: 500_000, tier: 'high' },
  { path: '/resources/tirzepatide-vs-retatrutide-research', label: 'Article: Tirzepatide vs Retatrutide', minBytes: 8_000, maxBytes: 500_000, tier: 'high' },
  { path: '/products/retatrutide-research-peptide', label: 'Product: Retatrutide', minBytes: 20_000, maxBytes: 800_000, titleContains: 'Retatrutide', tier: 'critical' },
  { path: '/products/tirzepatide-research-peptide', label: 'Product: Tirzepatide', minBytes: 20_000, maxBytes: 800_000, titleContains: 'Tirzepatide', tier: 'critical' },
  { path: '/products/bpc-157', label: 'Product: BPC-157', minBytes: 20_000, maxBytes: 800_000, titleContains: 'BPC', tier: 'high' },
  { path: '/products/tb-500-thymosin-beta-4', label: 'Product: TB-500', minBytes: 20_000, maxBytes: 800_000, titleContains: 'TB-500', tier: 'high' },
  { path: '/products/kpv-research-peptide', label: 'Product: KPV', minBytes: 20_000, maxBytes: 800_000, titleContains: 'KPV', tier: 'high' },
  { path: '/products/melanotan-ii-research-peptide', label: 'Product: Melanotan-II', minBytes: 20_000, maxBytes: 800_000, titleContains: 'Melanotan', tier: 'high' },
  { path: '/about', label: 'About', minBytes: 8_000, maxBytes: 500_000, tier: 'normal' },
  { path: '/contact', label: 'Contact', minBytes: 8_000, maxBytes: 500_000, tier: 'normal' },
];

export const CANONICAL_ORIGIN = 'https://phlabs.co.uk';

export const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export function fullUrl(path: string): string {
  return `${CANONICAL_ORIGIN}${path}`;
}
