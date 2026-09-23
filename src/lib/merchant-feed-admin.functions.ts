import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const IdTokenSchema = z.object({ idToken: z.string().min(10).max(4096) });

const FeedKeyEnum = z.enum([
  "phlabs_paid",
  "phlabs_free",
  "prohealth_paid",
  "prohealth_free",
]);

async function requireAdmin(idToken: string): Promise<string> {
  const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
  const claims = (await requireFirebaseAdmin(idToken)) as { uid?: string; email?: string };
  return claims.uid || claims.email || "admin";
}

// ---------------- read ----------------

const GetConfigSchema = IdTokenSchema.extend({ feedKey: FeedKeyEnum });

export const getMerchantFeedConfig = createServerFn({ method: "POST" })
  .validator((d) => GetConfigSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const { loadFeedConfig, loadFeedOverrides, FEED_URLS, FEED_LABELS } = await import(
      "@/lib/merchant-feed-overrides"
    );
    const config = await loadFeedConfig(data.feedKey);
    const overridesMap = await loadFeedOverrides(data.feedKey);
    return {
      feedKey: data.feedKey,
      label: FEED_LABELS[data.feedKey],
      url: FEED_URLS[data.feedKey],
      config,
      overrides: Array.from(overridesMap.values()),
    };
  });

// ---------------- save config ----------------

// Whitelist of writable feed-config fields. Anything else in the patch is
// dropped so a caller cannot inject arbitrary keys into the stored document.
const ConfigPatchSchema = z
  .object({
    enabled: z.boolean(),
    brand: z.string().max(200),
    currency: z.string().max(8),
    baseUrl: z.string().max(300),
    categoryId: z.string().max(100),
    categoryPath: z.string().max(300),
    productType: z.string().max(300),
    condition: z.enum(["new", "refurbished", "used"]),
    identifierExists: z.enum(["true", "false"]),
    ageGroup: z.string().max(40),
    adult: z.enum(["yes", "no"]),
    titleTemplate: z.string().max(1000),
    descriptionTemplate: z.string().max(5000),
    disclaimers: z.string().max(2000),
    promoIds: z.array(z.string().max(120)).max(50),
    shippingCountry: z.string().max(8),
    shippingService: z.string().max(120),
    shippingPrice: z.string().max(40),
    cacheTtl: z.number().int().min(0).max(86_400),
    bannedTokens: z.array(z.string().max(120)).max(500),
    hardBlockedSlugs: z.array(z.string().max(200)).max(500),
    highRiskTokens: z.array(z.string().max(120)).max(500),
    skuOverrides: z.record(z.string(), z.record(z.string(), z.unknown())),
    customLabel0: z.string().max(200),
    customLabel1: z.string().max(200),
    customLabel2: z.string().max(200),
    customLabel3: z.string().max(200),
    customLabel4: z.string().max(200),
  })
  .partial()
  .strip();

const SaveConfigSchema = IdTokenSchema.extend({
  feedKey: FeedKeyEnum,
  patch: ConfigPatchSchema,
});


export const saveMerchantFeedConfig = createServerFn({ method: "POST" })
  .validator((d) => SaveConfigSchema.parse(d))
  .handler(async ({ data }) => {
    const uid = await requireAdmin(data.idToken);
    const { saveFeedConfig } = await import("@/lib/merchant-feed-overrides");
    const { addDocAdmin } = await import("@/lib/server/firestore-admin");
    const next = await saveFeedConfig(data.feedKey, data.patch as any, uid);
    try {
      await addDocAdmin("auditLogs", {
        action: "merchant_feed_config_update",
        adminUid: uid,
        target: `merchantFeedConfig/${data.feedKey}`,
        patch: data.patch,
        timestamp: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
    return { ok: true, config: next };
  });

// ---------------- save product override ----------------

const SaveOverrideSchema = IdTokenSchema.extend({
  feedKey: FeedKeyEnum,
  productId: z.string().min(1).max(200),
  patch: z.object({
    included: z.boolean().nullable().optional(),
    title: z.string().max(500).optional(),
    description: z.string().max(5000).optional(),
    price: z.number().min(0).max(100000).optional(),
    image: z.string().url().max(2048).optional().or(z.literal("")),
    mpn: z.string().max(70).optional(),
    gtin: z.string().max(70).optional(),
    sku: z.string().max(70).optional(),
    availability: z.enum(["in stock", "out of stock", "preorder", "backorder"]).optional(),
    customLabel0: z.string().max(100).optional(),
    customLabel1: z.string().max(100).optional(),
    customLabel2: z.string().max(100).optional(),
    customLabel3: z.string().max(100).optional(),
    customLabel4: z.string().max(100).optional(),
  }),
});

export const saveMerchantFeedOverride = createServerFn({ method: "POST" })
  .validator((d) => SaveOverrideSchema.parse(d))
  .handler(async ({ data }) => {
    const uid = await requireAdmin(data.idToken);
    const { saveProductOverride } = await import("@/lib/merchant-feed-overrides");
    await saveProductOverride(data.feedKey, data.productId, data.patch as any);
    try {
      const { addDocAdmin } = await import("@/lib/server/firestore-admin");
      await addDocAdmin("auditLogs", {
        action: "merchant_feed_override_update",
        adminUid: uid,
        target: `merchantFeedOverrides_${data.feedKey}/${data.productId}`,
        patch: data.patch,
        timestamp: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
    return { ok: true };
  });

// ---------------- bulk inclusion toggle ----------------

const BulkSchema = IdTokenSchema.extend({
  feedKey: FeedKeyEnum,
  productIds: z.array(z.string().min(1).max(200)).min(1).max(500),
  included: z.boolean(),
});

export const bulkSetMerchantFeedInclusion = createServerFn({ method: "POST" })
  .validator((d) => BulkSchema.parse(d))
  .handler(async ({ data }) => {
    const uid = await requireAdmin(data.idToken);
    const { bulkSetInclusion } = await import("@/lib/merchant-feed-overrides");
    await bulkSetInclusion(data.feedKey, data.productIds, data.included);
    try {
      const { addDocAdmin } = await import("@/lib/server/firestore-admin");
      await addDocAdmin("auditLogs", {
        action: "merchant_feed_bulk_inclusion",
        adminUid: uid,
        target: `merchantFeedOverrides_${data.feedKey}`,
        count: data.productIds.length,
        included: data.included,
        timestamp: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
    return { ok: true };
  });

// ---------------- list all products (with override summary) ----------------

const ListProductsSchema = IdTokenSchema.extend({ feedKey: FeedKeyEnum });

export const listMerchantFeedProducts = createServerFn({ method: "POST" })
  .validator((d) => ListProductsSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const { fetchAllProducts } = await import("@/lib/firestore-rest");
    const { loadFeedOverrides, loadFeedConfig, isProductAllowed } = await import(
      "@/lib/merchant-feed-overrides"
    );
    const [products, overrides, config] = await Promise.all([
      fetchAllProducts(),
      loadFeedOverrides(data.feedKey),
      loadFeedConfig(data.feedKey),
    ]);
    return {
      products: products.map((p) => {
        const ov = overrides.get(p.id);
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          imageUrl: p.imageUrl,
          stock: p.stock,
          sku: p.sku,
          includeInMerchantFeed: p.includeInMerchantFeed,
          excludeFromMerchantFeed: p.excludeFromMerchantFeed,
          override: ov ?? null,
          willAppear: isProductAllowed(p as any, ov, config),
        };
      }),
    };
  });
