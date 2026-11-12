import { describe, expect, it } from "vitest";
import { aggregateAdsInsights } from "./ads-insights";

const NOW = Date.parse("2026-11-12T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const item = (productId: string, quantity: number, total: number) => ({ productId, productName: productId, quantity, total });

describe("aggregateAdsInsights", () => {
  it("counts only paid, non-test orders", () => {
    const r = aggregateAdsInsights([
      { id: "a", status: "delivered", createdAt: daysAgo(5), items: [item("p1", 1, 10)] },
      { id: "b", status: "cancelled", createdAt: daysAgo(5), items: [item("p1", 1, 10)] },
      { id: "c", status: "pending_payment", createdAt: daysAgo(5), items: [item("p1", 1, 10)] },
      { id: "d", status: "paid", isTest: true, createdAt: daysAgo(5), items: [item("p1", 1, 10)] },
    ], [], NOW);
    expect(r.windows[0].paidOrders).toBe(1);
    expect(r.windows[0].rows[0].revenue).toBe(10);
  });

  it("splits 30 vs 90 day windows", () => {
    const r = aggregateAdsInsights([
      { id: "a", status: "paid", createdAt: daysAgo(10), items: [item("p1", 1, 10)] },
      { id: "b", status: "paid", createdAt: daysAgo(60), items: [item("p1", 2, 20)] },
    ], [], NOW);
    expect(r.windows[0].rows[0].unitsSold).toBe(1);
    expect(r.windows[1].rows[0].unitsSold).toBe(3);
  });

  it("attributes gclid/gbraid orders and computes the share", () => {
    const r = aggregateAdsInsights([
      { id: "a", status: "paid", createdAt: daysAgo(1), adClickIds: { gbraid: "0AAAABDsyClyAGEG" }, items: [item("p1", 1, 30)] },
      { id: "b", status: "paid", createdAt: daysAgo(1), items: [item("p1", 1, 10)] },
    ], [], NOW);
    const row = r.windows[0].rows[0];
    expect(row.adOrderPct).toBe(50);
    expect(row.adRevenue).toBe(30);
  });

  it("returns at most 15 products ranked by revenue", () => {
    const orders = Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, status: "paid", createdAt: daysAgo(1), items: [item(`p${i}`, 1, i + 1)] }));
    const rows = aggregateAdsInsights(orders, [], NOW).windows[0].rows;
    expect(rows).toHaveLength(15);
    expect(rows[0].revenue).toBe(20);
  });
});
