/**
 * GA4 Measurement Protocol — server-side `purchase` backfill.
 *
 * Why: the browser fires the GA4/Ads purchase event on /checkout/success,
 * but bank-app redirects sometimes strand the customer (they pay, never
 * return, the client event never fires). The Wallid reconcile cron calls
 * this for paid orders older than 2h that have no `gaClientPurchaseAt`
 * marker, so GA4 / Google Ads still record the conversion.
 *
 * Dedup contract (order doc fields — either one suppresses the backfill):
 *   gaClientPurchaseAt — set by /api/payments/status when it hands the
 *                        tracking payload to a verified owner (or when the
 *                        success page acks with purchaseFired:true).
 *   gaMpPurchaseAt     — set by the reconcile cron after a successful send.
 *
 * Attribution note: MP events have no gclid/_ga cookie, so GA4 attributes
 * them to a synthetic `server.<orderId>` client. They count in GA4
 * monetization + key events and flow into the linked Ads conversion, but
 * with weaker campaign attribution than the browser event — this is the
 * safety net, not the primary path.
 *
 * Env:
 *   GA4_MP_API_SECRET  — GA4 Admin → Data Streams → web stream →
 *                        Measurement Protocol API secrets. REQUIRED;
 *                        when unset the backfill no-ops with a warning.
 *   GA4_MEASUREMENT_ID — optional, defaults to G-5HM4YT7HDW.
 *
 * SERVER ONLY — lives in lib/server, blocked from client bundles.
 */
import { merchantItemId } from "@/lib/merchant-item-id";

const DEFAULT_MEASUREMENT_ID = "G-5HM4YT7HDW";
const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function sendGa4MpPurchase(
  orderId: string,
  order: Record<string, unknown>,
): Promise<boolean> {
  const apiSecret = process.env.GA4_MP_API_SECRET;
  if (!apiSecret) {
    console.warn("[ga4-mp] GA4_MP_API_SECRET not set — purchase backfill disabled");
    return false;
  }
  const measurementId = process.env.GA4_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;

  const value = num(order.total ?? order.totalAmount ?? order.totalPrice ?? order.amount);
  if (!(value > 0)) return false;

  const rawItems = Array.isArray(order.items)
    ? (order.items as Array<Record<string, unknown>>)
    : [];
  const items = rawItems.map((it) => ({
    item_id: merchantItemId(it.id ?? it.productId ?? it.sku ?? it.slug ?? ""),
    item_name: String(it.name ?? it.title ?? "Item"),
    ...(it.variantName || it.variant
      ? { item_variant: String(it.variantName ?? it.variant) }
      : {}),
    price: num(it.priceNum ?? it.price),
    quantity: num(it.quantity ?? 1) || 1,
  }));

  // Backdate to paidAt so late sends land on the real purchase day.
  // GA4 accepts timestamps up to 72h in the past — the cron window matches.
  const paidAtRaw = order.paidAt as unknown;
  const paidAt =
    paidAtRaw instanceof Date
      ? paidAtRaw
      : typeof paidAtRaw === "string" || typeof paidAtRaw === "number"
        ? new Date(paidAtRaw)
        : null;
  const timestampMicros =
    paidAt && Number.isFinite(paidAt.getTime()) ? paidAt.getTime() * 1000 : undefined;

  const payload: Record<string, unknown> = {
    client_id: `server.${orderId}`,
    ...(timestampMicros ? { timestamp_micros: timestampMicros } : {}),
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: orderId,
          value,
          currency: "GBP",
          tax: num(order.vatAmount ?? order.tax),
          shipping: num(order.shippingCost ?? order.shippingTotal),
          items,
        },
      },
    ],
  };

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8_000);
    const res = await fetch(
      `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      },
    ).finally(() => clearTimeout(timer));
    if (!res.ok) {
      console.warn(`[ga4-mp] purchase backfill for ${orderId}: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      `[ga4-mp] purchase backfill for ${orderId}:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}
