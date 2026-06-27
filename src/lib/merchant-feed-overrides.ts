/**
 * Server-only helpers for the editable Google Merchant Feed system.
 *
 * Four feed keys (one per public feed URL × host):
 *   phlabs_paid       — phlabs.co.uk/google-merchant-feed.xml
 *   phlabs_free       — phlabs.co.uk/google-merchant-feed-free.xml
 *   prohealth_paid    — prohealthpeptides.co.uk/google-merchant-feed.xml
 *   prohealth_free    — prohealthpeptides.co.uk/google-merchant-feed-free.xml
 *
 * Each key has:
 *   - a global config doc in /merchantFeedConfig/{feedKey}
 *   - per-product overrides in /merchantFeedOverrides_{feedKey}/{productId}
 *
 * Defaults mirror the live route code so the feed is identical until an
 * admin actually changes something.
 *
 * NEVER import this file from client bundles — uses service-account
 * Firestore writes.
 */
import { getDocAdmin, listDocsAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";

export const FEED_KEYS = [
  "phlabs_paid",
  "phlabs_free",
  "prohealth_paid",
  "prohealth_free",
] as const;
export type FeedKey = (typeof FEED_KEYS)[number];

export const FEED_LABELS: Record<FeedKey, string> = {
  phlabs_paid: "phlabs.co.uk · paid (Shopping Ads + Free)",
  phlabs_free: "phlabs.co.uk · free listings only",
  prohealth_paid: "prohealthpeptides.co.uk · paid",
  prohealth_free: "prohealthpeptides.co.uk · free listings only",
};

export const FEED_URLS: Record<FeedKey, string> = {
  phlabs_paid: "https://phlabs.co.uk/google-merchant-feed.xml",
  phlabs_free: "https://phlabs.co.uk/google-merchant-feed-free.xml",
  prohealth_paid: "https://prohealthpeptides.co.uk/google-merchant-feed.xml",
  prohealth_free: "https://prohealthpeptides.co.uk/google-merchant-feed-free.xml",
};

export function feedKeyFromRequest(
  host: string,
  feedType: "paid" | "free",
): FeedKey {
  const h = host.toLowerCase();
  const isProhealth = h.includes("prohealthpeptides");
  if (feedType === "free") return isProhealth ? "prohealth_free" : "phlabs_free";
  return isProhealth ? "prohealth_paid" : "phlabs_paid";
}

export interface SkuOverride {
  code: string;
  displayName: string;
  cas: string;
  noSizePrefix?: boolean;
}

export interface MerchantFeedConfig {
  enabled: boolean;
  brand: string;
  currency: string;
  baseUrl: string;
  categoryId: string;
  categoryPath: string;
  productType: string;
  condition: "new" | "refurbished" | "used";
  identifierExists: "true" | "false";
  ageGroup: string;
  adult: "yes" | "no";
  titleTemplate: string;
  descriptionTemplate: string;
  disclaimers: string;
  promoIds: string[];
  shippingCountry: string;
  shippingService: string;
  shippingPrice: string;
  cacheTtl: number;
  bannedTokens: string[];
  hardBlockedSlugs: string[];
  highRiskTokens: string[];
  skuOverrides: Record<string, SkuOverride>;
  customLabel0: string;
  customLabel1: string;
  customLabel2: string;
  customLabel3: string;
  customLabel4: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ProductOverride {
  productId: string;
  included?: boolean | null;
  title?: string;
  description?: string;
  price?: number;
  image?: string;
  mpn?: string;
  gtin?: string;
  sku?: string;
  availability?: "in stock" | "out of stock" | "preorder" | "backorder";
  customLabel0?: string;
  customLabel1?: string;
  customLabel2?: string;
  customLabel3?: string;
  customLabel4?: string;
  updatedAt?: string;
}

const PAID_DEFAULT_SKU_OVERRIDES: Record<string, SkuOverride> = {
  "retatrutide-research-peptide": { code: "Reta-PHL", displayName: "Reta-PHL", cas: "2381089-83-2" },
  "bpc-157": { code: "PHL-RP09", displayName: "PHL-RP09", cas: "137525-51-0" },
  "pt-141-research-peptide": { code: "PHL-PT41", displayName: "PHL-PT41", cas: "189691-06-3" },
  "tb-500-thymosin-beta-4": { code: "PHL-TB54", displayName: "PHL-TB54", cas: "77591-33-4" },
  "mots-c-research-peptide": { code: "PHL-MC16", displayName: "PHL-MC16", cas: "1627580-64-6" },
  "kpv-research-peptide": { code: "PHL-KP3", displayName: "PHL-KP3", cas: "67727-97-3" },
  "glow-blend": { code: "PHL-GW4", displayName: "PHL-GW4", cas: "N/A" },
  "melanotan-ii-research-peptide": { code: "PHL-RP02", displayName: "MT - M2-", cas: "121062-08-6" },
  "bacteriostatic-water-research-compound": { code: "PHL-BW9", displayName: "PHL-BW9", cas: "7732-18-5" },
  "klow-blend": { code: "PHL-KW5", displayName: "PHL-KW5", cas: "N/A" },
  "ghk-cu-research-peptide": { code: "PHL-GC3", displayName: "PHL-GC3", cas: "49557-75-7" },
  "nad-research-compound": { code: "PHL-ND7", displayName: "PHL-ND7", cas: "53-84-9" },
};

function defaultsFor(feedKey: FeedKey): MerchantFeedConfig {
  const isProhealth = feedKey.startsWith("prohealth_");
  const isFree = feedKey.endsWith("_free");
  const baseUrl = isProhealth
    ? "https://prohealthpeptides.co.uk"
    : "https://phlabs.co.uk";
  return {
    enabled: true,
    brand: "PH Labs",
    currency: "GBP",
    baseUrl,
    categoryId: isFree ? "6975" : "3002",
    categoryPath: isFree
      ? "Business & Industrial > Science & Laboratory > Biochemicals"
      : "Business & Industrial > Science & Laboratory > Laboratory Chemicals",
    productType: isFree
      ? "Business & Industrial > Science & Laboratory > Biochemicals > Peptides"
      : "Business & Industrial > Science & Laboratory > Laboratory Chemicals",
    condition: "new",
    identifierExists: "false",
    ageGroup: "adult",
    adult: "no",
    titleTemplate: isFree
      ? "{name} {size} — Lyophilised Powder | HPLC 99% Purity | Research Compound | {brand} UK"
      : "{name} {size} — Analytical Reference Standard ({sku}) | {brand}",
    descriptionTemplate:
      "For laboratory and analytical research only. Strictly for in-vitro scientific testing and reference standards. HPLC ≥99% purity, Certificate of Analysis per batch.",
    disclaimers:
      "Strictly for in-vitro scientific testing and reference standards. NOT for human consumption, therapeutic or diagnostic use.",
    promoIds: isFree ? [] : ["PHL_LAUNCH"],
    shippingCountry: "GB",
    shippingService: "Standard",
    shippingPrice: "4.99",
    cacheTtl: 0,
    bannedTokens: [
      "treats", "cures", "heals", "medicine", "drug", "prescription",
      "human consumption", "injectable", "dosage", "weight loss",
      "anti-aging", "diabetes", "cancer", "clinical",
    ],
    hardBlockedSlugs: isFree
      ? ["tirzepatide-research-peptide", "tirzepatide"]
      : ["tirzepatide-research-peptide", "tirzepatide"],
    highRiskTokens: [
      "retatrutide", "bpc-157", "bpc157", "bpc 157",
      "tirzepatide", "semaglutide",
      "melanotan", "mt-2", "mt-ii", "mt2",
    ],
    skuOverrides: isFree ? {} : PAID_DEFAULT_SKU_OVERRIDES,
    customLabel0: "Laboratory Reference Standard",
    customLabel1: "In-Vitro Research Only",
    customLabel2: "HPLC ≥99% Purity",
    customLabel3: "UK Dispatch",
    customLabel4: "Lyophilised Powder",
  };
}

// ---------------------------------------------------------------------------
// In-process cache (per Worker isolate). 30 s TTL is short enough that admin
// edits land at next Google fetch, long enough to absorb back-to-back GMC
// crawl bursts without re-hitting Firestore for every <item>.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 30_000;
const configCache = new Map<FeedKey, { at: number; data: MerchantFeedConfig }>();
const overridesCache = new Map<FeedKey, { at: number; data: Map<string, ProductOverride> }>();

export function invalidateFeedCache(feedKey?: FeedKey): void {
  if (feedKey) {
    configCache.delete(feedKey);
    overridesCache.delete(feedKey);
  } else {
    configCache.clear();
    overridesCache.clear();
  }
}

export async function loadFeedConfig(feedKey: FeedKey): Promise<MerchantFeedConfig> {
  const cached = configCache.get(feedKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const defaults = defaultsFor(feedKey);
  let data: MerchantFeedConfig = defaults;
  try {
    const doc = await getDocAdmin("merchantFeedConfig", feedKey);
    if (doc) {
      data = { ...defaults, ...(doc as Partial<MerchantFeedConfig>) };
      // Normalise array fields that may have been stored as undefined.
      if (!Array.isArray(data.promoIds)) data.promoIds = defaults.promoIds;
      if (!Array.isArray(data.bannedTokens)) data.bannedTokens = defaults.bannedTokens;
      if (!Array.isArray(data.hardBlockedSlugs)) data.hardBlockedSlugs = defaults.hardBlockedSlugs;
      if (!Array.isArray(data.highRiskTokens)) data.highRiskTokens = defaults.highRiskTokens;
      if (!data.skuOverrides || typeof data.skuOverrides !== "object") {
        data.skuOverrides = defaults.skuOverrides;
      }
    }
  } catch {
    /* fall through to defaults */
  }
  configCache.set(feedKey, { at: Date.now(), data });
  return data;
}

export async function saveFeedConfig(
  feedKey: FeedKey,
  patch: Partial<MerchantFeedConfig>,
  updatedBy: string,
): Promise<MerchantFeedConfig> {
  const current = await loadFeedConfig(feedKey);
  const next: MerchantFeedConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  await updateDocAdmin("merchantFeedConfig", feedKey, next as unknown as Record<string, unknown>);
  configCache.set(feedKey, { at: Date.now(), data: next });
  return next;
}

function overridesCollection(feedKey: FeedKey): string {
  return `merchantFeedOverrides_${feedKey}`;
}

export async function loadFeedOverrides(feedKey: FeedKey): Promise<Map<string, ProductOverride>> {
  const cached = overridesCache.get(feedKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const out = new Map<string, ProductOverride>();
  try {
    const docs = await listDocsAdmin(overridesCollection(feedKey), { limit: 1000 });
    for (const d of docs) {
      const { id, ...rest } = d as Record<string, unknown> & { id: string };
      out.set(id, { ...(rest as Partial<ProductOverride>), productId: id });
    }
  } catch {
    /* empty map fallback */
  }
  overridesCache.set(feedKey, { at: Date.now(), data: out });
  return out;
}

export async function saveProductOverride(
  feedKey: FeedKey,
  productId: string,
  patch: Partial<ProductOverride>,
): Promise<void> {
  const data: Record<string, unknown> = {
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  delete (data as any).productId;
  await updateDocAdmin(overridesCollection(feedKey), productId, data);
  overridesCache.delete(feedKey);
}

export async function bulkSetInclusion(
  feedKey: FeedKey,
  productIds: string[],
  included: boolean,
): Promise<void> {
  for (const id of productIds) {
    await saveProductOverride(feedKey, id, { included });
  }
  overridesCache.delete(feedKey);
}

/**
 * Decide whether a product should appear at all. Combines global config +
 * per-product override. `included=true|false` from override always wins;
 * `included=null/undefined` falls back to the Firestore product flags +
 * global hard-block list.
 */
export function isProductAllowed(
  product: {
    name?: string;
    slug?: string;
    includeInMerchantFeed?: boolean;
    excludeFromMerchantFeed?: boolean;
  },
  override: ProductOverride | undefined,
  config: MerchantFeedConfig,
): boolean {
  if (!config.enabled) return false;
  if (override && override.included === true) return true;
  if (override && override.included === false) return false;
  if (product.excludeFromMerchantFeed === true) return false;
  const slug = (product.slug || "").toLowerCase();
  const name = (product.name || "").toLowerCase();
  if (config.hardBlockedSlugs.some((s) => s.toLowerCase() === slug)) return false;
  for (const t of config.hardBlockedSlugs) {
    if (t && name.includes(t.toLowerCase())) return false;
  }
  return product.includeInMerchantFeed === true;
}

export function scanBannedTokens(text: string, banned: string[]): string[] {
  const lower = (text || "").toLowerCase();
  return banned.filter((t) => t && lower.includes(t.toLowerCase()));
}

function cdataWrap(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}
function xmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Apply per-product overrides to an already-rendered `<item>` XML block.
 * Each override field is a tag-level substitution — missing fields are
 * left untouched. Safe to call with `undefined` override (no-op).
 */
export function applyOverrideToItem(itemXml: string, ov?: ProductOverride): string {
  if (!ov) return itemXml;
  let out = itemXml;
  const replaceTag = (tag: string, value: string, cdata = false) => {
    const re = new RegExp(`<${tag}(\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`);
    out = out.replace(re, `<${tag}>${cdata ? cdataWrap(value) : xmlAttr(value)}</${tag}>`);
  };
  const replaceGTag = (tag: string, value: string) => replaceTag(tag, value, false);
  if (ov.title) replaceTag("title", ov.title, true);
  if (ov.description) replaceTag("description", ov.description, true);
  if (typeof ov.price === "number" && ov.price > 0) {
    // first <g:price> is the item price; shipping inner price is inside <g:shipping>
    out = out.replace(
      /<g:price>[\s\S]*?<\/g:price>/,
      `<g:price>${ov.price.toFixed(2)} GBP</g:price>`,
    );
  }
  if (ov.image) replaceGTag("g:image_link", ov.image);
  if (ov.availability) replaceGTag("g:availability", ov.availability);
  if (ov.sku) {
    replaceGTag("g:sku", ov.sku);
    if (!ov.mpn) replaceGTag("g:mpn", ov.sku);
  }
  if (ov.mpn) replaceGTag("g:mpn", ov.mpn);
  if (ov.gtin) {
    if (/<g:gtin>/.test(out)) replaceGTag("g:gtin", ov.gtin);
    else out = out.replace(/<\/g:sku>/, `</g:sku>\n    <g:gtin>${xmlAttr(ov.gtin)}</g:gtin>`);
  }
  const labels: Array<[keyof ProductOverride, string]> = [
    ["customLabel0", "g:custom_label_0"],
    ["customLabel1", "g:custom_label_1"],
    ["customLabel2", "g:custom_label_2"],
    ["customLabel3", "g:custom_label_3"],
    ["customLabel4", "g:custom_label_4"],
  ];
  for (const [k, tag] of labels) {
    const v = ov[k] as string | undefined;
    if (!v) continue;
    if (new RegExp(`<${tag}>`).test(out)) replaceGTag(tag, v);
    else out = out.replace(/<\/item>/, `  <${tag}>${xmlAttr(v)}</${tag}>\n  </item>`);
  }
  return out;
}
