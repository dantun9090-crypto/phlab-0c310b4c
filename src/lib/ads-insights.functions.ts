/**
 * Admin-only "Ads Insights" report: top products from paid orders over the
 * last 30 / 90 days, with Google Ads click-id attribution share.
 * Read-only — aggregation runs server-side with service-account Firestore reads.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import { aggregateAdsInsights, type AdsInsightsReport } from "@/lib/ads-insights";

const Input = z.object({ idToken: z.string().min(10).max(4096) });

export const getAdsInsightsFn = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<AdsInsightsReport> => {
    await requireFirebaseAdmin(data.idToken);
    const { listDocsAdmin } = await import("@/lib/server/firestore-admin");
    const { fetchAllProducts } = await import("@/lib/firestore-rest");
    const now = Date.now();
    const since = new Date(now - 90 * 24 * 60 * 60_000);
    const [orders, products] = await Promise.all([
      listDocsAdmin("orders", { rangeFilter: { field: "createdAt", gte: since }, limit: 20_000 }),
      fetchAllProducts().catch(() => []),
    ]);
    return aggregateAdsInsights(orders, products, now);
  });
