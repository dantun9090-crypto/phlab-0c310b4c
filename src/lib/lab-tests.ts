/**
 * Shared (client-safe) types + helpers for the lab-test verification system.
 *
 * Data lives in Lovable Cloud table `lab_tests`. Public reads go through the
 * browser Supabase client (RLS: only `is_public = true` rows). All writes go
 * through `lab-tests.functions.ts`, which verifies a Firebase admin ID token.
 *
 * NOTE (links): `/verify` is a NEW route. No existing product URL, slug,
 * canonical, JSON-LD link or merchant-feed link is touched by this feature.
 */

export interface LabTest {
  id: string;
  product: string;
  label_mg: string | null;
  batch: string | null;
  cap_color: string | null;
  test_date: string | null;
  mass_1: number | null;
  purity_1: number | null;
  mass_2: number | null;
  purity_2: number | null;
  avg_mass: number | null;
  avg_purity: number | null;
  test_link: string | null;
  lab_source: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export type LabTestInput = Omit<
  LabTest,
  'id' | 'avg_mass' | 'avg_purity' | 'created_at' | 'updated_at'
> & { id?: string };

export const SITE_ORIGIN = 'https://phlabs.co.uk';

/** Canonical product keys stored in `lab_tests.product` (shop range only). */
export const SHOP_LAB_PRODUCTS = [
  'RETATRUTIDE',
  'TIRZEPATIDE',
  'KPV',
  'MOTS-C',
  'BPC-157',
  'TB-500',
  'PT-141',
  'NAD+',
  'GHK-CU',
  'GLOW',
  'KLOW',
  'MELANOTAN 2',
  'BACTERIOSTATIC WATER',
] as const;

export type ShopLabProduct = (typeof SHOP_LAB_PRODUCTS)[number];

/** Display names used in the shop, keyed by canonical product key. */
export const SHOP_LAB_PRODUCT_LABELS: Record<string, string> = {
  RETATRUTIDE: 'Retatrutide',
  TIRZEPATIDE: 'Tirzepatide',
  KPV: 'KPV Tripeptide',
  'MOTS-C': 'MOTS-C',
  'BPC-157': 'BPC-157',
  'TB-500': 'TB-500 (Thymosin Beta-4)',
  'PT-141': 'PT-141 (Bremelanotide)',
  'NAD+': 'NAD+',
  'GHK-CU': 'GHK-Cu (Copper Peptide)',
  GLOW: 'GLOW Blend',
  KLOW: 'KLOW Blend',
  'MELANOTAN 2': 'MT-2 (Melanotan II)',
  'BACTERIOSTATIC WATER': 'Bacteriostatic Water',
};

/**
 * Aliases seen in supplier test sheets / shop product names → canonical key.
 * Keys are compared upper-cased with punctuation collapsed.
 */
const PRODUCT_ALIASES: Record<string, ShopLabProduct> = {
  RETATRUTIDE: 'RETATRUTIDE',
  RETA: 'RETATRUTIDE',
  TIRZEPATIDE: 'TIRZEPATIDE',
  TIRZE: 'TIRZEPATIDE',
  KPV: 'KPV',
  'KPV TRIPEPTIDE': 'KPV',
  'MOTS-C': 'MOTS-C',
  'MOTS C': 'MOTS-C',
  MOTSC: 'MOTS-C',
  'BPC-157': 'BPC-157',
  BPC157: 'BPC-157',
  'BPC 157': 'BPC-157',
  'TB-500': 'TB-500',
  TB500: 'TB-500',
  'TB-500 (TB4)': 'TB-500',
  'TB-500 TB4': 'TB-500',
  'THYMOSIN BETA-4': 'TB-500',
  'TB-500 (THYMOSIN BETA-4)': 'TB-500',
  'PT-141': 'PT-141',
  PT141: 'PT-141',
  BREMELANOTIDE: 'PT-141',
  'PT-141 (BREMELANOTIDE)': 'PT-141',
  'NAD+': 'NAD+',
  NAD: 'NAD+',
  'GHK-CU': 'GHK-CU',
  GHKCU: 'GHK-CU',
  'GHK-CU (COPPER PEPTIDE)': 'GHK-CU',
  GLOW: 'GLOW',
  'GLOW BLEND': 'GLOW',
  'GLOW (GHK-CU/BPC-157/TB-500)': 'GLOW',
  KLOW: 'KLOW',
  'KLOW BLEND': 'KLOW',
  'MELANOTAN 2': 'MELANOTAN 2',
  'MELANOTAN II': 'MELANOTAN 2',
  MT2: 'MELANOTAN 2',
  'MT-2': 'MELANOTAN 2',
  'MT-2 (MELANOTAN II)': 'MELANOTAN 2',
  'BACTERIOSTATIC WATER': 'BACTERIOSTATIC WATER',
  'BAC WATER': 'BACTERIOSTATIC WATER',
};

function normaliseKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.\u2019']/g, '')
    .trim();
}

