/**
 * Pure aggregation for the Admin → Ads Insights report (shared by the server
 * function and tests). No I/O.
 */
import { PRODUCT_ID_TO_SLUG } from "@/lib/product-id-slug-map";

/** Statuses the shop treats as paid (same set as the Revenue tab). */
export const PAID_STATUSES = new Set(["paid", "processing", "shipped", "delivered", "completed"]);
export const TOP_N = 15;
const DAY_MS = 24 * 60 * 60_000;

export interface ProductInsightRow {
  productId: string;
  name: string;
  url: string;
  currentPrice: number | null;
  unitsSold: number;
  revenue: number;
  orders: number;
  adOrders: number;
  adOrderPct: number;
  adRevenue: number;
}

export interface InsightWindow {
  days: number;
  paidOrders: number;
  adOrders: number;
  revenue: number;
  rows: ProductInsightRow[];
}

export interface AdsInsightsReport {
  generatedAt: string;
  windows: InsightWindow[];
}

interface ProductLite { id: string; name: string; slug: string; price: number }
type OrderDoc = Record<string, unknown> & { id: string };

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "string") return Date.parse(v) || 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const s = Number(o.seconds ?? o._seconds);
    if (Number.isFinite(s)) return s * 1000;
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** True when the order carries a Google Ads click id (gclid or gbraid). */
export function hasAdClick(order: Record<string, unknown>): boolean {
  const ids = (order.adClickIds ?? {}) as Record<string, unknown>;
  return Boolean(str(ids.gclid) || str(ids.gbraid) || str(order.gclid) || str(order.gbraid));
}

/** Paid, non-test order. */
export function isCountableOrder(order: Record<string, unknown>): boolean {
  if (order.isTest === true || order.testOrder === true || order.test === true) return false;
  return PAID_STATUSES.has(str(order.status).toLowerCase());
}

/** Aggregate paid orders into top-N product tables for 30 and 90 days. */
export function aggregateAdsInsights(
  orders: OrderDoc[],
  products: ProductLite[],
  now: number,
): AdsInsightsReport {
  const byId = new Map(products.map((p) => [p.id, p]));
  const windows = [30, 90].map((days): InsightWindow => {
    const cutoff = now - days * DAY_MS;
    const rows = new Map<string, ProductInsightRow>();
    let paidOrders = 0;
    let adOrdersTotal = 0;
    let revenueTotal = 0;
    for (const o of orders) {
      const t = toMillis(o.createdAt) || toMillis(o.orderDate);
      if (!t || t < cutoff || t > now || !isCountableOrder(o)) continue;
      const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
      if (!items.length) continue;
      const ad = hasAdClick(o);
      paidOrders++;
      if (ad) adOrdersTotal++;
      const seen = new Set<string>();
      for (const it of items) {
        const pid = str(it.productId) || str(it.productName);
        if (!pid) continue;
        const qty = Number(it.quantity) || 0;
        const line = Number(it.total ?? Number(it.price) * qty) || 0;
        revenueTotal += line;
        let row = rows.get(pid);
        if (!row) {
          const p = byId.get(pid);
          const slug = p?.slug || PRODUCT_ID_TO_SLUG[pid] || pid;
          row = {
            productId: pid,
            name: p?.name || str(it.productName) || pid,
            url: `/products/${slug}`,
            currentPrice: p && Number.isFinite(p.price) ? p.price : null,
            unitsSold: 0, revenue: 0, orders: 0, adOrders: 0, adOrderPct: 0, adRevenue: 0,
          };
          rows.set(pid, row);
        }
        row.unitsSold += qty;
        row.revenue += line;
        if (ad) row.adRevenue += line;
        if (!seen.has(pid)) {
          seen.add(pid);
          row.orders++;
          if (ad) row.adOrders++;
        }
      }
    }
    const list = [...rows.values()]
      .map((r) => ({ ...r, adOrderPct: r.orders ? (r.adOrders / r.orders) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, TOP_N);
    return { days, paidOrders, adOrders: adOrdersTotal, revenue: revenueTotal, rows: list };
  });
  return { generatedAt: new Date(now).toISOString(), windows };
}