/**
 * Map a raw supplier/shop product name to a canonical shop product key.
 * Returns null for products outside the shop range (they are not imported).
 */
export function toShopProductKey(raw: string | null | undefined): ShopLabProduct | null {
  if (!raw) return null;
  const key = normaliseKey(raw);
  if (PRODUCT_ALIASES[key]) return PRODUCT_ALIASES[key];
  // Try without any parenthetical suffix, e.g. "TB-500 (TB4)".
  const stripped = normaliseKey(key.replace(/\(.*?\)/g, ''));
  if (PRODUCT_ALIASES[stripped]) return PRODUCT_ALIASES[stripped];
  return null;
}

export type PurityTier = 'high' | 'mid' | 'low' | 'unknown';

export function purityTier(purity: number | null | undefined): PurityTier {
  if (purity == null || Number.isNaN(purity)) return 'unknown';
  if (purity >= 99) return 'high';
  if (purity >= 98) return 'mid';
  return 'low';
}

export const PURITY_TIER_CLASS: Record<PurityTier, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  mid: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-red-500/15 text-red-300 border-red-500/40',
  unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
};

export const LAB_SOURCES = ['Janoshik', 'Chromate', 'CuriousChems'] as const;

export const LAB_SOURCE_CLASS: Record<string, string> = {
  Janoshik: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  Chromate: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  CuriousChems: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
};

/** Infer the analytical lab from the report URL host. */
export function inferLabSource(link: string | null | undefined): string | null {
  if (!link) return null;
  const l = link.toLowerCase();
  if (l.includes('janoshik')) return 'Janoshik';
  if (l.includes('chromate')) return 'Chromate';
  if (l.includes('curiouschems') || l.includes('curious')) return 'CuriousChems';
  return null;
}

export function verifyBatchUrl(batch: string): string {
  return `${SITE_ORIGIN}/verify?batch=${encodeURIComponent(batch)}`;
}

export function verifyProductUrl(product: string): string {
  return `${SITE_ORIGIN}/verify?product=${encodeURIComponent(product)}`;
}

export function formatPurity(purity: number | null | undefined): string {
  return purity == null ? '—' : `${Number(purity).toFixed(2)}%`;
}

export function formatMass(mass: number | null | undefined): string {
  return mass == null ? '—' : `${Number(mass).toFixed(2)} mg`;
}

export function formatTestDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Ready-to-paste summary block for customer support replies. */
export function formatTestSummary(test: LabTest): string {
  const label = test.label_mg ? ` ${test.label_mg}mg` : '';
  const lines = [
    `${SHOP_LAB_PRODUCT_LABELS[test.product] ?? test.product}${label} — Batch ${test.batch ?? 'n/a'}`,
    `Purity: ${formatPurity(test.avg_purity)} | Test date: ${formatTestDate(test.test_date)}`,
  ];
  if (test.test_link) lines.push(`Lab report: ${test.test_link}`);
  if (test.batch) lines.push(`Verify: ${verifyBatchUrl(test.batch)}`);
  lines.push('For Research Use Only. Not for Human Consumption.');
  return lines.join('\n');
}

/** Parse "99.369%" / "99,369" / 99.369 → 99.369, rejecting out-of-range values. */
export function parsePurity(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export function parseMass(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Accepts MM/DD/YY, MM/DD/YYYY and YYYY-MM-DD → ISO `YYYY-MM-DD`. */
export function parseTestDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (us) {
    const month = us[1]!.padStart(2, '0');
    const day = us[2]!.padStart(2, '0');
    let year = us[3]!;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return null;
}

export const CSV_TEMPLATE_HEADERS = [
  'product',
  'label_mg',
  'batch',
  'cap_color',
  'test_date',
  'mass_1',
  'purity_1',
  'mass_2',
  'purity_2',
  'test_link',
  'lab_source',
] as const;

export function csvTemplate(): string {
  return [
    CSV_TEMPLATE_HEADERS.join(','),
    'TIRZEPATIDE,30,ZE300902,BLACK/GOLD,2025-09-15,29.66,99.79,,,https://janoshik.com/tests/00000-example,Janoshik',
  ].join('\n');
}
